import { db as dexieDb } from '../db/db';
import { SyncEntry } from '../types';
import { db as firestore } from '../firebase/config';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { startFirestoreListeners } from './firestoreSync';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

type SyncStatusListener = (status: SyncStatus) => void;
const listeners: SyncStatusListener[] = [];

let isSyncing = false;
let syncInterval: NodeJS.Timeout | null = null;

const notifyListeners = (status: SyncStatus) => {
    listeners.forEach(listener => listener(status));
};

export const subscribeToSyncStatus = (listener: SyncStatusListener) => {
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
};


export const syncData = async () => {
    if (isSyncing || !navigator.onLine) {
        if (!navigator.onLine) notifyListeners('offline');
        return;
    }

    try {
        const pendingItems = await dexieDb.syncQueue
            .where('status')
            .equals('pending')
            .limit(50) // Process in smaller batches to avoid locking the UI/DB for too long
            .sortBy('timestamp');

        if (pendingItems.length === 0) {
            notifyListeners('idle');
            return;
        }

        notifyListeners('syncing');
        isSyncing = true;

        // --- DEDUPLICATION ---
        // If the same doc was queued multiple times (e.g. rapid updates),
        // keep only the LATEST entry and delete the older duplicates.
        // This prevents processing hundreds of redundant writes.
        const latestPerDoc = new Map<string, SyncEntry>();
        const duplicateIds: number[] = [];

        for (const item of pendingItems) {
            const key = `${item.table_name}:${item.doc_id}`;
            if (latestPerDoc.has(key)) {
                // The map already has a newer item (sorted by timestamp asc);
                // this item is older — mark it as a duplicate
                duplicateIds.push(latestPerDoc.get(key)!.id!);
            }
            latestPerDoc.set(key, item);
        }

        // Bulk-delete duplicates in one shot
        if (duplicateIds.length > 0) {
            await dexieDb.syncQueue.bulkDelete(duplicateIds);
            console.log(`[Sync] Removed ${duplicateIds.length} duplicate queue entries`);
        }

        let successCount = 0;
        let networkErrorCount = 0;
        const dedupedItems = Array.from(latestPerDoc.values());

        for (const item of dedupedItems) {
            try {
                await syncItem(item);
                // Remove from queue on success
                await dexieDb.syncQueue.delete(item.id!);
                successCount++;
            } catch (error) {
                console.error(`Sync failed for item ${item.id}:`, error);
                const errorMessage = (error as Error).message ?? '';

                // Detect network-level failures (Firestore unreachable)
                if (errorMessage.includes('Failed to fetch') ||
                    errorMessage.includes('unavailable') ||
                    errorMessage.includes('network-request-failed')) {
                    networkErrorCount++;
                }

                // Update status to failed
                await dexieDb.syncQueue.update(item.id!, {
                    status: 'failed',
                    error: errorMessage
                });
            }
        }

        /* 
        // Clean up old 'failed' entries so the queue doesn't grow forever
        const failedIds = await dexieDb.syncQueue
            .where('status').equals('failed')
            .primaryKeys() as number[];
        if (failedIds.length > 0) {
            await dexieDb.syncQueue.bulkDelete(failedIds);
            console.warn(`[Sync] Discarded ${failedIds.length} permanently-failed queue entries`);
        }
        */

        // If every item failed due to network, emit 'error' so user sees "Sync Error"
        if (successCount === 0 && networkErrorCount > 0) {
            notifyListeners('error');
        }

    } catch (error) {
        console.error("Queue processing error:", error);
        notifyListeners('error');
    } finally {
        isSyncing = false;
        // Check if there's more work but avoid infinite immediate recursion
        const remaining = await dexieDb.syncQueue.where('status').equals('pending').count();
        notifyListeners(remaining === 0 ? 'idle' : 'syncing');
        if (remaining > 0 && navigator.onLine) {
            setTimeout(syncData, 2000); // Wait 2s before next batch
        }
    }
};

const processQueue = syncData; // Alias for internal use if needed, or just use syncData

const syncItem = async (item: SyncEntry) => {
    // Map table name to collection name if diff (assuming same for now)
    const collectionName = item.table_name;
    const docId = item.doc_id;

    if (!collectionName || !docId) return;

    const docRef = doc(firestore, collectionName, docId);

    switch (item.action) {
        case 'create':
        case 'update':
            // For create/update, we set the document
            // We need to clean the payload (remove local specific fields if any)
            const data = { ...item.payload };
            if (data.id) delete data.id; // Firestore ID is the key

            // Use setDoc with merge for updates to be safe
            await setDoc(docRef, data, { merge: true });
            break;

        case 'delete':
            await deleteDoc(docRef);
            break;
    }
};

export const startSyncService = () => {
    if (syncInterval) return;

    // Start real-time Firestore → Dexie listeners
    startFirestoreListeners();

    // Process push queue immediately
    processQueue();

    // Process periodically (e.g., every 30 seconds)
    syncInterval = setInterval(processQueue, 30000);

    // Listen for online status
    window.addEventListener('online', processQueue);
    window.addEventListener('offline', () => notifyListeners('offline'));
};

export const stopSyncService = () => {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    window.removeEventListener('online', processQueue);
};
