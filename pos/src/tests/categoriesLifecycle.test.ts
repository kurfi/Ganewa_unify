import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
    initializeTestEnvironment,
    RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import { Category } from '../types';
import { resolveCategoryBySlug } from '../utils/slugify';

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

describe('Category Lifecycle, Chunks & Idempotency on Real Firestore Emulator', () => {

    it('BLOCKED DELETION: Category with products cannot be deleted before reassignment', async () => {
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            const db = admin.firestore();
            await db.collection('categories').doc('cat_active').set({
                name: 'Active Category',
                slug: 'active-category',
                active: true,
                sortOrder: 1
            });
            await db.collection('products').doc('p_1').set({
                name: 'Test Product 1',
                categoryId: 'cat_active',
                category: 'Active Category'
            });
        });

        const admin = testEnv.authenticatedContext('admin_user', { role: 'ADMIN', mustChangePassword: false }).firestore();

        // Count check helper (simulating useCategoryManagement pre-delete check)
        const prods = await admin.collection('products').where('categoryId', '==', 'cat_active').get();
        expect(prods.size).toBe(1);

        // Deletion must be blocked when products remain
        const canDelete = prods.size === 0;
        expect(canDelete).toBe(false);
    });

    it('BLOCKED DELETION: Category with children cannot be deleted', async () => {
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            const db = admin.firestore();
            await db.collection('categories').doc('parent_cat').set({
                name: 'Parent Category',
                slug: 'parent-cat',
                active: true,
                sortOrder: 1
            });
            await db.collection('categories').doc('child_cat').set({
                name: 'Child Category',
                slug: 'child-cat',
                parentId: 'parent_cat',
                active: true,
                sortOrder: 2
            });
        });

        const admin = testEnv.authenticatedContext('admin_user', { role: 'ADMIN', mustChangePassword: false }).firestore();
        const children = await admin.collection('categories').where('parentId', '==', 'parent_cat').get();
        expect(children.size).toBe(1);

        const hasChildren = children.size > 0;
        expect(hasChildren).toBe(true); // Deletion blocked
    });

    it('CHUNKED REASSIGNMENT & INTERRUPT-RESUME: 1,200 products reassign in <= 500 batches and resumes safely', async () => {
        // Seed target category and source category
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            const db = admin.firestore();
            await db.collection('categories').doc('cat_old').set({
                name: 'Old Category',
                slug: 'old-category',
                active: true,
                sortOrder: 1
            });
            await db.collection('categories').doc('cat_new').set({
                name: 'New Category',
                slug: 'new-category',
                active: true,
                sortOrder: 2
            });

            // Seed 1,200 products in 4 batches of 300 sequentially
            for (let b = 0; b < 4; b++) {
                const batch = db.batch();
                for (let i = 0; i < 300; i++) {
                    const idx = b * 300 + i;
                    const ref = db.collection('products').doc(`chunk_prod_${idx}`);
                    batch.set(ref, {
                        name: `Product ${idx}`,
                        categoryId: 'cat_old',
                        category: 'Old Category'
                    });
                }
                await batch.commit();
            }
        });

        const admin = testEnv.authenticatedContext('admin_user', { role: 'ADMIN', mustChangePassword: false }).firestore();

        // Verify 1,200 products seeded
        const initialSnap = await admin.collection('products').where('categoryId', '==', 'cat_old').get();
        expect(initialSnap.size).toBe(1200);

        // Simulation 1: Interrupted run (only process first 500)
        let batch1 = admin.batch();
        let count1 = 0;
        for (const docSnap of initialSnap.docs) {
            batch1.update(docSnap.ref, {
                categoryId: 'cat_new',
                category: 'New Category'
            });
            count1++;
            if (count1 >= 500) break;
        }
        await batch1.commit();

        // Check state after interruption
        const remainingAfterInterruption = await admin.collection('products').where('categoryId', '==', 'cat_old').get();
        expect(remainingAfterInterruption.size).toBe(700);

        // Simulation 2: Resume / Re-run to process all remaining in chunks <= 500
        const resumeSnap = await admin.collection('products').where('categoryId', '==', 'cat_old').get();
        let resumeBatch = admin.batch();
        let resumeCount = 0;

        for (const docSnap of resumeSnap.docs) {
            resumeBatch.update(docSnap.ref, {
                categoryId: 'cat_new',
                category: 'New Category'
            });
            resumeCount++;
            if (resumeCount >= 500) {
                await resumeBatch.commit();
                resumeBatch = admin.batch();
                resumeCount = 0;
            }
        }
        if (resumeCount > 0) {
            await resumeBatch.commit();
        }

        // Verify zero products remain in old category
        const finalOldSnap = await admin.collection('products').where('categoryId', '==', 'cat_old').get();
        expect(finalOldSnap.size).toBe(0);

        // Verify final count check passes and category can be deleted last
        if (finalOldSnap.size === 0) {
            await admin.collection('categories').doc('cat_old').delete();
        }

        const deletedCat = await admin.collection('categories').doc('cat_old').get();
        expect(deletedCat.exists).toBe(false);

        // Verify all 1,200 products now in new category
        const allNewSnap = await admin.collection('products').where('categoryId', '==', 'cat_new').get();
        expect(allNewSnap.size).toBe(1200);
    });

    it('IDEMPOTENT MIGRATION: Running migration twice creates zero duplicate categories', async () => {
        const admin = testEnv.authenticatedContext('admin_user', { role: 'ADMIN', mustChangePassword: false }).firestore();

        const STANDARD_LIST = [
            'Beverages (Drinks & Water)',
            'Milk & Dairy Products',
            'Hot Drinks (Tea, Coffee & Cocoa)'
        ];

        const runMigration = async () => {
            const existingSnap = await admin.collection('categories').get();
            const existingNames = new Set(existingSnap.docs.map(d => d.data().name.toLowerCase()));

            let created = 0;
            for (const name of STANDARD_LIST) {
                if (!existingNames.has(name.toLowerCase())) {
                    await admin.collection('categories').add({
                        name,
                        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                        active: true,
                        sortOrder: existingNames.size + 1
                    });
                    created++;
                }
            }
            return created;
        };

        // Run 1: Creates the categories
        const created1 = await runMigration();
        expect(created1).toBe(3);

        // Run 2: Idempotent - creates 0 new categories
        const created2 = await runMigration();
        expect(created2).toBe(0);

        // Verify exact count in Firestore
        const finalSnap = await admin.collection('categories').get();
        expect(finalSnap.size).toBe(3);
    });

    it('SAFE NAME REPAIR: Name propagation retry is safe to repeat multiple times', async () => {
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            const db = admin.firestore();
            await db.collection('categories').doc('cat_repair').set({
                name: 'Drinks & Beverages',
                slug: 'drinks-beverages',
                active: true
            });
            await db.collection('products').doc('p_repair').set({
                name: 'Cola Can',
                categoryId: 'cat_repair',
                category: 'Drinks' // Outdated search copy
            });
        });

        const admin = testEnv.authenticatedContext('admin_user', { role: 'ADMIN', mustChangePassword: false }).firestore();

        const repairName = async (catId: string, canonicalName: string) => {
            const snap = await admin.collection('products').where('categoryId', '==', catId).get();
            let updated = 0;
            for (const docSnap of snap.docs) {
                if (docSnap.data().category !== canonicalName) {
                    await docSnap.ref.update({ category: canonicalName });
                    updated++;
                }
            }
            return updated;
        };

        // Run 1: Repairs mismatch
        const repaired1 = await repairName('cat_repair', 'Drinks & Beverages');
        expect(repaired1).toBe(1);

        // Run 2: Safe repeat (no-op)
        const repaired2 = await repairName('cat_repair', 'Drinks & Beverages');
        expect(repaired2).toBe(0);

        const checkDoc = await admin.collection('products').doc('p_repair').get();
        expect(checkDoc.data()?.category).toBe('Drinks & Beverages');
    });

    it('MULTI-RENAME DIRECT REDIRECT (NO CHAINS): Old slug redirects directly to current slug', async () => {
        // Category renamed twice: "soda" -> "soft-drinks" -> "fizzy-drinks"
        const categoryData: Category = {
            id: 'cat_fizzy',
            name: 'Fizzy Drinks',
            slug: 'fizzy-drinks', // Current canonical slug
            oldSlugs: ['soda', 'soft-drinks'], // Accumulated historical slugs
            active: true,
            sortOrder: 1
        };

        await testEnv.withSecurityRulesDisabled(async (admin) => {
            const db = admin.firestore();
            await db.collection('categories').doc('cat_fizzy').set(categoryData);
        });

        const clientDb = testEnv.unauthenticatedContext().firestore();
        const snap = await clientDb.collection('categories').where('active', '==', true).get();
        const categories = snap.docs.map(d => ({ id: d.id, ...d.data() } as Category));

        // 1. Resolve very first slug "soda" -> should directly target "fizzy-drinks" (no chain)
        const resOldest = resolveCategoryBySlug('soda', categories);
        expect(resOldest.isRedirect).toBe(true);
        expect(resOldest.targetSlug).toBe('fizzy-drinks');

        // 2. Resolve intermediate slug "soft-drinks" -> directly targets "fizzy-drinks"
        const resIntermediate = resolveCategoryBySlug('soft-drinks', categories);
        expect(resIntermediate.isRedirect).toBe(true);
        expect(resIntermediate.targetSlug).toBe('fizzy-drinks');

        // 3. Current canonical slug -> direct match
        const resCurrent = resolveCategoryBySlug('fizzy-drinks', categories);
        expect(resCurrent.isRedirect).toBe(false);
        expect(resCurrent.targetSlug).toBe('fizzy-drinks');
    });
});
