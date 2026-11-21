/**
 * Analyze inventory data for missing/duplicate products.
 * Investigates the complaint that items like "Tomato" went missing
 * and had to be re-added.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const exportDir = path.join(__dirname, '../firebase-export');

function load(name) {
    const p = path.join(exportDir, `${name}.json`);
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

const products = load('products');
const sales = load('sales');
const returns = load('returns');
const returnedItems = load('returnedItems');
const purchases = load('purchases');

const report = [];
function log(msg) { report.push(msg); console.log(msg); }

log('═══════════════════════════════════════════════════════════════');
log('  INVENTORY INTEGRITY ANALYSIS — Ganewa Shopping Mall POS');
log('═══════════════════════════════════════════════════════════════');
log(`  Analysis date: ${new Date().toISOString()}`);
log(`  Total products: ${products.length}`);
log(`  Total sales: ${sales.length}`);
log('');

// ─────────────────────────────────────────────────────────────────
// 1. Find duplicate product names (items that were re-added)
// ─────────────────────────────────────────────────────────────────
log('───────────────────────────────────────────────────────────────');
log('  1. DUPLICATE / RE-ADDED PRODUCTS (same name, different IDs)');
log('───────────────────────────────────────────────────────────────');

const nameMap = new Map(); // normalised name -> [product entries]
for (const p of products) {
    const key = (p.name || '').trim().toLowerCase();
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(p);
}

const duplicates = [];
for (const [name, items] of nameMap) {
    if (items.length > 1) {
        duplicates.push({ name, items });
    }
}

if (duplicates.length === 0) {
    log('  ✅ No duplicate product names found.\n');
} else {
    log(`  ⚠️  Found ${duplicates.length} products with duplicate names:\n`);
    for (const dup of duplicates.sort((a, b) => b.items.length - a.items.length)) {
        log(`  ▸ "${dup.items[0].name}" — ${dup.items.length} entries`);
        for (const item of dup.items) {
            log(`      ID: ${item.id}`);
            log(`      Barcode: ${item.barcode || '(none)'}`);
            log(`      Qty: ${item.quantity}  |  Buy: ${item.buyPrice}  |  Sell: ${item.sellPrice}`);
            log(`      Created: ${item.created_at || '(unknown)'}`);
            log(`      Updated: ${item.updated_at || '(unknown)'}`);
            log('');
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// 2. Find "Tomato" specifically
// ─────────────────────────────────────────────────────────────────
log('───────────────────────────────────────────────────────────────');
log('  2. TOMATO — SPECIFIC INVESTIGATION');
log('───────────────────────────────────────────────────────────────');

const tomatoProducts = products.filter(p =>
    (p.name || '').toLowerCase().includes('tomato')
);
log(`  Found ${tomatoProducts.length} product(s) matching "tomato":\n`);
for (const t of tomatoProducts) {
    log(`  ▸ "${t.name}" (ID: ${t.id})`);
    log(`      Barcode: ${t.barcode || '(none)'}`);
    log(`      Category: ${t.category || '(none)'}`);
    log(`      Dept: ${t.department || '(none)'}`);
    log(`      Qty: ${t.quantity}  |  Buy: ₦${t.buyPrice}  |  Sell: ₦${t.sellPrice}`);
    log(`      Created: ${t.created_at}`);
    log(`      Updated: ${t.updated_at}`);
    log('');
}

// Check if tomato appears in any historical sales under a different product ID
const tomatoSales = [];
for (const sale of sales) {
    if (!sale.items) continue;
    for (const item of sale.items) {
        if ((item.productName || '').toLowerCase().includes('tomato')) {
            tomatoSales.push({ saleId: sale.id, date: sale.date, item });
        }
    }
}
log(`  Sales referencing "tomato": ${tomatoSales.length}`);
if (tomatoSales.length > 0) {
    // Check which product IDs were used in tomato sales
    const tomatoSaleProductIds = new Set(tomatoSales.map(s => s.item.productId));
    const currentTomatoIds = new Set(tomatoProducts.map(p => p.id));
    const orphanedIds = [...tomatoSaleProductIds].filter(id => !currentTomatoIds.has(id));
    
    log(`  Product IDs used in tomato sales: ${[...tomatoSaleProductIds].join(', ')}`);
    log(`  Current tomato product IDs:       ${[...currentTomatoIds].join(', ')}`);
    if (orphanedIds.length > 0) {
        log(`  ⚠️  ORPHANED IDs (sold but product no longer exists): ${orphanedIds.join(', ')}`);
    }
    log('');
    log('  Recent tomato sales (last 10):');
    const sorted = tomatoSales.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const s of sorted.slice(0, 10)) {
        log(`    ${s.date}  |  Qty: ${s.item.quantity}  |  ₦${s.item.price}  |  ProductID: ${s.item.productId}`);
    }
}
log('');

// ─────────────────────────────────────────────────────────────────
// 3. Sales referencing non-existent products (orphan check)
// ─────────────────────────────────────────────────────────────────
log('───────────────────────────────────────────────────────────────');
log('  3. ORPHANED SALES — referencing products that no longer exist');
log('───────────────────────────────────────────────────────────────');

const productIdSet = new Set(products.map(p => p.id));
const orphanedSales = new Map(); // productId -> { productName, count, lastSaleDate }

for (const sale of sales) {
    if (!sale.items) continue;
    for (const item of sale.items) {
        const pid = item.productId;
        if (pid && !productIdSet.has(pid) && !pid.startsWith('historical-')) {
            if (!orphanedSales.has(pid)) {
                orphanedSales.set(pid, {
                    productName: item.productName || '(unknown)',
                    count: 0,
                    firstSaleDate: sale.date,
                    lastSaleDate: sale.date,
                    totalRevenue: 0,
                });
            }
            const entry = orphanedSales.get(pid);
            entry.count++;
            entry.totalRevenue += (item.total || item.price * item.quantity || 0);
            if (sale.date && sale.date > entry.lastSaleDate) entry.lastSaleDate = sale.date;
            if (sale.date && sale.date < entry.firstSaleDate) entry.firstSaleDate = sale.date;
        }
    }
}

if (orphanedSales.size === 0) {
    log('  ✅ All sale line items reference existing products.\n');
} else {
    log(`  ⚠️  Found ${orphanedSales.size} product IDs referenced in sales but MISSING from products:\n`);
    const sorted = [...orphanedSales.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [pid, info] of sorted) {
        log(`  ▸ "${info.productName}"`);
        log(`      Missing ID: ${pid}`);
        log(`      Sale occurrences: ${info.count}`);
        log(`      Revenue lost from tracking: ₦${info.totalRevenue.toLocaleString()}`);
        log(`      First sale: ${info.firstSaleDate}`);
        log(`      Last sale:  ${info.lastSaleDate}`);
        log('');
    }
}

// ─────────────────────────────────────────────────────────────────
// 4. Products with quantity = 0 or negative (potential stock issues)
// ─────────────────────────────────────────────────────────────────
log('───────────────────────────────────────────────────────────────');
log('  4. STOCK ANOMALIES — zero or negative quantities');
log('───────────────────────────────────────────────────────────────');

const zeroStock = products.filter(p => p.quantity === 0);
const negativeStock = products.filter(p => p.quantity < 0);

log(`  Products with zero stock:     ${zeroStock.length}`);
log(`  Products with negative stock: ${negativeStock.length}`);

if (negativeStock.length > 0) {
    log('\n  ⚠️  Products with NEGATIVE stock:');
    for (const p of negativeStock) {
        log(`    ▸ "${p.name}" — Qty: ${p.quantity} (ID: ${p.id})`);
    }
}
log('');

// ─────────────────────────────────────────────────────────────────
// 5. Products with missing/empty barcodes
// ─────────────────────────────────────────────────────────────────
log('───────────────────────────────────────────────────────────────');
log('  5. PRODUCTS WITH NO BARCODE');
log('───────────────────────────────────────────────────────────────');

const noBarcodeProducts = products.filter(p => !p.barcode || p.barcode.trim() === '');
log(`  ${noBarcodeProducts.length} of ${products.length} products have no barcode.`);
if (noBarcodeProducts.length > 0 && noBarcodeProducts.length <= 30) {
    for (const p of noBarcodeProducts) {
        log(`    ▸ "${p.name}" (ID: ${p.id})`);
    }
}
log('');

// ─────────────────────────────────────────────────────────────────
// 6. Duplicate barcodes (different products, same barcode)
// ─────────────────────────────────────────────────────────────────
log('───────────────────────────────────────────────────────────────');
log('  6. DUPLICATE BARCODES');
log('───────────────────────────────────────────────────────────────');

const barcodeMap = new Map();
for (const p of products) {
    if (!p.barcode || p.barcode.trim() === '') continue;
    const bc = p.barcode.trim();
    if (!barcodeMap.has(bc)) barcodeMap.set(bc, []);
    barcodeMap.get(bc).push(p);
}

const dupBarcodes = [...barcodeMap.entries()].filter(([, items]) => items.length > 1);
if (dupBarcodes.length === 0) {
    log('  ✅ No duplicate barcodes.\n');
} else {
    log(`  ⚠️  ${dupBarcodes.length} barcodes shared by multiple products:\n`);
    for (const [bc, items] of dupBarcodes) {
        log(`  Barcode: ${bc}`);
        for (const item of items) {
            log(`    ▸ "${item.name}" — Qty: ${item.quantity} — ID: ${item.id}`);
        }
        log('');
    }
}

// ─────────────────────────────────────────────────────────────────
// 7. Timeline analysis — recently created products (re-added?)
// ─────────────────────────────────────────────────────────────────
log('───────────────────────────────────────────────────────────────');
log('  7. RECENTLY CREATED PRODUCTS (possible re-additions)');
log('───────────────────────────────────────────────────────────────');

const withDates = products.filter(p => p.created_at);
const sorted = withDates.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

log('  Last 20 products created:\n');
for (const p of sorted.slice(0, 20)) {
    log(`  ${p.created_at}  |  "${p.name}"  |  Qty: ${p.quantity}  |  ID: ${p.id}`);
}
log('');

// ─────────────────────────────────────────────────────────────────
// 8. Check sync / Dexie related patterns
// ─────────────────────────────────────────────────────────────────
log('───────────────────────────────────────────────────────────────');
log('  8. SYNC / DATA INTEGRITY PATTERNS');
log('───────────────────────────────────────────────────────────────');

// Check for products with created_at != updated_at that have very recent updated_at
// but old created_at — could indicate they were modified after re-appearing
const resynced = products.filter(p => {
    if (!p.created_at || !p.updated_at) return false;
    return p.created_at !== p.updated_at;
});
log(`  Products modified after creation: ${resynced.length} / ${products.length}`);

// Check for UUID vs non-UUID product IDs (imported vs app-created)
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidProducts = products.filter(p => uuidPattern.test(p.id));
const nonUuidProducts = products.filter(p => !uuidPattern.test(p.id));
log(`  Products with UUID IDs (migrated): ${uuidProducts.length}`);
log(`  Products with Firestore auto-IDs (app-created): ${nonUuidProducts.length}`);
log('');

// ─────────────────────────────────────────────────────────────────
// Save full report
// ─────────────────────────────────────────────────────────────────
const reportPath = path.join(exportDir, 'inventory_analysis_report.txt');
fs.writeFileSync(reportPath, report.join('\n'), 'utf-8');
console.log(`\n📄 Full report saved to: ${reportPath}`);
