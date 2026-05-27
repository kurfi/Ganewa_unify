import { db as dexieDb } from '../db/db';
import { db as firestoreDb } from '../firebase/config';
import { doc, setDoc } from 'firebase/firestore';

// Must match the tables defined in db.ts and firestoreSync.ts
const SYNCABLE_TABLES = [
    'customers', 'products', 'sales', 'expenses',
    'customerPayments', 'users', 'returns', 'returnedItems',
    'suppliers', 'purchases', 'departments', 'bankAccounts', 'cashBook',
    'supplierPayments'
] as const;

let _isSyncing = false;

/**
 * Sweeps every syncable Dexie table for records where synced === 0
 * and pushes them to their matching Firestore collection.
 *
 * - On success  → marks the local record synced = 1
 * - On failure  → leaves synced = 0 so the next call retries
 *
 * This is a safety-net sweep that works alongside the existing syncService
 * queue mechanism. It handles records that may already be in tables but
 * were never queued (e.g. created before hooks ran, or queue was cleared).
 */
export const runSync = async (): Promise<void> => {
    if (_isSyncing) return;
    if (!navigator.onLine) return;

    _isSyncing = true;
    let totalPushed = 0;
    let totalFailed = 0;

    try {
        for (const tableName of SYNCABLE_TABLES) {
            try {
                const table = dexieDb.table(tableName);
                const pending = await table.where('synced').equals(0).toArray();

                if (pending.length === 0) continue;

                for (const record of pending) {
                    const id: string = record.id;
                    if (!id) continue;

                    try {
                        const payload = { ...record };
                        // Remove local-only fields that Firestore doesn't need
                        delete payload.id;
                        delete payload.synced;

                        const docRef = doc(firestoreDb, tableName, id);
                        await setDoc(docRef, payload, { merge: true });

                        // Mark as synced locally
                        await table.update(id, { synced: 1 });
                        totalPushed++;
                    } catch (err) {
                        // Leave synced = 0 — will be retried next time
                        totalFailed++;
                        // Only warn, don't break the loop
                        console.warn(`[SyncManager] Failed to sync ${tableName}/${id}:`, err);
                    }
                }
            } catch (tableErr) {
                // Table may not have the synced index yet (before schema migration)
                // — silently skip rather than crashing the whole sweep
                console.warn(`[SyncManager] Skipping table "${tableName}":`, tableErr);
            }
        }

        if (totalPushed > 0 || totalFailed > 0) {
            console.log(
                `[SyncManager] Sync complete — pushed: ${totalPushed}, failed: ${totalFailed}`
            );
        }
    } finally {
        _isSyncing = false;
    }
};
