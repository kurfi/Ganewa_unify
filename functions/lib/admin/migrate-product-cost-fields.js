"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateProductCostFields = migrateProductCostFields;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
/**
 * Migrate Sensitive Cost & Supplier Fields to privateData Subcollection
 *
 * Extracts `buyPrice`, `costPrice`, `supplierId`, `supplierName` from public `products/{id}` documents,
 * copies them to `products/{id}/privateData/financials`, and removes them from the root product document.
 *
 * Supports dryRun (default: false unless --dry-run passed).
 */
async function migrateProductCostFields(options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const isDryRun = (_a = options.dryRun) !== null && _a !== void 0 ? _a : false;
    const isForce = (_b = options.force) !== null && _b !== void 0 ? _b : false;
    // Safety check 1: Marker document in settings/costFieldsMigration must exist with codeSwitched: true
    const markerSnap = await db.doc('settings/costFieldsMigration').get();
    if (!markerSnap.exists || ((_c = markerSnap.data()) === null || _c === void 0 ? void 0 : _c.codeSwitched) !== true) {
        throw new Error('SAFETY REFUSAL: Missing required marker document settings/costFieldsMigration with { codeSwitched: true }. ' +
            'The data migration cannot run before frontend and backend code has been completely switched to read/write products/{id}/privateData/financials.');
    }
    // Safety check 2: Must not run against live production without explicit dry run or force
    const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
    if (!isEmulator && !isDryRun && !isForce) {
        throw new Error('SAFETY REFUSAL: The data migration must not be runnable against production before explicit --force flag is passed.');
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
                    buyPrice: (_e = (_d = prodData.buyPrice) !== null && _d !== void 0 ? _d : prodData.costPrice) !== null && _e !== void 0 ? _e : 0,
                    costPrice: (_g = (_f = prodData.costPrice) !== null && _f !== void 0 ? _f : prodData.buyPrice) !== null && _g !== void 0 ? _g : 0,
                    supplierId: (_h = prodData.supplierId) !== null && _h !== void 0 ? _h : null,
                    supplierName: (_j = prodData.supplierName) !== null && _j !== void 0 ? _j : null,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                }, { merge: true });
                // Delete sensitive fields from the root product document
                await db.collection('products').doc(docSnap.id).update({
                    buyPrice: firestore_1.FieldValue.delete(),
                    costPrice: firestore_1.FieldValue.delete(),
                    supplierId: firestore_1.FieldValue.delete(),
                    supplierName: firestore_1.FieldValue.delete()
                });
            }
        }
    }
    console.log(`[CostMigration] Completed. Processed ${migratedCount} products with sensitive cost/supplier data.`);
    return { migratedCount, dryRun: isDryRun };
}
if (((_a = process.argv[1]) === null || _a === void 0 ? void 0 : _a.endsWith('migrate-product-cost-fields.ts')) || ((_b = process.argv[1]) === null || _b === void 0 ? void 0 : _b.endsWith('migrate-product-cost-fields.js'))) {
    const isDryRun = process.argv.includes('--dry-run');
    migrateProductCostFields({ dryRun: isDryRun })
        .then(() => process.exit(0))
        .catch(err => {
        console.error('[CostMigration] Error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate-product-cost-fields.js.map