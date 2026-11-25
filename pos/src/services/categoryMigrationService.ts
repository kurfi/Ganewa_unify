import { db } from '../firebase/config';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { slugify } from '../utils/slugify';
import { PRODUCT_CATEGORIES } from '../constants/productCategories';
import { Category, Product, UserRole } from '../types';
import { logAudit } from '../firebase/firestoreHelpers';

export interface DistinctCategoryReport {
    rawCategory: string;
    productCount: number;
    sampleProductNames: string[];
    proposedTargetName: string | null; // null if unmapped / needs decision
    status: 'mapped' | 'unmapped' | 'exact_match';
}

export interface MigrationDryRunResult {
    isDryRun: boolean;
    sessionId: string;
    timestamp: string;
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
    resumedFromInterruption: boolean;
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

// Tracks the most recent dry run in the current session
let lastSessionDryRun: MigrationDryRunResult | null = null;

export function getLastSessionDryRun(): MigrationDryRunResult | null {
    return lastSessionDryRun;
}

/**
 * Performs a dry run analysis of categories and products.
 * Does NOT write any data to Firestore.
 */
export async function dryRunUnifiedCategories(): Promise<MigrationDryRunResult> {
    // 1. Fetch current categories from Firestore
    const catSnap = await getDocs(collection(db, 'categories'));
    const existingCats = new Map<string, Category>();
    catSnap.docs.forEach(d => {
        const data = d.data() as Category;
        existingCats.set(data.name.toLowerCase().trim(), { id: d.id, ...data });
    });

    // 2. Identify missing standard categories to create
    const categoriesToCreate: Array<{ name: string; slug: string; sortOrder: number }> = [];
    let sortOrder = existingCats.size;
    for (const stdName of PRODUCT_CATEGORIES) {
        if (!existingCats.has(stdName.toLowerCase().trim())) {
            sortOrder++;
            categoriesToCreate.push({
                name: stdName,
                slug: slugify(stdName),
                sortOrder
            });
        }
    }

    // 3. Inspect every product and aggregate distinct category strings
    const prodSnap = await getDocs(collection(db, 'products'));
    const categoryGroupMap = new Map<string, { count: number; samples: string[] }>();

    prodSnap.docs.forEach(docSnap => {
        const p = docSnap.data() as Product;
        const raw = (p.category || p.department || '').trim();
        const key = raw || '(empty)';

        if (!categoryGroupMap.has(key)) {
            categoryGroupMap.set(key, { count: 0, samples: [] });
        }
        const grp = categoryGroupMap.get(key)!;
        grp.count++;
        if (grp.samples.length < 3 && p.name) {
            grp.samples.push(p.name);
        }
    });

    // 4. Map distinct groups to approved targets
    const productAnalysis: DistinctCategoryReport[] = [];
    let productsToUpdateCount = 0;
    let unmappedProductsCount = 0;

    categoryGroupMap.forEach((val, rawCat) => {
        const lower = rawCat.toLowerCase().trim();
        let proposedTarget: string | null = null;
        let status: 'mapped' | 'unmapped' | 'exact_match' = 'unmapped';

        if (PRODUCT_CATEGORIES.some(c => c.toLowerCase() === lower)) {
            status = 'exact_match';
            proposedTarget = PRODUCT_CATEGORIES.find(c => c.toLowerCase() === lower)!;
        } else if (APPROVED_LEGACY_MAPPINGS[lower]) {
            status = 'mapped';
            proposedTarget = APPROVED_LEGACY_MAPPINGS[lower];
        } else {
            status = 'unmapped';
            proposedTarget = null;
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

    // 5. Count products that actually need updates
    for (const docSnap of prodSnap.docs) {
        const p = docSnap.data() as Product;
        const raw = (p.category || p.department || '').trim().toLowerCase();
        let targetName: string | null = null;

        if (PRODUCT_CATEGORIES.some(c => c.toLowerCase() === raw)) {
            targetName = PRODUCT_CATEGORIES.find(c => c.toLowerCase() === raw)!;
        } else if (APPROVED_LEGACY_MAPPINGS[raw]) {
            targetName = APPROVED_LEGACY_MAPPINGS[raw];
        }

        if (targetName) {
            const existing = existingCats.get(targetName.toLowerCase());
            // Needs update if categoryId is missing/mismatched or display name is not normalized
            if (!p.categoryId || (existing && p.categoryId !== existing.id) || p.category !== targetName) {
                productsToUpdateCount++;
            }
        }
    }

    const report: MigrationDryRunResult = {
        isDryRun: true,
        sessionId: `dryrun-${Date.now()}`,
        timestamp: new Date().toISOString(),
        categoriesToCreate,
        existingCategories: Array.from(existingCats.values()).map(c => c.name),
        productAnalysis,
        productsToUpdateCount,
        unmappedProductsCount
    };

    lastSessionDryRun = report;
    return report;
}

/**
 * Executes the real migration to assign categoryId and normalize display category copies.
 * - Enforces SUPER_ADMIN role.
 * - Requires explicit typed confirmation matching "MIGRATE CATEGORIES".
 * - Requires a successful dry run in the same session.
 * - Idempotent and resumable in chunks <= 500 writes.
 * - Creates exactly one audit log entry for the run.
 */
export async function executeUnifiedCategoriesMigration(
    currentUserRole: UserRole | string,
    currentUsername: string,
    typedConfirmation: string,
    dryRunSessionId?: string
): Promise<MigrationExecutionResult> {
    const result: MigrationExecutionResult = {
        categoriesCreated: 0,
        productsMigrated: 0,
        errors: [],
        resumedFromInterruption: false
    };

    // Safety checks
    if (currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== 'SUPER_ADMIN') {
        throw new Error('Permission denied: Only SUPER_ADMIN can execute the unified categories migration.');
    }

    if (typedConfirmation.trim() !== 'MIGRATE CATEGORIES') {
        throw new Error('Safety confirmation mismatch: You must type "MIGRATE CATEGORIES" to confirm.');
    }

    if (!lastSessionDryRun) {
        throw new Error('Safety block: You must run a Dry-Run inspection in the same session before executing the migration.');
    }

    if (dryRunSessionId && dryRunSessionId !== lastSessionDryRun.sessionId) {
        throw new Error('Stale Dry-Run session: Please run a new Dry-Run before executing.');
    }

    try {
        // 1. Fetch current categories and create any missing approved standard categories
        const catSnap = await getDocs(collection(db, 'categories'));
        const catMap = new Map<string, { id: string; name: string }>();
        catSnap.docs.forEach(d => {
            const data = d.data() as Category;
            catMap.set(data.name.toLowerCase().trim(), { id: d.id, name: data.name });
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

            // Only update if target is known and product is not yet matching
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

        // 3. Log a single audit entry for the entire migration run
        await logAudit(
            'MIGRATE_UNIFIED_CATEGORIES',
            `Unified categories migration completed: ${result.productsMigrated} products updated, ${result.categoriesCreated} standard categories created. Dry-run session: ${lastSessionDryRun.sessionId}`,
            currentUsername || 'Super Admin'
        );

        return result;
    } catch (err: any) {
        console.error('Migration execution failed:', err);
        result.errors.push(err.message || String(err));
        return result;
    }
}
