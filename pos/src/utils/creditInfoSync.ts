/**
 * creditInfoSync.ts
 *
 * Pushes a denormalized credit snapshot to the linked ecommerce shopUsers document
 * whenever the POS modifies a customer's balance or credit limit.
 *
 * Design principles:
 * - POS owns all credit data; ecommerce only reads a denormalized copy.
 * - Uses `fastDb` (memory-only Firestore instance) to avoid IndexedDB/tab-lock overhead.
 * - Finds the linked ecommerce UID by querying shopUsers where linkedPosCustomerId == customer.id
 *   (the link was stored on the shopUsers doc when the user redeemed the link code).
 * - Fire-and-forget: callers do not need to await this — a failure here does NOT roll back
 *   the sale transaction that triggered it.
 * - Idempotent: repeated calls with the same data produce the same result.
 */

import { db, ensureSilentAuth } from '../firebase/config';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Customer } from '../types';

export interface CreditInfo {
  creditLimit: number;
  currentDebt: number;
  availableCredit: number;
  updatedAt: any; // Firestore serverTimestamp
}

/**
 * Syncs credit info for a customer to their linked shopUsers document.
 * Safe to call after any operation that changes currentDebt or creditLimit.
 *
 * @param customer - The updated customer record.
 */
export async function syncCreditInfoToShopUser(customer: Customer, targetUid?: string): Promise<void> {
  if (!customer.id) return;

  try {
    // Ensure the store account is authenticated before any Firestore operation.
    // Without this, fastDb writes fail with permission-denied (silently swallowed).
    const authUser = await ensureSilentAuth();
    if (!authUser) {
      console.error('[CreditSync] Cannot sync — store account authentication failed.');
      return;
    }

    const creditLimit = Number(customer.creditLimit) || 0;
    const currentDebt = Number(customer.currentDebt) || 0;
    const availableCredit = Math.max(0, creditLimit - currentDebt);

    const creditInfo: Omit<CreditInfo, 'updatedAt'> & { updatedAt: any } = {
      creditLimit,
      currentDebt,
      availableCredit,
      updatedAt: serverTimestamp(),
    };

    if (targetUid) {
      // Direct update when linking from admin-side
      await setDoc(
        doc(db, 'shopUsers', targetUid),
        {
          linkedPosCustomerId: customer.id,
          linkedPosCustomerName: customer.name,
          creditInfo,
        },
        { merge: true }
      );

      console.log(
        `[CreditSync] Directly linked and synced credit info for customer ${customer.name} to shopUser ${targetUid}`
      );
      return;
    }

    // Query shopUsers for the document linked to this POS customer.
    // This avoids storing a separate UID on the Customer record.
    // limit(1) satisfies the Firestore rule fallback: allow list if request.query.limit == 1
    const shopUsersRef = collection(db, 'shopUsers');
    const q = query(shopUsersRef, where('linkedPosCustomerId', '==', customer.id), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      // Customer is not linked to any ecommerce account — nothing to sync.
      return;
    }

    // Update every linked shopUsers document (typically exactly one).
    const updatePromises = snapshot.docs.map((shopUserDoc) =>
      setDoc(
        doc(db, 'shopUsers', shopUserDoc.id),
        { creditInfo },
        { merge: true }, // Never overwrite other profile fields.
      ),
    );

    await Promise.all(updatePromises);

    console.log(
      `[CreditSync] Synced credit info for customer ${customer.name} (${customer.id}):`,
      { creditLimit, currentDebt, availableCredit },
    );
  } catch (error: any) {
    // Log but never throw — credit sync failure must not roll back a POS transaction.
    console.error('[CreditSync] Failed to sync credit info to shopUsers:', error?.message || error);
  }
}
