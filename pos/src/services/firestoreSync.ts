import { db as dexieDb } from '../db/db';
import { db as firestore } from '../firebase/config';
import { 
    collection, 
    onSnapshot, 
    QuerySnapshot, 
    DocumentData,
    query,
    where,
    orderBy,
    limit 
} from 'firebase/firestore';
import Dexie from 'dexie';

// Flag to prevent sync loops: when we write Firestore data into Dexie,
// the Dexie hooks should NOT push it back to the sync queue.
// Using a counter instead of a boolean to handle concurrent snapshots correctly.
let _syncingDepth = 0;

export const isSyncingFromFirestore = () => _syncingDepth > 0;

// All syncable table/collection names (must match db.ts and Firestore collections)
const SYNCABLE_TABLES = [
    'customers', 'products', 'sales', 'expenses',
    'customerPayments', 'users', 'returns', 'returnedItems',
    'suppliers', 'purchases', 'departments', 'bankAccounts', 'cashBook',
    'supplierPayments'
];

// Store unsubscribe functions for cleanup
const unsubscribers: (() => void)[] = [];

/**
 * Recursively converts Firestore Timestamps to ISO strings
 * and ensures expected data structures (like arrays) are present.
 */
const normalizeFirestoreData = (data: any, tableName: string): any => {
    if (!data || typeof data !== 'object') return data;

    // Create a copy to avoid mutating the original
    const result = { ...data };

    // 1. Convert Timestamps to ISO Strings (Dexie prefers strings for sorting/indexing)
    for (const key in result) {
        const val = result[key];
        if (val && typeof val === 'object') {
            // Check if it's a Firestore Timestamp (has seconds and nanoseconds)
            if (typeof val.toDate === 'function') {
                result[key] = val.toDate().toISOString();
            } else if (val._seconds !== undefined || val.seconds !== undefined) {
                // Handle raw timestamp structure if toDate() isn't present
                const seconds = val.seconds ?? val._seconds;
                const nanoseconds = val.nanoseconds ?? val._nanoseconds ?? 0;
                result[key] = new Date(seconds * 1000 + nanoseconds / 1000000).toISOString();
            } else if (Array.isArray(val)) {
                result[key] = val.map(item => normalizeFirestoreData(item, tableName));
            } else if (!(val instanceof Date)) {
                result[key] = normalizeFirestoreData(val, tableName);
            }
        }
    }

    // 2. Table-specific defaults (ensure arrays exist)
    if ((tableName === 'sales' || tableName === 'purchases' || tableName === 'returns') && !result.items) {
        result.items = [];
    }

    // Ensure all sales have finalAmount
    if (tableName === 'sales' && result.finalAmount === undefined) {
        result.finalAmount = result.totalAmount || 0;
    }

    return result;
};

const applyFirestoreSnapshot = async (
    tableName: string,
    snapshot: QuerySnapshot<DocumentData>
) => {
    const table = dexieDb.table(tableName);
    const changes = snapshot.docChanges();

    if (changes.length === 0) return;

    // Increment the guard counter
    _syncingDepth++;

    try {
        // We use a raw transaction to bypass hooks
        await dexieDb.transaction('rw', table, async () => {
            for (const change of changes) {
                const docId = change.doc.id;

                if (change.type === 'removed') {
                    await table.delete(docId);
                    continue;
                }

                // Added or Modified
                const remoteDoc = normalizeFirestoreData({ id: docId, ...change.doc.data() }, tableName);

                try {
                    const localDoc = await table.get(docId);

                    if (localDoc) {
                        // Compare updated_at: only overwrite if remote is newer or equal
                        const localTime = localDoc.updated_at ? new Date(localDoc.updated_at).getTime() : 0;
                        const remoteTime = remoteDoc.updated_at ? new Date(remoteDoc.updated_at).getTime() : 0;

                        if (remoteTime >= localTime) {
                            // Use Dexie's internal put to bypass hooks
                            await table.put(remoteDoc);
                        }
                    } else {
                        // No local version — insert
                        await table.put(remoteDoc);
                    }
                } catch (err) {
                    console.warn(`[FirestoreSync] Error syncing doc ${docId} in ${tableName}:`, err);
                }
            }
        });
    } finally {
        _syncingDepth--;
    }
};

/**
 * Start real-time listeners on all Firestore collections.
 * Each listener writes incoming changes into the corresponding Dexie table.
 * Uses a Delta Sync strategy: only fetches documents updated after the last local record.
 */
export const startFirestoreListeners = () => {
    // Clean up any existing listeners first
    stopFirestoreListeners();

    console.log('[FirestoreSync] Starting real-time delta-listeners for', SYNCABLE_TABLES.length, 'collections');

    for (const tableName of SYNCABLE_TABLES) {
        // Use an IIFE to handle the async timestamp lookup
        (async () => {
            try {
                const table = dexieDb.table(tableName);
                
                // 1. Find the most recently updated document in our local Dexie DB
                const lastDoc = await table.orderBy('updated_at').last();
                
                // If we have data, we start from that timestamp. 
                // If not, we fetch everything (starting from 1970).
                const lastTimestamp = lastDoc?.updated_at || '1970-01-01T00:00:00.000Z';

                const colRef = collection(firestore, tableName);
                
                // 2. Create a query that only listens for changes since our last sync.
                // We remove orderBy to simplify index requirements (single-field index is enough).
                // We add a limit to prevent massive read spikes if the local DB is far behind.
                const q = query(
                    colRef,
                    where('updated_at', '>=', lastTimestamp),
                    limit(1000) 
                );

                const unsubscribe = onSnapshot(
                    q,
                    (snapshot) => {
                        applyFirestoreSnapshot(tableName, snapshot).catch(err => {
                            console.error(`[FirestoreSync] Error applying snapshot for ${tableName}:`, err);
                        });
                    },
                    (error) => {
                        // If we get an index error or other failure, fallback to a full listener
                        // but log it clearly so we can debug.
                        if (error.code === 'failed-precondition') {
                            console.error(`[FirestoreSync] Index required for ${tableName} range query. Falling back to full listener. Reads will be HIGH.`);
                            const fallbackUnsub = onSnapshot(colRef, (s) => applyFirestoreSnapshot(tableName, s));
                            unsubscribers.push(fallbackUnsub);
                        } else {
                            console.error(`[FirestoreSync] Listener error for ${tableName}:`, error);
                        }
                    }
                );

                unsubscribers.push(unsubscribe);
            } catch (err) {
                console.error(`[FirestoreSync] Failed to set up listener for ${tableName}:`, err);
            }
        })();
    }
};

/**
 * Stop all Firestore listeners.
 */
export const stopFirestoreListeners = () => {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers.length = 0;
    console.log('[FirestoreSync] All listeners stopped');
};
