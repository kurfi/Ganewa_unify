/**
 * fix-return-overcount.mjs
 *
 * One-time fix for sale #62731340-89d4-48b9-8496-b28a3d8eb9bf
 *
 * Problem: Two duplicate return transactions were processed for this sale,
 * causing returnedQuantity to exceed the original sold quantity (MAX shows -3).
 *
 * What this script does:
 *   1. Reads the sale and prints the current returnedQuantity on each item
 *   2. Finds all return + returnedItem documents linked to this sale
 *   3. In DRY-RUN mode (default): prints what it would do, makes NO changes
 *   4. In LIVE mode (pass --live): deletes the return docs and resets the sale items
 *
 * Usage:
 *   node scripts/fix-return-overcount.mjs           ← dry run (safe, no writes)
 *   node scripts/fix-return-overcount.mjs --live    ← actually apply the fix
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
    getFirestore, doc, getDoc, getDocs,
    collection, query, where,
    writeBatch, updateDoc, deleteDoc
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────
const SALE_ID = '62731340-89d4-48b9-8496-b28a3d8eb9bf';
const DRY_RUN = !process.argv.includes('--live');

const envPath = path.join(__dirname, '../.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const firebaseConfig = {
    apiKey:            envConfig.VITE_FIREBASE_API_KEY,
    authDomain:        envConfig.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         envConfig.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     envConfig.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             envConfig.VITE_FIREBASE_APP_ID,
};

const STORE_EMAIL    = 'ganewashoppingmallkurfi@gmail.com';
const STORE_PASSWORD = envConfig.VITE_FIREBASE_STORE_PASSWORD || 'GanewaStore123!';

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  Return Over-count Fix${DRY_RUN ? ' [DRY RUN — no changes will be made]' : ' [LIVE MODE — changes WILL be written]'}`);
    console.log('══════════════════════════════════════════════════════════════\n');

    // Auth
    console.log(`🔑 Signing in as ${STORE_EMAIL}…`);
    await signInWithEmailAndPassword(auth, STORE_EMAIL, STORE_PASSWORD);
    console.log('✅ Authenticated.\n');

    // ── 1. Read the sale ──
    const saleRef  = doc(db, 'sales', SALE_ID);
    const saleSnap = await getDoc(saleRef);
    if (!saleSnap.exists()) {
        console.error(`❌ Sale ${SALE_ID} not found in Firestore. Nothing to do.`);
        process.exit(1);
    }
    const saleData = saleSnap.data();
    const items    = saleData.items || [];

    console.log(`📄 Sale: #${SALE_ID}`);
    console.log(`   Customer: ${saleData.customerName || 'Unknown'}`);
    console.log(`   Date:     ${saleData.date?.toDate?.().toISOString?.() ?? saleData.date}`);
    console.log(`   Items:\n`);

    for (const item of items) {
        const soldQty     = item.quantity ?? 0;
        const returnedQty = item.returnedQuantity ?? 0;
        const maxReturnable = soldQty - returnedQty;
        const flag = maxReturnable < 0 ? ' ⚠️  NEGATIVE MAX' : maxReturnable === 0 ? ' (fully returned)' : '';
        console.log(`   • ${item.productName}`);
        console.log(`       Sold: ${soldQty}  |  returnedQuantity stored: ${returnedQty}  |  maxReturnable: ${maxReturnable}${flag}`);
    }

    // ── 2. Find all return docs for this sale ──
    console.log(`\n🔍 Looking up return records for this sale…`);
    const returnsQuery = query(
        collection(db, 'returns'),
        where('saleId', '==', SALE_ID)
    );
    const returnsSnap  = await getDocs(returnsQuery);
    const returnDocs   = returnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (returnDocs.length === 0) {
        console.log('   ℹ️  No return documents found for this sale.');
    } else {
        console.log(`   Found ${returnDocs.length} return document(s):\n`);
        for (const r of returnDocs) {
            const rDate = r.returnDate?.toDate?.().toISOString?.() ?? r.returnDate ?? r.created_at;
            console.log(`   • Return ID: ${r.id}`);
            console.log(`     Date:      ${rDate}`);
            console.log(`     Amount:    ₦${(r.totalRefundAmount ?? 0).toLocaleString()}`);
            console.log(`     Method:    ${r.paymentMethod}`);
        }
    }

    // ── 3. Find all returnedItem docs linked to those returns ──
    const allReturnedItemDocs = [];
    for (const r of returnDocs) {
        const riQuery = query(
            collection(db, 'returnedItems'),
            where('returnId', '==', r.id)
        );
        const riSnap = await getDocs(riQuery);
        riSnap.docs.forEach(d => allReturnedItemDocs.push({ id: d.id, ...d.data() }));
    }

    if (allReturnedItemDocs.length > 0) {
        console.log(`\n   Found ${allReturnedItemDocs.length} returnedItem document(s) to delete:\n`);
        for (const ri of allReturnedItemDocs) {
            console.log(`   • ReturnedItem ID: ${ri.id} | Product: ${ri.productName} | Qty: ${ri.quantity}`);
        }
    }

    // ── 4. Build the corrected sale items (reset returnedQuantity to 0) ──
    const fixedItems = items.map(item => ({
        ...item,
        returnedQuantity: 0,
    }));

    // ── 5. Print the plan ──
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('📋 PLAN:');
    console.log(`   • Reset returnedQuantity → 0 for all items on sale ${SALE_ID}`);
    if (returnDocs.length > 0) {
        console.log(`   • Delete ${returnDocs.length} return document(s) from /returns`);
    }
    if (allReturnedItemDocs.length > 0) {
        console.log(`   • Delete ${allReturnedItemDocs.length} returnedItem document(s) from /returnedItems`);
    }
    console.log('─────────────────────────────────────────────────────────────\n');

    if (DRY_RUN) {
        console.log('🛑 DRY RUN complete. No changes were made.');
        console.log('   Re-run with --live to apply the fix:\n');
        console.log('   node scripts/fix-return-overcount.mjs --live\n');
        process.exit(0);
    }

    // ── 6. Apply the fix ──
    console.log('✍️  Applying fix…');

    // Reset sale items
    await updateDoc(saleRef, {
        items: fixedItems,
        updated_at: new Date().toISOString(),
    });
    console.log(`   ✅ Sale items reset — returnedQuantity = 0 for all items.`);

    // Delete return docs
    for (const r of returnDocs) {
        await deleteDoc(doc(db, 'returns', r.id));
        console.log(`   🗑️  Deleted return: ${r.id}`);
    }

    // Delete returnedItem docs
    for (const ri of allReturnedItemDocs) {
        await deleteDoc(doc(db, 'returnedItems', ri.id));
        console.log(`   🗑️  Deleted returnedItem: ${ri.id}`);
    }

    console.log('\n🎉 Fix applied successfully!');
    console.log(`   Sale ${SALE_ID} is clean. MAX returnable values will now show correctly.`);
    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ Script failed:', err.message);
    process.exit(1);
});
