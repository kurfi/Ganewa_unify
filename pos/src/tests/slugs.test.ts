import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
    initializeTestEnvironment,
    RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import { slugify, isSlugUnique, resolveCategoryBySlug } from '../utils/slugify';
import { Category } from '../types';

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

describe('Slug resolution and uniqueness against real Firestore emulator', () => {
    it('generates URL safe slug', () => {
        expect(slugify('Other / Miscellaneous')).toBe('other-miscellaneous');
        expect(slugify('Grains, Noodles & Staples')).toBe('grains-noodles-staples');
    });

    it('queries and resolves current slugs and oldSlugs redirects from real emulator', async () => {
        // Seed categories in real emulator
        await testEnv.withSecurityRulesDisabled(async (admin) => {
            const db = admin.firestore();
            await db.collection('categories').doc('cat_bev').set({
                name: 'Beverages',
                slug: 'beverages',
                oldSlugs: ['drinks', 'cold-drinks'],
                active: true,
                sortOrder: 1
            });
            await db.collection('categories').doc('cat_snacks').set({
                name: 'Snacks & Biscuits',
                slug: 'snacks-biscuits',
                oldSlugs: ['biscuit', 'cookies'],
                active: true,
                sortOrder: 2
            });
        });

        const clientDb = testEnv.unauthenticatedContext().firestore();

        // 1. Fetch categories from emulator
        const snap = await clientDb.collection('categories').where('active', '==', true).get();
        const loadedCategories: Category[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Category));

        expect(loadedCategories.length).toBe(2);

        // 2. Test uniqueness against live emulator data
        const conflictCurrent = isSlugUnique('beverages', loadedCategories);
        expect(conflictCurrent.isAvailable).toBe(false);
        expect(conflictCurrent.conflictReason).toContain('already used as current slug');

        const conflictOld = isSlugUnique('cold-drinks', loadedCategories);
        expect(conflictOld.isAvailable).toBe(false);
        expect(conflictOld.conflictReason).toContain('reserved as a historical redirect');

        const allowedSelf = isSlugUnique('beverages', loadedCategories, 'cat_bev');
        expect(allowedSelf.isAvailable).toBe(true);

        const allowedNew = isSlugUnique('fresh-produce', loadedCategories);
        expect(allowedNew.isAvailable).toBe(true);

        // 3. Test direct slug resolution
        const direct = resolveCategoryBySlug('beverages', loadedCategories);
        expect(direct.category?.id).toBe('cat_bev');
        expect(direct.isRedirect).toBe(false);
        expect(direct.targetSlug).toBe('beverages');

        // 4. Test oldSlugs resolution and redirect target
        const redirect = resolveCategoryBySlug('drinks', loadedCategories);
        expect(redirect.category?.id).toBe('cat_bev');
        expect(redirect.isRedirect).toBe(true);
        expect(redirect.targetSlug).toBe('beverages');

        // 5. Test real Firestore array-contains query for SEO branch lookup
        const seoQuery = await clientDb
            .collection('categories')
            .where('active', '==', true)
            .where('oldSlugs', 'array-contains', 'cookies')
            .get();

        expect(seoQuery.empty).toBe(false);
        expect(seoQuery.docs[0].id).toBe('cat_snacks');
        expect(seoQuery.docs[0].data().slug).toBe('snacks-biscuits');
    });
});
