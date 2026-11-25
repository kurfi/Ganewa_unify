import { useMemo, useState } from 'react';
import { runTransaction, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useCollection, logAudit, normalizeFirestoreDates } from '../firebase/firestoreHelpers';
import { Product, StockWriteOff, User } from '../types';
import { roundTo2 } from '../utils/math';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../auth/AuthContext';
import { emitDashboardRefresh } from '../utils/dashboardRefreshSignal';

export function useStockWriteOffs(currentUser: User | null) {
  const { isAdmin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: rawWriteOffs, loading, error } = useCollection<StockWriteOff>('stockWriteOffs');

  const writeOffs = useMemo(() => {
    return [...rawWriteOffs].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeB - timeA;
    });
  }, [rawWriteOffs]);

  const submitWriteOff = async (productId: string, quantity: number, note?: string) => {
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    setIsSubmitting(true);
    try {
      const writeOffId = uuidv4();
      const now = new Date();
      const nowIso = now.toISOString();

      const result = await runTransaction(db, async (tx) => {
        // READ PHASE
        const productRef = doc(db, 'products', productId);
        const finRef = doc(db, 'products', productId, 'privateData', 'financials');
        const [productSnap, finSnap] = await Promise.all([
          tx.get(productRef),
          tx.get(finRef)
        ]);

        if (!productSnap.exists()) {
          throw new Error('Selected product does not exist.');
        }

        const product = normalizeFirestoreDates<Product>(productSnap.data());
        const finData = finSnap.exists() ? finSnap.data() : null;
        const unitCost = finData?.buyPrice ?? finData?.costPrice ?? product.buyPrice ?? 0;

        // VALIDATION
        if (product.quantity < quantity) {
          throw new Error(`Insufficient stock for "${product.name}". Available: ${product.quantity}`);
        }

        const costImpact = roundTo2(quantity * unitCost);
        const auditLogId = `audit_${writeOffId}`;

        // WRITE PHASE
        // 1. Decrement product quantity with deterministic auditLogId
        tx.update(productRef, {
          quantity: product.quantity - quantity,
          stockValue: (product.quantity - quantity) * unitCost,
          auditLogId,
          updated_at: nowIso
        });

        // 2. Deterministic audit log entry
        const auditRef = doc(db, 'auditLogs', auditLogId);
        tx.set(auditRef, {
          id: auditLogId,
          action: 'STOCK_WRITE_OFF',
          details: `Wrote off ${quantity} units of ${product.name}. Cost: ${costImpact}`,
          performedBy: currentUser?.username || 'Unknown',
          date: nowIso,
          created_at: nowIso
        });

        // 3. Create stockWriteOffs doc
        const writeOffDocRef = doc(db, 'stockWriteOffs', writeOffId);
        const writeOffData: any = {
          id: writeOffId,
          productId,
          productName: product.name,
          quantity,
          reason: 'expired',
          costImpact,
          note: note?.trim() || '',
          staffId: currentUser?.id || '',
          staffName: currentUser?.username || currentUser?.firstName || 'Unknown',
          date: now,
          created_at: nowIso,
          updated_at: nowIso,
          deleted: false
        };

        tx.set(writeOffDocRef, writeOffData);

        return {
          writeOffId,
          productName: product.name,
          costImpact,
          newQuantity: product.quantity - quantity
        };
      });

      emitDashboardRefresh();

      // Audit log after transaction commits
      logAudit(
        'STOCK_WRITEOFF',
        `Wrote off ${quantity} x ${result.productName} (expired) — cost impact ₦${result.costImpact.toLocaleString()}`,
        currentUser?.username || 'Unknown'
      ).catch((err) => console.error('[StockWriteOff] Audit log error:', err));

      return result;
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteWriteOff = async (id: string) => {
    if (!isAdmin) {
      throw new Error('Only administrators can delete stock write-off records.');
    }

    const docRef = doc(db, 'stockWriteOffs', id);
    const nowIso = new Date().toISOString();
    await updateDoc(docRef, {
      deleted: true,
      updated_at: nowIso
    });

    logAudit(
      'DELETE_STOCK_WRITEOFF',
      `Deleted stock write-off record #${id}`,
      currentUser?.username || 'Unknown'
    ).catch((err) => console.error('[StockWriteOff] Delete audit log error:', err));
  };

  return {
    writeOffs,
    loading,
    error,
    isSubmitting,
    submitWriteOff,
    deleteWriteOff
  };
}
