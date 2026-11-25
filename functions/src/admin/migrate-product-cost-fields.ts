import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
    initializeApp();
}

const db = getFirestore();

/**
 * Migrate Sensitive Cost & Supplier Fields to privateData Subcollection
 * 
 * Extracts `buyPrice`, `costPrice`, `supplierId`, `supplierName` from public `products/{id}` documents,
 * copies them to `products/{id}/privateData/financials`, and removes them from the root product document.
 * 
 * Supports dryRun (default: false unless --dry-run passed).
 */
export async function migrateProductCostFields(options: { dryRun?: boolean; force?: boolean } = {}) {
    const isDryRun = options.dryRun ?? false;
    const isForce = options.force ?? false;

    // Safety check 1: Marker document in settings/costFieldsMigration must exist with codeSwitched: true
    const markerSnap = await db.doc('settings/costFieldsMigration').get();
    if (!markerSnap.exists || markerSnap.data()?.codeSwitched !== true) {
        throw new Error(
            'SAFETY REFUSAL: Missing required marker document settings/costFieldsMigration with { codeSwitched: true }. ' +
            'The data migration cannot run before frontend and backend code has been completely switched to read/write products/{id}/privateData/financials.'
        );
    }

    // Safety check 2: Must not run against live production without explicit dry run or force
    const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
    if (!isEmulator && !isDryRun && !isForce) {
        throw new Error(
            'SAFETY REFUSAL: The data migration must not be runnable against production before explicit --force flag is passed.'
        );
    }
    console.log(`[CostMigration] Starting product cost migration... (dryRun=${isDryRun}, isEmulator=${isEmulator})`);

    const productsSnap = await db.collection('products').get();
    console.log(`[CostMigration] Found ${productsSnap.size} total product documents.`);

    let migratedCount = 0;

    for (const docSnap of productsSnap.docs) {
        const prodData = docSnap.data();
        const hasSensitiveData = prodData.buyPrice !== undefined ||
            prodData.costPrice !== undefined ||
            prodData.supplierId !== undefined ||
            prodData.supplierName !== undefined;

        if (hasSensitiveData) {
            migratedCount++;
            console.log(`[CostMigration] Migrating sensitive fields for product ${docSnap.id} (${prodData.name})`);

            if (!isDryRun) {
                const privateDataRef = db.doc(`products/${docSnap.id}/privateData/financials`);

                // Write to staff-only privateData subcollection
                await privateDataRef.set({
                    buyPrice: prodData.buyPrice ?? prodData.costPrice ?? 0,
                    costPrice: prodData.costPrice ?? prodData.buyPrice ?? 0,
                    supplierId: prodData.supplierId ?? null,
                    supplierName: prodData.supplierName ?? null,
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });

                // Delete sensitive fields from the root product document
                await db.collection('products').doc(docSnap.id).update({
                    buyPrice: FieldValue.delete(),
                    costPrice: FieldValue.delete(),
                    supplierId: FieldValue.delete(),
                    supplierName: FieldValue.delete()
                });
            }
        }
    }

    console.log(`[CostMigration] Completed. Processed ${migratedCount} products with sensitive cost/supplier data.`);
    return { migratedCount, dryRun: isDryRun };
}

if (process.argv[1]?.endsWith('migrate-product-cost-fields.ts') || process.argv[1]?.endsWith('migrate-product-cost-fields.js')) {
    const isDryRun = process.argv.includes('--dry-run');
    migrateProductCostFields({ dryRun: isDryRun })
        .then(() => process.exit(0))
        .catch(err => {
            console.error('[CostMigration] Error:', err);
            process.exit(1);
        });
}
