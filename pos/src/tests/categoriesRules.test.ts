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

const PROJECT_ID = 'demo-ganewa';
const RULES_PATH = path.resolve(__dirname, '../../firestore.rules');

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
}, 30000);

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

describe('Category Rules on Firestore Emulator (pos/firestore.rules)', () => {
    it('CASHIER CANNOT CREATE CATEGORY: cashier is denied create', async () => {
        const cashier = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER', mustChangePassword: false }).firestore();
        await assertFails(
            cashier.collection('categories').doc('cat_drinks').set({
                name: 'Drinks',
                slug: 'drinks',
                active: true,
                sortOrder: 1
            })
        );
    });

    it('CASHIER CANNOT UPDATE CATEGORY: cashier is denied update', async () => {
        // Pre-create category using admin context
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            await admin.firestore().collection('categories').doc('cat_drinks').set({
                name: 'Drinks',
                slug: 'drinks',
                active: true,
                sortOrder: 1
            });
        });

        const cashier = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER', mustChangePassword: false }).firestore();
        await assertFails(
            cashier.collection('categories').doc('cat_drinks').update({
                name: 'Cold Drinks'
            })
        );
    });

    it('CASHIER CANNOT DELETE CATEGORY: cashier is denied delete', async () => {
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            await admin.firestore().collection('categories').doc('cat_drinks').set({
                name: 'Drinks',
                slug: 'drinks',
                active: true,
                sortOrder: 1
            });
        });

        const cashier = testEnv.authenticatedContext('cashier_1', { role: 'CASHIER', mustChangePassword: false }).firestore();
        await assertFails(
            cashier.collection('categories').doc('cat_drinks').delete()
        );
    });

    it('ADMIN CAN CREATE, UPDATE AND DELETE CATEGORIES: admin succeeds', async () => {
        const admin = testEnv.authenticatedContext('admin_1', { role: 'ADMIN', mustChangePassword: false }).firestore();

        // 1. Create
        await assertSucceeds(
            admin.collection('categories').doc('cat_snacks').set({
                name: 'Snacks & Biscuits',
                slug: 'snacks-biscuits',
                active: true,
                sortOrder: 2
            })
        );

        // 2. Update
        await assertSucceeds(
            admin.collection('categories').doc('cat_snacks').update({
                name: 'Snacks, Biscuits & Confectionery'
            })
        );

        // 3. Delete
        await assertSucceeds(
            admin.collection('categories').doc('cat_snacks').delete()
        );
    });

    it('SUPER_ADMIN CAN CREATE, UPDATE AND DELETE CATEGORIES: super_admin succeeds', async () => {
        const superAdmin = testEnv.authenticatedContext('super_1', { role: 'SUPER_ADMIN', mustChangePassword: false }).firestore();

        await assertSucceeds(
            superAdmin.collection('categories').doc('cat_bakery').set({
                name: 'Baking Supplies',
                slug: 'baking-supplies',
                active: true,
                sortOrder: 3
            })
        );

        await assertSucceeds(
            superAdmin.collection('categories').doc('cat_bakery').update({
                active: false
            })
        );

        await assertSucceeds(
            superAdmin.collection('categories').doc('cat_bakery').delete()
        );
    });

    it('ANONYMOUS READS ONLY ACTIVE CATEGORIES: doc reads', async () => {
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            await admin.firestore().collection('categories').doc('active_cat').set({
                name: 'Active Category',
                slug: 'active-cat',
                active: true
            });
            await admin.firestore().collection('categories').doc('inactive_cat').set({
                name: 'Hidden Category',
                slug: 'hidden-cat',
                active: false
            });
        });

        const unauthed = testEnv.unauthenticatedContext().firestore();

        // Reading active doc succeeds
        await assertSucceeds(unauthed.collection('categories').doc('active_cat').get());

        // Reading inactive doc fails
        await assertFails(unauthed.collection('categories').doc('inactive_cat').get());
    });

    it('ANONYMOUS QUERY WITHOUT active == true IS DENIED: list queries', async () => {
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            await admin.firestore().collection('categories').doc('active_cat').set({
                name: 'Active Category',
                slug: 'active-cat',
                active: true,
                sortOrder: 1
            });
        });

        const unauthed = testEnv.unauthenticatedContext().firestore();

        // Querying all categories without active filter is denied
        await assertFails(unauthed.collection('categories').get());

        // Querying explicitly where active == true succeeds
        await assertSucceeds(
            unauthed.collection('categories').where('active', '==', true).get()
        );
    });

    it('STAFF CAN READ BOTH ACTIVE AND INACTIVE CATEGORIES', async () => {
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            await admin.firestore().collection('categories').doc('inactive_cat').set({
                name: 'Hidden Category',
                slug: 'hidden-cat',
                active: false
            });
        });

        const cashier = testEnv.authenticatedContext('cashier_staff', { role: 'CASHIER', mustChangePassword: false }).firestore();
        // Staff can read hidden category
        await assertSucceeds(cashier.collection('categories').doc('inactive_cat').get());
        // Staff can list all categories without active filter
        await assertSucceeds(cashier.collection('categories').get());
    });

    it('NOBODY EXCEPT ADMINS CAN WRITE: unauthenticated & normal users denied write', async () => {
        const unauthed = testEnv.unauthenticatedContext().firestore();
        await assertFails(
            unauthed.collection('categories').doc('hack_cat').set({
                name: 'Hacked',
                active: true
            })
        );

        const normalShopper = testEnv.authenticatedContext('user_123', { role: 'USER' }).firestore();
        await assertFails(
            normalShopper.collection('categories').doc('hack_cat').set({
                name: 'Hacked Shopper',
                active: true
            })
        );
    });
});
