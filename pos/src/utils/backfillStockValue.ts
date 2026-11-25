import {
  collection,
  getDocs,
  query,
  where,
  doc,
  writeBatch,
  getDoc,
  collectionGroup
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeFirestoreDates } from '../firebase/firestoreHelpers';

export interface BackfillReport {
  productsUpdated: number;
  returnedItemsUpdated: number;
  errors: string[];
}

/**
 * One-time migration: backfill `stockValue` on all product documents
 * and `returnDate` on all returnedItem documents.
 *
 * Safe to run multiple times — it recalculates from current field values
 * and only writes if the computed value differs from what's stored.
 */
export async function runBackfillMigration(): Promise<BackfillReport> {
  const report: BackfillReport = {
    productsUpdated: 0,
    returnedItemsUpdated: 0,
    errors: [],
  };

  // --- Backfill stockValue on products ---
  try {
    const [productsSnap, finSnap] = await Promise.all([
      getDocs(query(collection(db, 'products'), where('deleted', '==', false))),
      getDocs(collectionGroup(db, 'privateData'))
    ]);

    const finMap = new Map<string, number>();
    finSnap.forEach(d => {
      if (d.id === 'financials') {
        const parentId = d.ref.parent.parent?.id;
        if (parentId) {
          const fData = d.data();
          finMap.set(parentId, Number(fData.buyPrice ?? fData.costPrice) || 0);
        }
      }
    });

    // Firestore writeBatch supports max 500 operations per batch
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const docSnap of productsSnap.docs) {
      const data = docSnap.data();
      const quantity = Number(data.quantity) || 0;
      const buyPrice = finMap.get(docSnap.id) ?? (Number(data.buyPrice) || 0);
      const correctStockValue = quantity * buyPrice;

      // Only write if stockValue is missing or differs
      if (data.stockValue === undefined || Math.abs((data.stockValue || 0) - correctStockValue) > 0.001) {
        batch.update(doc(db, 'products', docSnap.id), {
          stockValue: correctStockValue,
          updated_at: new Date().toISOString(),
        });
        batchCount++;
        report.productsUpdated++;

        if (batchCount >= 490) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (err: any) {
    report.errors.push(`Products backfill failed: ${err?.message || err}`);
  }

  // --- Backfill returnDate on returnedItems ---
  try {
    const returnedItemsSnap = await getDocs(
      query(collection(db, 'returnedItems'), where('deleted', '==', false))
    );

    // Build a cache of return docs for looking up returnDate
    const returnDateCache: Record<string, Date | null> = {};

    let batch = writeBatch(db);
    let batchCount = 0;

    for (const docSnap of returnedItemsSnap.docs) {
      const data = docSnap.data();

      // Skip if returnDate already present
      if (data.returnDate) continue;

      const returnId = data.returnId;
      if (!returnId) continue;

      // Look up the parent Return doc to get its returnDate
      if (!(returnId in returnDateCache)) {
        try {
          const returnDoc = await getDoc(doc(db, 'returns', returnId));
          if (returnDoc.exists()) {
            const returnData = normalizeFirestoreDates<{ returnDate?: Date }>(returnDoc.data());
            returnDateCache[returnId] = returnData.returnDate || null;
          } else {
            returnDateCache[returnId] = null;
          }
        } catch {
          returnDateCache[returnId] = null;
        }
      }

      const returnDate = returnDateCache[returnId];
      if (returnDate) {
        batch.update(doc(db, 'returnedItems', docSnap.id), {
          returnDate: returnDate,
          updated_at: new Date().toISOString(),
        });
        batchCount++;
        report.returnedItemsUpdated++;

        if (batchCount >= 490) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (err: any) {
    report.errors.push(`ReturnedItems backfill failed: ${err?.message || err}`);
  }

  console.log('[BackfillMigration] Report:', report);
  return report;
}
