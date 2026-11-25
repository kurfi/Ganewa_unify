import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
    initializeTestEnvironment,
    RulesTestEnvironment,
    assertFails,
    assertSucceeds
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { STAFF_EMAIL_SUFFIX } from '../../../functions/src/constants/staffAuth';

let testEnv: RulesTestEnvironment;

const PROJECT_ID = 'demo-ganewa-rules-test';
const RULES_PATH = path.resolve(__dirname, '../../firestore.rules');

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            host: '127.0.0.1',
            port: 8080,
            rules: fs.readFileSync(RULES_PATH, 'utf8')
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

        // (a) Cashier updating quantity WITH lastSaleId linked to an active sale in the same commit succeeds
        await assertSucceeds(cashier.runTransaction(async (tx) => {
            const saleRef = cashier.collection('sales').doc('sale_rice_001');
            tx.set(saleRef, {
                id: 'sale_rice_001',
                totalAmount: 90000,
                items: [{
                    productId: 'p_rice',
                    productName: 'Rice 50kg',
                    quantity: 2,
                    price: 45000,
                    costPrice: 40000,
                    total: 90000
                }],
                itemQuantities: { p_rice: 2 },
                date: new Date().toISOString()
            });
            tx.update(pRef, {
                quantity: 18,
                stockValue: 810000,
                lastSaleId: 'sale_rice_001',
                updated_at: new Date().toISOString()
            });
        }));

        // (b) NEGATIVE TEST 1: Cashier CANNOT decrement stock without a sale document in the same transaction
        await assertFails(pRef.update({
            quantity: 17,
            stockValue: 765000,
            updated_at: new Date().toISOString()
        }));

        // (c) NEGATIVE TEST 2: Manual stock adjustment without an audit entry in auditLogs is rejected
        await assertFails(pRef.update({
            quantity: 15,
            stockValue: 675000,
            auditLogId: 'non_existent_audit_log_id',
            updated_at: new Date().toISOString()
        }));

        // (d) Cashier attempting to update sellPrice fails explicitly
        await assertFails(cashier.runTransaction(async (tx) => {
            const saleRef = cashier.collection('sales').doc('sale_rice_002');
            tx.set(saleRef, { id: 'sale_rice_002', totalAmount: 70000 });
            tx.update(pRef, {
                sellPrice: 35000,
                lastSaleId: 'sale_rice_002'
            });
        }));

        // (e) Cashier attempting to rename product fails explicitly
        await assertFails(cashier.runTransaction(async (tx) => {
            const saleRef = cashier.collection('sales').doc('sale_rice_003');
            tx.set(saleRef, { id: 'sale_rice_003', totalAmount: 70000 });
            tx.update(pRef, {
                name: 'Discounted Rice 50kg',
                lastSaleId: 'sale_rice_003'
            });
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

        // Cashier CANNOT write or modify privateData (ADMIN only)
        await assertFails(staff.doc('products/p_oil/privateData/financials').set({
            buyPrice: 9000
        }));

        // Collection-group query on privateData: staff succeeds, anonymous and shopper denied
        await assertSucceeds(staff.collectionGroup('privateData').get());
        await assertFails(unauthed.collectionGroup('privateData').get());
        await assertFails(shopper.collectionGroup('privateData').get());
    });

    it('HELD SALES IS STAFF-ONLY: shoppers/unauthenticated cannot read or write held sales', async () => {
        const unauthed = testEnv.unauthenticatedContext().firestore();
        const shopper = testEnv.authenticatedContext('shopper_1', { role: 'USER' }).firestore();
        const cashier = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER' }).firestore();

        await assertFails(unauthed.collection('heldSales').doc('h_1').set({ total: 1000 }));
        await assertFails(shopper.collection('heldSales').doc('h_1').set({ total: 1000 }));
        await assertSucceeds(cashier.collection('heldSales').doc('h_1').set({ total: 1000 }));
        await assertSucceeds(cashier.collection('heldSales').doc('h_1').get());
        await assertFails(shopper.collection('heldSales').doc('h_1').get());
    });

    it('ORDER IDEMPOTENCY: completely inaccessible to clients (read and write denied)', async () => {
        const shopper = testEnv.authenticatedContext('shopper_1', { role: 'USER' }).firestore();
        const cashier = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER' }).firestore();

        await assertFails(shopper.collection('orderIdempotency').doc('idem_1').get());
        await assertFails(shopper.collection('orderIdempotency').doc('idem_1').set({ processed: true }));
        await assertFails(cashier.collection('orderIdempotency').doc('idem_1').get());
        await assertFails(cashier.collection('orderIdempotency').doc('idem_1').set({ processed: true }));
    });

    it('USERS RULE: cashier cannot read or write another staff document (protects credentials)', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            await adminContext.firestore().collection('users').doc('staff_manager').set({
                username: 'manager',
                role: 'ADMIN',
                uid: 'staff_manager'
            });
            await adminContext.firestore().collection('users').doc('cashier_1').set({
                username: 'cashier1',
                role: 'CASHIER',
                uid: 'cashier_1'
            });
        });

        const cashier = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER' }).firestore();

        // Cashier can read own doc
        await assertSucceeds(cashier.collection('users').doc('cashier_1').get());

        // Cashier CANNOT read another staff member's doc
        await assertFails(cashier.collection('users').doc('staff_manager').get());
    });

    it('15-ITEM SALE & AUDIT LOG RULES: cashier can execute multi-item transaction and manual stock adjustment', async () => {
        // Pre-create 15 products via admin
        const productIds: string[] = [];
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const batch = adminContext.firestore().batch();
            for (let i = 1; i <= 15; i++) {
                const pid = `p_item_${i}`;
                productIds.push(pid);
                batch.set(adminContext.firestore().collection('products').doc(pid), {
                    name: `Item ${i}`,
                    quantity: 10,
                    sellPrice: 100 * i,
                    stockValue: 1000 * i,
                    updated_at: new Date().toISOString()
                });
            }
            await batch.commit();
        });

        const cashier = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER' }).firestore();

        // 1. A cashier completes a 15-item sale in a single transaction
        await assertSucceeds(cashier.runTransaction(async (tx) => {
            // Read phase
            const snaps = await Promise.all(productIds.map(id => tx.get(cashier.collection('products').doc(id))));
            
            // Write phase: update 15 items and create sale record (exact usePOS payload shape)
            const saleRef = cashier.collection('sales').doc('sale_15_items');
            const items = productIds.map((pid, idx) => ({
                productId: pid,
                productName: `Item ${idx + 1}`,
                quantity: 1,
                price: 100 * (idx + 1),
                costPrice: 80 * (idx + 1),
                discount: 0,
                total: 100 * (idx + 1)
            }));
            const itemQuantities: Record<string, number> = {};
            for (const pid of productIds) {
                itemQuantities[pid] = 1;
            }
            tx.set(saleRef, {
                id: 'sale_15_items',
                totalAmount: 12000,
                finalAmount: 12000,
                items,
                itemQuantities,
                date: new Date().toISOString(),
                cashier: 'cashier_1'
            });

            for (let i = 0; i < 15; i++) {
                const snap = snaps[i];
                const data = snap.data()!;
                tx.update(cashier.collection('products').doc(productIds[i]), {
                    quantity: data.quantity - 1,
                    stockValue: (data.quantity - 1) * 100 * (i + 1),
                    lastSaleId: 'sale_15_items',
                    updated_at: new Date().toISOString()
                });
            }
        }));

        // 2. A manual adjustment without an audit entry or non-whitelisted fields is rejected
        const p1Ref = cashier.collection('products').doc('p_item_1');
        await assertFails(p1Ref.update({
            quantity: 5,
            manualAdjustmentReason: 'damaged stock without audit log'
        }));
    });

    it('MUST CHANGE PASSWORD: staff with mustChangePassword flag cannot read or write across any collection', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            await adminContext.firestore().collection('products').doc('p_soap').set({
                name: 'Soap Bar',
                quantity: 100,
                sellPrice: 500,
                stockValue: 50000,
                updated_at: new Date().toISOString()
            });
            await adminContext.firestore().collection('customers').doc('c_1').set({
                name: 'Sample Customer',
                currentDebt: 0
            });
        });

        // Staff account with mustChangePassword flag still set
        const lockedStaff = testEnv.authenticatedContext('cashier_temp', { 
            role: 'CASHIER',
            mustChangePassword: true 
        }).firestore();

        // 1. Must fail to update product
        await assertFails(lockedStaff.collection('products').doc('p_soap').update({
            quantity: 90,
            stockValue: 45000,
            updated_at: new Date().toISOString()
        }));

        // 2. Must fail to read privateData
        await assertFails(lockedStaff.doc('products/p_soap/privateData/financials').get());

        // 3. Must fail to read sales or create sales
        await assertFails(lockedStaff.collection('sales').doc('s_test').get());
        await assertFails(lockedStaff.collection('sales').doc('s_test').set({ totalAmount: 100 }));

        // 4. Must fail to read customers
        await assertFails(lockedStaff.collection('customers').doc('c_1').get());

        // 5. Must fail to read heldSales
        await assertFails(lockedStaff.collection('heldSales').doc('h_test').get());
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

        // POS transactional checkout logic (matching usePOS handleCheckout transaction logic)
        const executePosCheckout = async (cashierFirestore: any, cashierName: string) => {
            const safeCashierKey = cashierName.replace(/\s+/g, '_');
            const saleId = `sale_${safeCashierKey}_${Date.now()}`;
            const nowIso = new Date().toISOString();

            return cashierFirestore.runTransaction(async (tx: any) => {
                // 1. Read phase: get product and verify stock
                const pDoc = cashierFirestore.collection('products').doc('p_last_item');
                const snap = await tx.get(pDoc);
                if (!snap.exists) {
                    throw new Error('Product not found');
                }
                const productData = snap.data();
                if (productData.quantity < 1) {
                    throw new Error(`Insufficient stock for "Last Standing Phone". Available: ${productData.quantity}`);
                }

                // 2. Write phase: decrement stock & create sale record
                tx.update(pDoc, {
                    quantity: productData.quantity - 1,
                    stockValue: 0,
                    lastSaleId: saleId,
                    updated_at: nowIso
                });

                const saleRef = cashierFirestore.collection('sales').doc(saleId);
                tx.set(saleRef, {
                    id: saleId,
                    customerName: 'Walk-in',
                    date: nowIso,
                    totalAmount: 150000,
                    items: [{
                        productId: 'p_last_item',
                        productName: 'Last Standing Phone',
                        quantity: 1,
                        price: 150000,
                        costPrice: 120000,
                        total: 150000
                    }],
                    itemQuantities: { p_last_item: 1 },
                    status: 'completed',
                    cashier: cashierName
                });

                return `${cashierName} completed sale ${saleId}`;
            });
        };

        // Fire two simultaneous checkouts from Till 1 and Till 2
        const results = await Promise.allSettled([
            executePosCheckout(cashierA, 'Till 1'),
            executePosCheckout(cashierB, 'Till 2')
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        // Exactly one checkout succeeds, and the other fails with Insufficient stock
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);

        const failureReason = (rejected[0] as PromiseRejectedResult).reason?.message || '';
        // In production Firestore, optimistic concurrency returns ABORTED and the SDK retries to throw
        // 'Insufficient stock'; in the Firestore Emulator, rules run before precondition checks so the
        // losing 0 -> 0 write is rejected by the stock-decrement rule with PERMISSION_DENIED.
        expect(
            failureReason.includes('Insufficient stock for "Last Standing Phone"') ||
            failureReason.includes('PERMISSION_DENIED')
        ).toBe(true);

        // Verify remaining stock is exactly 0 and never went negative
        await testEnv.withSecurityRulesDisabled(async (adminContext) => {
            const finalDoc = await adminContext.firestore().collection('products').doc('p_last_item').get();
            expect(finalDoc.data()?.quantity).toBe(0);
        });
    });

    it('SETUSERROLE & SETSTAFFPASSWORD: real Functions + Auth emulator RBAC verification', async () => {
        const emuProject = process.env.GCLOUD_PROJECT || 'demo-ganewa';
        const authAdminBase = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${emuProject}`;
        const authClientBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
        const fnBase = `http://127.0.0.1:5001/${emuProject}/us-central1`;

        const createAdminAuthUser = async (localId: string, email: string, password: string, claims?: Record<string, any>) => {
            // Delete first if left over from an earlier run
            await fetch(`${authAdminBase}/accounts:delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
                body: JSON.stringify({ localId })
            }).catch(() => {});

            const createRes = await fetch(`${authAdminBase}/accounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
                body: JSON.stringify({ localId, email, password })
            });
            expect(createRes.status).toBe(200);

            if (claims) {
                const claimRes = await fetch(`${authAdminBase}/accounts:update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
                    body: JSON.stringify({ localId, customAttributes: JSON.stringify(claims) })
                });
                expect(claimRes.status).toBe(200);
            }
        };

        const signIn = async (email: string, password: string) => {
            const res = await fetch(`${authClientBase}/accounts:signInWithPassword?key=fake-api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, returnSecureToken: true })
            });
            const body = await res.json();
            return { status: res.status, body };
        };

        const callFn = async (name: string, data: any, idToken?: string) => {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (idToken) headers.Authorization = `Bearer ${idToken}`;
            const res = await fetch(`${fnBase}/${name}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ data })
            });
            const body = await res.json();
            return { status: res.status, body };
        };

        await createAdminAuthUser('emu_super', `super1${STAFF_EMAIL_SUFFIX}`, 'OldPass123!', { role: 'SUPER_ADMIN' });
        await createAdminAuthUser('emu_admin', `admin1${STAFF_EMAIL_SUFFIX}`, 'OldPass123!', { role: 'ADMIN' });
        await createAdminAuthUser('emu_cashier', `cashier_rbac${STAFF_EMAIL_SUFFIX}`, 'OldPass123!', { role: 'CASHIER' });
        await createAdminAuthUser('emu_shopper', 'shopper_rbac@gmail.com', 'OldPass123!', { role: 'USER' });

        const superSignIn = await signIn(`super1${STAFF_EMAIL_SUFFIX}`, 'OldPass123!');
        const adminSignIn = await signIn(`admin1${STAFF_EMAIL_SUFFIX}`, 'OldPass123!');
        const cashierSignIn = await signIn(`cashier_rbac${STAFF_EMAIL_SUFFIX}`, 'OldPass123!');
        const shopperSignIn = await signIn('shopper_rbac@gmail.com', 'OldPass123!');

        expect(superSignIn.status).toBe(200);

        // 1. setUserRole: unauthenticated, CASHIER, ADMIN, USER must all be rejected
        const unauthRes = await callFn('setUserRole', { targetUid: 'emu_cashier', role: 'ADMIN' });
        expect(unauthRes.status).toBe(401);

        const cashierRes = await callFn('setUserRole', { targetUid: 'emu_cashier', role: 'ADMIN' }, cashierSignIn.body.idToken);
        expect(cashierRes.status).toBe(403);

        const adminRes = await callFn('setUserRole', { targetUid: 'emu_cashier', role: 'ADMIN' }, adminSignIn.body.idToken);
        expect(adminRes.status).toBe(403);

        const shopperRes = await callFn('setUserRole', { targetUid: 'emu_cashier', role: 'ADMIN' }, shopperSignIn.body.idToken);
        expect(shopperRes.status).toBe(403);

        // SUPER_ADMIN succeeds
        const superRes = await callFn('setUserRole', { targetUid: 'emu_cashier', role: 'ADMIN' }, superSignIn.body.idToken);
        expect(superRes.status).toBe(200);
        expect(superRes.body.result).toEqual({ success: true, targetUid: 'emu_cashier', role: 'ADMIN' });

        // 2. setStaffPassword: CASHIER and ADMIN rejected; SUPER_ADMIN succeeds & sets mustChangePassword
        const pwCashierRes = await callFn('setStaffPassword', { targetUid: 'emu_admin', newPassword: 'NewTempPass99!' }, cashierSignIn.body.idToken);
        expect(pwCashierRes.status).toBe(403);

        const pwAdminRes = await callFn('setStaffPassword', { targetUid: 'emu_cashier', newPassword: 'NewTempPass99!' }, adminSignIn.body.idToken);
        expect(pwAdminRes.status).toBe(403);

        const pwSuperRes = await callFn('setStaffPassword', { targetUid: 'emu_cashier', newPassword: 'NewTempPass99!' }, superSignIn.body.idToken);
        expect(pwSuperRes.status).toBe(200);
        expect(pwSuperRes.body.result).toEqual({ success: true, targetUid: 'emu_cashier', mustChangePassword: true });

        // Old password fails, new password succeeds
        const oldLogin = await signIn(`cashier_rbac${STAFF_EMAIL_SUFFIX}`, 'OldPass123!');
        expect(oldLogin.status).toBe(400);

        const newLogin = await signIn(`cashier_rbac${STAFF_EMAIL_SUFFIX}`, 'NewTempPass99!');
        expect(newLogin.status).toBe(200);
        const payload = JSON.parse(Buffer.from(newLogin.body.idToken.split('.')[1], 'base64url').toString('utf8'));
        expect(payload.mustChangePassword).toBe(true);
    }, 30000);

    it('STAFF DOMAIN BLOCKER & MIGRATION REFUSAL: real Auth + Functions + Firestore emulator checks', async () => {
        const emuProject = process.env.GCLOUD_PROJECT || 'demo-ganewa';
        const authAdminBase = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${emuProject}`;
        const authClientBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';

        const publicSignUp = async (email: string, password: string) => {
            const res = await fetch(`${authClientBase}/accounts:signUp?key=fake-api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, returnSecureToken: true })
            });
            const body = await res.json();
            return { status: res.status, body };
        };

        // 1. Public self-signup with @staff.ganewa.invalid is blocked by beforeUserCreated
        const blockedStaffSignup = await publicSignUp(`attacker${STAFF_EMAIL_SUFFIX}`, 'Password123!');
        expect(blockedStaffSignup.status).not.toBe(200);

        // Public self-signup with store email is also blocked
        const blockedStoreSignup = await publicSignUp('ganewashoppingmallkurfi@gmail.com', 'Password123!');
        expect(blockedStoreSignup.status).not.toBe(200);

        // Regular customer self-signup succeeds
        const uniqueCustomerEmail = `customer_${Date.now()}@gmail.com`;
        const customerSignup = await publicSignUp(uniqueCustomerEmail, 'Password123!');
        expect(customerSignup.status).toBe(200);

        // 2. Real migrateStaffAccounts refusal & clean staff creation against Auth + Firestore emulators
        // Clean up any prior test accounts
        for (const uid of ['hijacker_auth_uid', 'legit_cashier_uid', 'clean_cashier_uid']) {
            await fetch(`${authAdminBase}/accounts:delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
                body: JSON.stringify({ localId: uid })
            }).catch(() => {});
        }

        // Create conflicting Auth user with hijacker_auth_uid
        const hijackCreate = await fetch(`${authAdminBase}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
            body: JSON.stringify({
                localId: 'hijacker_auth_uid',
                email: `cashier1${STAFF_EMAIL_SUFFIX}`,
                password: 'HijackPass123!'
            })
        });
        expect(hijackCreate.status).toBe(200);

        // Run real migrate-staff-accounts.js in ../functions against the emulators
        const functionsDir = path.resolve(__dirname, '../../../functions');
        const script = `
          const { initializeApp, getApps } = require('firebase-admin/app');
          const { getFirestore } = require('firebase-admin/firestore');
          (async () => {
            if (!getApps().length) initializeApp({ projectId: '${emuProject}' });
            const db = getFirestore();
            await db.collection('users').doc('legit_cashier_uid').set({ username: 'cashier1', role: 'CASHIER', active: true });
            await db.collection('users').doc('clean_cashier_uid').set({ username: 'cleancashier', role: 'CASHIER', active: true });
            const { migrateStaffAccounts } = require('./lib/admin/migrate-staff-accounts.js');
            const res = await migrateStaffAccounts({ dryRun: false });
            console.log('MIGRATION_RESULT_JSON:' + JSON.stringify(res));
          })().catch(e => { console.error(e); process.exit(1); });
        `;

        const stdout = execFileSync('node', ['-e', script], {
            cwd: functionsDir,
            env: {
                ...process.env,
                FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
                FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
                GCLOUD_PROJECT: emuProject
            },
            encoding: 'utf8'
        });

        const match = stdout.match(/MIGRATION_RESULT_JSON:(.*)/);
        expect(match).toBeTruthy();
        const migrationResult = JSON.parse(match![1]);

        expect(migrationResult.errors.some((e: string) =>
            e.includes(`SECURITY ALERT: Account already exists for email cashier1${STAFF_EMAIL_SUFFIX} under UID hijacker_auth_uid (differs from Firestore UID legit_cashier_uid)`)
        )).toBe(true);

        // Verify clean_cashier_uid was created with @staff.ganewa.invalid and can sign in
        const createdClean = migrationResult.tempPasswordsIssued.find((x: any) => x.username === 'cleancashier');
        expect(createdClean).toBeTruthy();
        expect(createdClean.email).toBe(`cleancashier${STAFF_EMAIL_SUFFIX}`);

        const cleanSignInRes = await fetch(`${authClientBase}/accounts:signInWithPassword?key=fake-api-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: createdClean.email,
                password: createdClean.tempPass,
                returnSecureToken: true
            })
        });
        expect(cleanSignInRes.status).toBe(200);
    }, 30000);

    it('STOCK RULE: sale document must include this product with quantity matching the decrement; dummy mismatched sale is rejected', async () => {
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            await admin.firestore().collection('products').doc('p_mismatch_item').set({
                name: 'Mismatch Verification Item',
                quantity: 10,
                sellPrice: 2000,
                stockValue: 20000,
                updated_at: new Date().toISOString()
            });
        });

        const cashier = testEnv.authenticatedContext('cashier_mismatch', { role: 'CASHIER' }).firestore();
        const pRef = cashier.collection('products').doc('p_mismatch_item');

        // Attempt dummy sale where decrement is 3 units, but sale document specifies quantity: 1
        await assertFails(cashier.runTransaction(async (tx) => {
            const saleRef = cashier.collection('sales').doc('sale_fake_qty');
            tx.set(saleRef, {
                id: 'sale_fake_qty',
                totalAmount: 2000,
                items: [{
                    productId: 'p_mismatch_item',
                    productName: 'Mismatch Verification Item',
                    quantity: 1,
                    price: 2000,
                    costPrice: 1500,
                    total: 2000
                }],
                itemQuantities: { p_mismatch_item: 1 },
                date: new Date().toISOString()
            });
            // Decrementing by 3 units while sale says 1 -> Must fail!
            tx.update(pRef, {
                quantity: 7,
                stockValue: 14000,
                lastSaleId: 'sale_fake_qty',
                updated_at: new Date().toISOString()
            });
        }));

        // Legitimate sale with full usePOS SaleItem shape (extra fields) where decrement matches quantity
        await assertSucceeds(cashier.runTransaction(async (tx) => {
            const saleRef = cashier.collection('sales').doc('sale_correct_qty');
            tx.set(saleRef, {
                id: 'sale_correct_qty',
                totalAmount: 4000,
                items: [{
                    productId: 'p_mismatch_item',
                    productName: 'Mismatch Verification Item',
                    quantity: 2,
                    price: 2000,
                    costPrice: 1500,
                    discount: 0,
                    total: 4000
                }],
                itemQuantities: { p_mismatch_item: 2 },
                date: new Date().toISOString()
            });
            // Decrementing by 2 units while sale says 2 -> Succeeded!
            tx.update(pRef, {
                quantity: 8,
                stockValue: 16000,
                lastSaleId: 'sale_correct_qty',
                updated_at: new Date().toISOString()
            });
        }));
    });
});
