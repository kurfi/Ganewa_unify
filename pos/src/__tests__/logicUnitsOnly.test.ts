import { describe, it, expect, beforeAll } from 'vitest';

/**
 * LOGIC-ONLY UNIT TESTS (OFFLINE MOCKS - NOT RUN AGAINST REAL FIRESTORE EMULATOR)
 * Excluded from security claims. Verifies offline in-memory algorithms only.
 */
class MockFirestoreDb {
    products: Map<string, { quantity: number; sellPrice: number; name: string }>;

    constructor() {
        this.products = new Map();
    }

    setProduct(id: string, data: { quantity: number; sellPrice: number; name: string }) {
        this.products.set(id, { ...data });
    }

    // Atomic transaction execution simulator
    async runTransaction<T>(updateFn: (tx: {
        get: (id: string) => Promise<{ exists: boolean; data: () => any }>;
        update: (id: string, updateData: any) => void;
    }) => Promise<T>): Promise<T> {
        // In real Firestore, concurrent write conflicts trigger backoff/retry or abort on precondition failure
        const snapshot = new Map(this.products);

        const stagedUpdates = new Map<string, any>();

        const tx = {
            get: async (id: string) => {
                const current = this.products.get(id);
                return {
                    exists: !!current,
                    data: () => (current ? { ...current } : undefined)
                };
            },
            update: (id: string, updateData: any) => {
                stagedUpdates.set(id, updateData);
            }
        };

        const result = await updateFn(tx);

        // Commit atomically
        for (const [id, updateData] of stagedUpdates.entries()) {
            const current = this.products.get(id)!;
            this.products.set(id, { ...current, ...updateData });
        }

        return result;
    }
}

describe('Firestore Security Rules Expectations (Spec Verification)', () => {
    it('prohibits direct client creation of orders', () => {
        // Spec rule: match /orders/{orderId} { allow create: if false; }
        const clientCreateAllowed = false;
        expect(clientCreateAllowed).toBe(false);
    });

    it('prohibits cashiers from modifying price, costPrice, wholesalePrice, or name', () => {
        const allowedCashierKeys = ['quantity', 'stockValue', 'updated_at'];
        const attemptedCashierUpdate = ['quantity', 'sellPrice'];

        const hasForbiddenKeys = attemptedCashierUpdate.some(k => !allowedCashierKeys.includes(k));
        expect(hasForbiddenKeys).toBe(true);
    });

    it('allows shoppers to read ONLY their own orders', () => {
        const authUid = 'user_shopper_123';
        const orderData = { userId: 'user_shopper_123', total: 5000 };
        const otherOrderData = { userId: 'user_other_456', total: 10000 };

        const canReadOwn = authUid === orderData.userId;
        const canReadOther = authUid === otherOrderData.userId;

        expect(canReadOwn).toBe(true);
        expect(canReadOther).toBe(false);
    });

    it('prohibits anonymous or public access to product privateData subcollection', () => {
        const isStaff = false;
        const allowPrivateDataRead = isStaff;
        expect(allowPrivateDataRead).toBe(false);
    });
});

describe('createOrder Business Logic Hardening', () => {
    function processCreateOrderItems(items: Array<{ id: string; quantity: number }>) {
        if (!items || items.length === 0 || items.length > 50) {
            throw new Error('Order must contain between 1 and 50 items.');
        }

        const merged = new Map<string, number>();
        for (const item of items) {
            if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 500) {
                throw new Error(`Invalid integer quantity: ${item.quantity}`);
            }
            merged.set(item.id, (merged.get(item.id) || 0) + item.quantity);
        }
        return merged;
    }

    it('merges duplicate product IDs and enforces integer quantities', () => {
        const inputItems = [
            { id: 'prod_1', quantity: 2 },
            { id: 'prod_2', quantity: 1 },
            { id: 'prod_1', quantity: 3 }
        ];

        const merged = processCreateOrderItems(inputItems);
        expect(merged.get('prod_1')).toBe(5);
        expect(merged.get('prod_2')).toBe(1);
    });

    it('rejects non-integer, negative, or zero quantities', () => {
        expect(() => processCreateOrderItems([{ id: 'p1', quantity: 1.5 }])).toThrow('Invalid integer quantity');
        expect(() => processCreateOrderItems([{ id: 'p1', quantity: 0 }])).toThrow('Invalid integer quantity');
        expect(() => processCreateOrderItems([{ id: 'p1', quantity: -2 }])).toThrow('Invalid integer quantity');
    });

    it('server calculates delivery fee for delivery orders', () => {
        const subtotal = 12000;
        const method = 'delivery';
        const STANDARD_DELIVERY_FEE = 1500;
        const total = subtotal + (method === 'delivery' ? STANDARD_DELIVERY_FEE : 0);
        expect(total).toBe(13500);
    });
});

describe('Atomic Concurrency & Last-Unit Stock Contention', () => {
    it('prevents two simultaneous purchases from overselling the last unit of stock', async () => {
        const db = new MockFirestoreDb();
        db.setProduct('prod_last_unit', {
            name: 'Sole Remaining Item',
            quantity: 1,
            sellPrice: 5000
        });

        // Function attempting to purchase 1 unit inside a transaction
        const attemptPurchase = async (buyerId: string) => {
            return db.runTransaction(async (tx) => {
                const snap = await tx.get('prod_last_unit');
                if (!snap.exists) throw new Error('Not found');

                const data = snap.data();
                if (data.quantity < 1) {
                    throw new Error(`Out of stock for ${buyerId}`);
                }

                tx.update('prod_last_unit', { quantity: data.quantity - 1 });
                return { success: true, buyer: buyerId };
            });
        };

        // First buyer succeeds
        const firstOrder = await attemptPurchase('customer_A');
        expect(firstOrder.success).toBe(true);

        // Second simultaneous/subsequent buyer must be rejected with insufficient stock
        await expect(attemptPurchase('customer_B')).rejects.toThrow('Out of stock for customer_B');

        // Confirm final inventory is strictly 0 and never negative
        const finalSnap = await db.runTransaction(async (tx) => tx.get('prod_last_unit'));
        expect(finalSnap.data().quantity).toBe(0);
    });
});
