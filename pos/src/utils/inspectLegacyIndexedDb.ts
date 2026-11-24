/**
 * Diagnostic tool: inspectLegacyIndexedDb
 * 
 * Safely inspects the browser IndexedDB (legacy Dexie database named 'ganewa-pos' or similar)
 * to verify if any unsynced offline records remained prior to the Firestore-only migration.
 * 
 * Read-only: never modifies or deletes any data in IndexedDB.
 */
export interface LegacyIndexedDbReport {
    databaseFound: boolean;
    databaseName: string;
    tableCounts: Record<string, number>;
    unsyncedCounts: Record<string, number>;
}

export async function inspectLegacyIndexedDb(dbName = 'ganewa-pos'): Promise<LegacyIndexedDbReport> {
    return new Promise((resolve) => {
        const report: LegacyIndexedDbReport = {
            databaseFound: false,
            databaseName: dbName,
            tableCounts: {},
            unsyncedCounts: {}
        };

        if (typeof window === 'undefined' || !window.indexedDB) {
            return resolve(report);
        }

        const request = window.indexedDB.open(dbName);

        request.onerror = () => {
            resolve(report);
        };

        request.onsuccess = async () => {
            const db = request.result;
            report.databaseFound = true;
            const objectStoreNames = Array.from(db.objectStoreNames);

            try {
                const tx = db.transaction(objectStoreNames, 'readonly');

                await Promise.all(
                    objectStoreNames.map(storeName => {
                        return new Promise<void>((resStore) => {
                            const store = tx.objectStore(storeName);
                            const countReq = store.count();

                            countReq.onsuccess = () => {
                                report.tableCounts[storeName] = countReq.result;

                                // Check for unsynced flag if store contains objects
                                const getAllReq = store.getAll();
                                getAllReq.onsuccess = () => {
                                    const records = getAllReq.result || [];
                                    const unsynced = records.filter(r => r && (r.synced === false || r.synced === 0)).length;
                                    report.unsyncedCounts[storeName] = unsynced;
                                    resStore();
                                };
                                getAllReq.onerror = () => resStore();
                            };
                            countReq.onerror = () => resStore();
                        });
                    })
                );

                db.close();
                resolve(report);
            } catch (err) {
                db.close();
                resolve(report);
            }
        };
    });
}
