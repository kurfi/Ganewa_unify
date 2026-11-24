import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
    initializeTestEnvironment,
    RulesTestEnvironment,
    assertFails,
    assertSucceeds
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

const PROJECT_ID = 'demo-ganewa-rules-test';
const RULES_PATH = path.resolve(__dirname, '../../../pos/firestore.rules');

beforeAll(async () => {
    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            rules,
            host: '127.0.0.1',
            port: 8080
        }
    });
});

afterAll(async () => {
    if (testEnv) {
        await testEnv.cleanup();
    }
});

beforeEach(async () => {
    if (testEnv) {
        await testEnv.clearFirestore();
    }
});

describe('Live Firestore Emulator Security Rules Tests', () => {
    it('CLIENT CANNOT CREATE ORDERS: rejects client attempts to write orders directly', async () => {
        const shopperContext = testEnv.authenticatedContext('shopper_1', { role: 'USER' });
        const ordersRef = shopperContext.firestore().collection('orders');

        await assertFails(ordersRef.doc('ord_123').set({
            orderId: 'ORD-123456',
            userId: 'shopper_1',
            total: 5000,
            status: 'pending'
        }));
    }, 15000);

    it('SHOPPER CAN READ ONLY OWN ORDERS: shopper_1 cannot read shopper_2 orders', async () => {
        // Setup initial order via Admin context
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            await adminContext.firestore().collection('orders').doc('order_user2').set({
                userId: 'shopper_2',
                orderId: 'ORD-999',
                total: 2500,
                status: 'pending'
            });
            await adminContext.firestore().collection('orders').doc('order_user1').set({
                userId: 'shopper_1',
                orderId: 'ORD-111',
                total: 1500,
                status: 'pending'
            });
        });

        const shopper1 = testEnv.authenticatedContext('shopper_1', { role: 'USER' }).firestore();
        // Shopper 1 reads their own order
        await assertSucceeds(shopper1.collection('orders').doc('order_user1').get());

        // Shopper 1 reading Shopper 2's order is rejected
        await assertFails(shopper1.collection('orders').doc('order_user2').get());
    });

    it('CASHIER CANNOT CHANGE PRICE/COST: cashier can change quantity but cannot alter pricing or name', async () => {
        // Pre-create product via admin
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            await adminContext.firestore().collection('products').doc('p_rice').set({
                name: 'Rice 50kg',
                quantity: 20,
                sellPrice: 45000,
                stockValue: 900000,
                updated_at: new Date().toISOString()
            });
        });

        const cashier = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER' }).firestore();
        const pRef = cashier.collection('products').doc('p_rice');

        // Cashier updating ONLY quantity & stockValue succeeds
        await assertSucceeds(pRef.update({
            quantity: 18,
            stockValue: 810000,
            updated_at: new Date().toISOString()
        }));

        // Cashier attempting to update sellPrice fails
        await assertFails(pRef.update({
            sellPrice: 35000
        }));

        // Cashier attempting to rename product fails
        await assertFails(pRef.update({
            name: 'Discounted Rice 50kg'
        }));
    });

    it('ADMIN CAN EDIT FULL CATALOGUE: admin can change price and name', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            await adminContext.firestore().collection('products').doc('p_sugar').set({
                name: 'Sugar 1kg',
                quantity: 50,
                sellPrice: 1200,
                updated_at: new Date().toISOString()
            });
        });

        const admin = testEnv.authenticatedContext('admin_1', { role: 'ADMIN' }).firestore();
        const pRef = admin.collection('products').doc('p_sugar');

        await assertSucceeds(pRef.update({
            sellPrice: 1300,
            name: 'Premium Sugar 1kg'
        }));
    });

    it('ANONYMOUS/CUSTOMER CANNOT READ PRIVATEDATA: cost fields are hidden from unauthenticated/public', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            await adminContext.firestore().doc('products/p_oil/privateData/financials').set({
                buyPrice: 8500,
                costPrice: 8500,
                supplierId: 'sup_lagos'
            });
        });

        const unauthed = testEnv.unauthenticatedContext().firestore();
        const shopper = testEnv.authenticatedContext('shopper_1', { role: 'USER' }).firestore();
        const staff = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER' }).firestore();

        // Public/Anonymous cannot read privateData
        await assertFails(unauthed.doc('products/p_oil/privateData/financials').get());

        // Shopper cannot read privateData
        await assertFails(shopper.doc('products/p_oil/privateData/financials').get());

        // Staff can read privateData
        await assertSucceeds(staff.doc('products/p_oil/privateData/financials').get());
    });

    it('MUST CHANGE PASSWORD: staff with mustChangePassword flag cannot read or update products', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            await adminContext.firestore().collection('products').doc('p_soap').set({
                name: 'Soap Bar',
                quantity: 100,
                sellPrice: 500,
                stockValue: 50000,
                updated_at: new Date().toISOString()
            });
        });

        // Staff account with mustChangePassword flag still set
        const lockedStaff = testEnv.authenticatedContext('cashier_temp', { 
            role: 'CASHIER',
            mustChangePassword: true 
        }).firestore();

        // Must fail to update product quantity
        await assertFails(lockedStaff.collection('products').doc('p_soap').update({
            quantity: 90,
            stockValue: 45000,
            updated_at: new Date().toISOString()
        }));

        // Must fail to read privateData
        await assertFails(lockedStaff.doc('products/p_soap/privateData/financials').get());
    });
});

describe('Live Concurrency Test on Firestore Emulator', () => {
    it('CONCURRENCY TEST: Two simultaneous sales of the last unit cannot both succeed', async () => {
        // Setup initial product with strictly 1 unit of stock
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            await adminContext.firestore().collection('products').doc('p_last_item').set({
                name: 'Last Standing Phone',
                quantity: 1,
                sellPrice: 150000,
                stockValue: 150000,
                updated_at: new Date().toISOString()
            });
        });

        const cashierA = testEnv.authenticatedContext('cashier_A', { role: 'CASHIER' }).firestore();
        const cashierB = testEnv.authenticatedContext('cashier_B', { role: 'CASHIER' }).firestore();

        const pRefA = cashierA.collection('products').doc('p_last_item');
        const pRefB = cashierB.collection('products').doc('p_last_item');

        const attemptCheckout = async (pRef: any, cashierName: string) => {
            return pRef.firestore.runTransaction(async (tx: any) => {
                const snap = await tx.get(pRef);
                const data = snap.data();
                if (!data || data.quantity < 1) {
                    throw new Error(`Out of stock for ${cashierName}`);
                }
                tx.update(pRef, {
                    quantity: data.quantity - 1,
                    stockValue: 0,
                    updated_at: new Date().toISOString()
                });
                return `${cashierName} completed sale`;
            });
        };

        // Fire both transactions concurrently against the real Firestore Emulator
        const results = await Promise.allSettled([
            attemptCheckout(pRefA, 'Till 1'),
            attemptCheckout(pRefB, 'Till 2')
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        // Exactly one sale must succeed, and exactly one must fail
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);

        // Verify remaining stock is exactly 0 and never went negative
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const finalDoc = await adminContext.firestore().collection('products').doc('p_last_item').get();
            expect(finalDoc.data()?.quantity).toBe(0);
        });
    });
});
