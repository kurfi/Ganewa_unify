import { db } from '../firebase/config';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { slugify } from '../utils/slugify';
import { PRODUCT_CATEGORIES } from '../constants/productCategories';
import { Category, Product } from '../types';

export interface DistinctCategoryReport {
    rawCategory: string;
    productCount: number;
    sampleProductNames: string[];
    proposedTargetName: string | null; // null if unmapped / needs decision
    status: 'mapped' | 'unmapped' | 'exact_match';
}

export interface MigrationDryRunResult {
    isDryRun: boolean;
    categoriesToCreate: Array<{ name: string; slug: string; sortOrder: number }>;
    existingCategories: string[];
    productAnalysis: DistinctCategoryReport[];
    productsToUpdateCount: number;
    unmappedProductsCount: number;
}

export interface MigrationExecutionResult {
    categoriesCreated: number;
    productsMigrated: number;
    errors: string[];
}

/**
 * Standard mapping approved by user:
 * - General -> Other / Miscellaneous
 * - BISCUIT -> Snacks, Biscuits & Confectionery
 * - FLOUR -> Grains, Noodles & Staples
 * - VASELINE -> Personal Care (Hair, Skin & Oral)
 * - STELLA -> unmapped (awaiting user decision)
 */
export const APPROVED_LEGACY_MAPPINGS: Record<string, string> = {
    'general': 'Other / Miscellaneous',
    'biscuit': 'Snacks, Biscuits & Confectionery',
    'flour': 'Grains, Noodles & Staples',
    'vaseline': 'Personal Care (Hair, Skin & Oral)'
};

/**
 * Performs a dry run analysis of categories and products.
 * Does NOT write any data to Firestore.
 */
export async function dryRunUnifiedCategories(): Promise<MigrationDryRunResult> {
    // 1. Fetch current categories from Firestore
    const catSnap = await getDocs(collection(db, 'categories'));
    const existingCats: string[] = [];
    const existingCatNamesLower = new Set<string>();
    catSnap.forEach(d => {
        const name = d.data().name?.trim();
        if (name) {
            existingCats.push(name);
            existingCatNamesLower.add(name.toLowerCase());
        }
    });

    // 2. Identify which standard predefined categories need to be created
    const categoriesToCreate: Array<{ name: string; slug: string; sortOrder: number }> = [];
    let nextSortOrder = catSnap.size;
    for (const stdName of PRODUCT_CATEGORIES) {
        if (!existingCatNamesLower.has(stdName.toLowerCase())) {
            nextSortOrder++;
            categoriesToCreate.push({
                name: stdName,
                slug: slugify(stdName),
                sortOrder: nextSortOrder
            });
        }
    }

    // 3. Inspect every product and aggregate distinct category strings
    const prodSnap = await getDocs(collection(db, 'products'));
    const categoryGroupMap = new Map<string, { count: number; samples: string[] }>();

    prodSnap.forEach(d => {
        const p = d.data() as Product;
        const raw = (p.category || p.department || '').trim();
        const key = raw || '(empty / missing)';

        if (!categoryGroupMap.has(key)) {
            categoryGroupMap.set(key, { count: 0, samples: [] });
        }
        const grp = categoryGroupMap.get(key)!;
        grp.count++;
        if (grp.samples.length < 3 && p.name) {
            grp.samples.push(p.name);
        }
    });

    // 4. Map distinct categories
    const stdLowerMap = new Map<string, string>();
    PRODUCT_CATEGORIES.forEach(c => stdLowerMap.set(c.toLowerCase(), c));

    const productAnalysis: DistinctCategoryReport[] = [];
    let productsToUpdateCount = 0;
    let unmappedProductsCount = 0;

    categoryGroupMap.forEach((val, rawCat) => {
        const lower = rawCat.toLowerCase();
        let proposedTarget: string | null = null;
        let status: 'mapped' | 'unmapped' | 'exact_match' = 'unmapped';

        if (stdLowerMap.has(lower)) {
            proposedTarget = stdLowerMap.get(lower)!;
            status = 'exact_match';
            // Only needs update if casing differs or missing categoryId
            productsToUpdateCount += val.count;
        } else if (APPROVED_LEGACY_MAPPINGS[lower]) {
            proposedTarget = APPROVED_LEGACY_MAPPINGS[lower];
            status = 'mapped';
            productsToUpdateCount += val.count;
        } else {
            status = 'unmapped';
            unmappedProductsCount += val.count;
        }

        productAnalysis.push({
            rawCategory: rawCat,
            productCount: val.count,
            sampleProductNames: val.samples,
            proposedTargetName: proposedTarget,
            status
        });
    });

    return {
        isDryRun: true,
        categoriesToCreate,
        existingCategories: existingCats,
        productAnalysis,
        productsToUpdateCount,
        unmappedProductsCount
    };
}

/**
 * Executes migration with idempotent guarantees.
 * Requires confirmed = true.
 * Updates products in chunks <= 500 per batch.
 * Never silently maps unapproved categories.
 */
export async function executeUnifiedCategoriesMigration(confirmed: boolean): Promise<MigrationExecutionResult> {
    if (!confirmed) {
        throw new Error('Migration aborted: explicit confirmation is required.');
    }

    const result: MigrationExecutionResult = {
        categoriesCreated: 0,
        productsMigrated: 0,
        errors: []
    };

    try {
        // 1. Fetch / ensure 14 categories exist idempotently
        const catSnap = await getDocs(collection(db, 'categories'));
        const catMap = new Map<string, { id: string; name: string }>(); // lower(name) -> doc
        catSnap.forEach(d => {
            const data = d.data();
            if (data.name) {
                catMap.set(data.name.trim().toLowerCase(), { id: d.id, name: data.name });
            }
        });

        let currentOrder = catSnap.size;
        for (const stdName of PRODUCT_CATEGORIES) {
            const lower = stdName.toLowerCase();
            if (!catMap.has(lower)) {
                currentOrder++;
                const newCat: Category = {
                    name: stdName,
                    slug: slugify(stdName),
                    oldSlugs: [],
                    sortOrder: currentOrder,
                    active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                const newRef = doc(collection(db, 'categories'));
                await setDoc(newRef, newCat);
                catMap.set(lower, { id: newRef.id, name: stdName });
                result.categoriesCreated++;
            }
        }

        // 2. Fetch products and apply categoryId + canonical category name in batches <= 500
        const prodSnap = await getDocs(collection(db, 'products'));
        let batch = writeBatch(db);
        let batchCount = 0;

        for (const pDoc of prodSnap.docs) {
            const p = pDoc.data() as Product;
            const raw = (p.category || p.department || '').trim();
            if (!raw) continue;

            const lower = raw.toLowerCase();
            let targetName: string | null = null;

            if (catMap.has(lower)) {
                targetName = catMap.get(lower)!.name;
            } else if (APPROVED_LEGACY_MAPPINGS[lower]) {
                targetName = APPROVED_LEGACY_MAPPINGS[lower];
            }

            if (targetName) {
                const targetCat = catMap.get(targetName.toLowerCase());
                if (targetCat && (p.categoryId !== targetCat.id || p.category !== targetCat.name)) {
                    batch.update(doc(db, 'products', pDoc.id), {
                        categoryId: targetCat.id,
                        category: targetCat.name,
                        updated_at: new Date().toISOString()
                    });
                    batchCount++;
                    result.productsMigrated++;

                    if (batchCount >= 500) {
                        await batch.commit();
                        batch = writeBatch(db);
                        batchCount = 0;
                    }
                }
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        return result;
    } catch (err: any) {
        console.error('Migration execution failed:', err);
        result.errors.push(err.message || String(err));
        return result;
    }
}
