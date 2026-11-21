/**
 * audit-quantity-local.mjs
 *
 * READ-ONLY audit using the already-exported firebase-export/products.json.
 * No network calls, no quota issues.
 *
 * Usage:
 *   node scripts/audit-quantity-local.mjs
 *
 * If the export is stale, refresh it first:
 *   node scripts/export-from-firebase.mjs
 * then re-run this script.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPORT_PATH = path.join(__dirname, '../firebase-export/products.json');

if (!fs.existsSync(EXPORT_PATH)) {
    console.error(`❌ Export file not found: ${EXPORT_PATH}`);
    console.error('   Run: node scripts/export-from-firebase.mjs first.');
    process.exit(1);
}

const stat = fs.statSync(EXPORT_PATH);
const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);

const products = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf-8'));

// --------------- Quantity validation ---------------
function quantityProblem(q) {
    if (q === undefined || q === null)     return 'missing / null';
    if (typeof q === 'string')             return `string ("${q}")`;
    if (typeof q === 'boolean')            return `boolean (${q})`;
    if (typeof q !== 'number')             return `unexpected type (${typeof q})`;
    if (!isFinite(q) || isNaN(q))         return `non-finite number (${q})`;
    return null; // OK
}

// --------------- Run audit ---------------
console.log('');
console.log('🔍 Quantity Audit (offline — from local export)');
console.log(`📁 File  : ${EXPORT_PATH}`);
console.log(`🗓️  Age   : ${ageDays < 1 ? 'today' : Math.round(ageDays) + ' day(s) ago'} — ${stat.mtime.toLocaleString()}`);
if (ageDays > 7) {
    console.log('   ⚠️  Export is more than 7 days old. Consider refreshing: node scripts/export-from-firebase.mjs');
}
console.log('');

const bad = [];
const softDeleted = [];

for (const p of products) {
    const problem = quantityProblem(p.quantity);
    if (problem) {
        if (p.deleted === true) {
            softDeleted.push({ id: p.id, name: p.name, quantity: p.quantity, problem });
        } else {
            bad.push({ id: p.id, name: p.name, quantity: p.quantity, problem, deleted: p.deleted });
        }
    }
}

const okCount = products.length - bad.length - softDeleted.length;

console.log('═'.repeat(70));
console.log('📊  AUDIT RESULTS');
console.log('═'.repeat(70));
console.log(`  Total products scanned : ${products.length}`);
console.log(`  ✅ Valid quantity        : ${okCount}`);
console.log(`  🗑️  Soft-deleted (bad qty): ${softDeleted.length}  (won't appear on storefront anyway)`);
console.log(`  ❌ Live docs — bad qty  : ${bad.length}`);
console.log('');

if (bad.length === 0) {
    console.log('🎉 No quantity issues found in live (non-deleted) products!');
} else {
    console.log('❌ LIVE PRODUCTS WITH BAD quantity (silently excluded by Firestore range filter):');
    console.log('─'.repeat(72));
    console.log('DOC ID'.padEnd(24) + 'NAME'.padEnd(28) + 'quantity'.padEnd(14) + 'PROBLEM');
    console.log('─'.repeat(72));

    for (const p of bad) {
        const idCol  = String(p.id   || '').slice(0, 23).padEnd(24);
        const nmCol  = String(p.name || '(no name)').slice(0, 27).padEnd(28);
        const qtyCol = String(p.quantity === undefined ? 'undefined' : p.quantity).slice(0, 13).padEnd(14);
        console.log(`${idCol}${nmCol}${qtyCol}${p.problem}`);
    }

    console.log('─'.repeat(72));
    console.log('');

    // Breakdown by problem type
    const byType = {};
    for (const p of bad) {
        const key = p.problem.split(' ')[0];
        byType[key] = (byType[key] || 0) + 1;
    }
    console.log('  Problem breakdown:');
    for (const [k, v] of Object.entries(byType)) {
        console.log(`    ${k.padEnd(22)} ${v}`);
    }
    console.log('');
    console.log('⚠️  These documents are silently excluded by the Firestore');
    console.log('   `where("quantity", ">", 0)` filter on the old Home.tsx query.');
    console.log('   (The new Home.tsx already filters locally, so this is now a data-quality');
    console.log('    issue only — products with quantity=0/null won\'t appear on the storefront');
    console.log('    anyway, but those with quantity="50" as a string would now correctly show.)');
    console.log('');
    console.log('👉 Run migrate-quantity.mjs (dry-run first) to coerce these to numbers:');
    console.log('   node scripts/migrate-quantity.mjs              # dry-run');
    console.log('   $env:DRY_RUN="false"; node scripts/migrate-quantity.mjs  # live write');
}

if (softDeleted.length > 0) {
    console.log(`\nℹ️  ${softDeleted.length} soft-deleted product(s) also have bad quantity — no action required.`);
}

// Extra: also report products with quantity === 0 (valid number but out-of-stock)
const outOfStock = products.filter(p => p.deleted !== true && typeof p.quantity === 'number' && p.quantity === 0);
if (outOfStock.length > 0) {
    console.log(`\nℹ️  ${outOfStock.length} live product(s) have quantity = 0 (valid number, correctly hidden from storefront).`);
}

console.log('\n🏁 Audit complete. No data was written.');
