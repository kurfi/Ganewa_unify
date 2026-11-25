#!/usr/bin/env npx tsx
/**
 * Emulator-Only Category Migration Script (Admin SDK)
 *
 * Runs strictly against the Firebase Local Emulator.
 * Refuses to run unless FIRESTORE_EMULATOR_HOST is set.
 *
 * Usage:
 *   npx tsx scripts/migrate-categories-emulator.ts --dry-run
 *   npx tsx scripts/migrate-categories-emulator.ts --execute
 */

// 1. Strict guard: Refuse to run unless FIRESTORE_EMULATOR_HOST is explicitly set
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('ERROR: Refusing to run! FIRESTORE_EMULATOR_HOST environment variable is not set.');
    console.error('This script is strictly for emulator use (e.g. export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080").');
    process.exit(1);
}

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
    initializeApp({ projectId: 'demo-ganewa' });
}

const db = getFirestore();

const STANDARD_CATEGORIES = [
    'Beverages (Drinks & Water)',
    'Milk & Dairy Products',
    'Hot Drinks (Tea, Coffee & Cocoa)',
    'Grains, Noodles & Staples',
    'Seasonings, Condiments & Oil',
    'Snacks, Biscuits & Confectionery',
    'Soap & Detergent',
    'Personal Care (Hair, Skin & Oral)',
    'Baby Products & Hygiene',
    'Household & Insect Control',
    'Eggs & Poultry',
    'Baking Supplies',
    'Stationery',
    'Other / Miscellaneous'
];

const APPROVED_MAPPINGS: Record<string, string> = {
    'general': 'Other / Miscellaneous',
    'biscuit': 'Snacks, Biscuits & Confectionery',
    'flour': 'Grains, Noodles & Staples',
    'vaseline': 'Personal Care (Hair, Skin & Oral)'
};

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

async function run() {
    const isExecute = process.argv.includes('--execute');
    console.log(`\n=== Unified Categories Migration (Admin SDK - Emulator Only) ===`);
    console.log(`FIRESTORE_EMULATOR_HOST: ${process.env.FIRESTORE_EMULATOR_HOST}`);
    console.log(`Mode: ${isExecute ? 'EXECUTE (REAL WRITES)' : 'DRY RUN (INSPECTION ONLY)'}\n`);

    // 1. Fetch categories
    const catSnap = await db.collection('categories').get();
    const catMap = new Map<string, { id: string; name: string }>();
    catSnap.docs.forEach(d => {
        const data = d.data();
        catMap.set((data.name || '').toLowerCase().trim(), { id: d.id, name: data.name });
    });

    console.log(`Existing categories found in emulator: ${catSnap.size}`);

    // Missing standard categories
    const missingStandards = STANDARD_CATEGORIES.filter(c => !catMap.has(c.toLowerCase()));
    console.log(`Missing standard categories to create: ${missingStandards.length}`);
    missingStandards.forEach(c => console.log(`  + ${c}`));

    // 2. Scan products
    const prodSnap = await db.collection('products').get();
    console.log(`\nScanning ${prodSnap.size} products...`);

    const distinctCategoryMap = new Map<string, { count: number; samples: string[] }>();
    const stellaProducts: Array<{ id: string; name: string; category: string }> = [];

    prodSnap.docs.forEach(d => {
        const p = d.data();
        const raw = (p.category || p.department || '').trim();
        const key = raw || '(empty)';

        if (!distinctCategoryMap.has(key)) {
            distinctCategoryMap.set(key, { count: 0, samples: [] });
        }
        const grp = distinctCategoryMap.get(key)!;
        grp.count++;
        if (grp.samples.length < 3 && p.name) {
            grp.samples.push(p.name);
        }

        if (key.toUpperCase() === 'STELLA') {
            stellaProducts.push({ id: d.id, name: p.name || 'Unnamed', category: raw });
        }
    });

    console.log(`\n--- Distinct Category Strings Analysis ---`);
    distinctCategoryMap.forEach((val, raw) => {
        const lower = raw.toLowerCase();
        let target = 'UNMAPPED (SKIPPED)';
        if (STANDARD_CATEGORIES.some(c => c.toLowerCase() === lower)) {
            target = `Exact Match -> ${STANDARD_CATEGORIES.find(c => c.toLowerCase() === lower)}`;
        } else if (APPROVED_MAPPINGS[lower]) {
            target = `Mapped -> ${APPROVED_MAPPINGS[lower]}`;
        }
        console.log(`"${raw}": ${val.count} product(s) | ${target} | samples: [${val.samples.join(', ')}]`);
    });

    if (stellaProducts.length > 0) {
        console.log(`\n--- STELLA Products Breakdown (${stellaProducts.length}) ---`);
        stellaProducts.forEach(p => console.log(`  - [${p.id}] "${p.name}" (category: "${p.category}")`));
    } else {
        console.log(`\nNo products with category "STELLA" found in current dataset.`);
    }

    if (!isExecute) {
        console.log(`\n[DRY RUN COMPLETE] To apply these changes on the emulator, rerun with --execute.\n`);
        process.exit(0);
    }

    // 3. Execution
    console.log(`\nExecuting migration via Admin SDK batching...`);
    let categoriesCreated = 0;
    let currentOrder = catSnap.size;

    for (const std of missingStandards) {
        currentOrder++;
        const newRef = db.collection('categories').doc();
        await newRef.set({
            name: std,
            slug: slugify(std),
            oldSlugs: [],
            sortOrder: currentOrder,
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        catMap.set(std.toLowerCase(), { id: newRef.id, name: std });
        categoriesCreated++;
    }

    let batch = db.batch();
    let batchCount = 0;
    let productsUpdated = 0;

    for (const d of prodSnap.docs) {
        const p = d.data();
        const raw = (p.category || p.department || '').trim();
        if (!raw) continue;

        const lower = raw.toLowerCase();
        let targetName: string | null = null;

        if (catMap.has(lower)) {
            targetName = catMap.get(lower)!.name;
        } else if (APPROVED_MAPPINGS[lower]) {
            targetName = APPROVED_MAPPINGS[lower];
        }

        if (targetName) {
            const targetCat = catMap.get(targetName.toLowerCase());
            if (targetCat && (p.categoryId !== targetCat.id || p.category !== targetCat.name)) {
                batch.update(db.doc(`products/${d.id}`), {
                    categoryId: targetCat.id,
                    category: targetCat.name,
                    updated_at: new Date().toISOString()
                });
                batchCount++;
                productsUpdated++;

                if (batchCount >= 500) {
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }
            }
        }
    }

    if (batchCount > 0) {
        await batch.commit();
    }

    console.log(`\n✅ Migration Complete!`);
    console.log(`Categories created: ${categoriesCreated}`);
    console.log(`Products updated with categoryId: ${productsUpdated}\n`);
    process.exit(0);
}

run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
