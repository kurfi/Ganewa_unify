/**
 * audit-quantity.mjs
 *
 * READ-ONLY audit: scans the `products` collection and reports every document
 * where `quantity` is undefined, null, not of type number, NaN, or Infinity.
 *
 * No writes are made to Firestore. Run this first and review the output
 * before running migrate-quantity.mjs.
 *
 * Usage:
 *   node scripts/audit-quantity.mjs
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

// --------------- Config ---------------
const API_KEY      = process.env.VITE_FIREBASE_API_KEY;
const PROJECT_ID   = process.env.VITE_FIREBASE_PROJECT_ID;
const STORE_EMAIL  = 'ganewashoppingmallkurfi@gmail.com';
const STORE_PASSWORD = process.env.VITE_FIREBASE_STORE_PASSWORD;
if (!STORE_PASSWORD) {
    throw new Error('VITE_FIREBASE_STORE_PASSWORD is required in environment variables');
}

if (!API_KEY || !PROJECT_ID) {
    console.error('❌ Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID in .env.local');
    process.exit(1);
}

// --------------- Auth ---------------
async function signIn() {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: STORE_EMAIL, password: STORE_PASSWORD, returnSecureToken: true }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Auth failed: ${err.error?.message || res.statusText}`);
    }
    return (await res.json()).idToken;
}

// --------------- Firestore REST helpers (same as export-from-firebase.mjs) ---------------
function convertValue(val) {
    if (val === undefined || val === null) return null;
    if ('stringValue'    in val) return val.stringValue;
    if ('integerValue'   in val) return Number(val.integerValue);
    if ('doubleValue'    in val) return val.doubleValue;
    if ('booleanValue'   in val) return val.booleanValue;
    if ('nullValue'      in val) return null;
    if ('timestampValue' in val) return val.timestampValue;
    if ('geoPointValue'  in val) return val.geoPointValue;
    if ('referenceValue' in val) return val.referenceValue;
    if ('arrayValue'     in val) return (val.arrayValue.values || []).map(convertValue);
    if ('mapValue'       in val) return convertFields(val.mapValue.fields || {});
    return val;
}

function convertFields(fields) {
    const obj = {};
    for (const [key, val] of Object.entries(fields)) obj[key] = convertValue(val);
    return obj;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Fetch with exponential-backoff retry on 429 / 500 / 503.
 * MAX_RETRIES=6 → max wait before giving up ≈ 2+4+8+16+32+64 = 126 s.
 */
async function fetchWithRetry(url, options = {}, maxRetries = 6) {
    let delay = 2000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, options);
        if (res.ok) return res;

        const retryable = res.status === 429 || res.status === 500 || res.status === 503;
        if (!retryable || attempt === maxRetries) {
            const body = await res.json().catch(() => ({}));
            throw new Error(`HTTP ${res.status}: ${body.error?.message || res.statusText}`);
        }

        const jitter = Math.floor(Math.random() * 1000);
        const wait = delay + jitter;
        console.log(`   ⏳ Rate-limited (${res.status}). Retrying in ${(wait / 1000).toFixed(1)}s… (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(wait);
        delay = Math.min(delay * 2, 64_000);
    }
}

/**
 * Use the Firestore runQuery (structured query) endpoint to fetch all products.
 * runQuery paginates via `offset` and has a separate quota from the list-documents API.
 */
async function fetchAllProducts(idToken) {
    const runQueryUrl =
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

    const all = [];
    const PAGE = 200; // docs per batch
    let offset = 0;

    while (true) {
        if (offset > 0) await sleep(400); // brief pause between pages

        const body = {
            structuredQuery: {
                from: [{ collectionId: 'products' }],
                limit: PAGE,
                offset,
            },
        };

        const res = await fetchWithRetry(runQueryUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${idToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const rows = await res.json(); // array of { document?, readTime, skippedResults? }
        const docs = rows.filter(r => r.document);

        for (const { document: doc } of docs) {
            const parts = doc.name.split('/');
            const id = parts[parts.length - 1];
            all.push({ id, ...convertFields(doc.fields || {}) });
        }

        process.stdout.write(`\r   Fetched ${all.length} documents…`);

        if (docs.length < PAGE) break; // last page
        offset += docs.length;
    }
    console.log(''); // newline after progress indicator
    return all;
}

// --------------- Quantity validation ---------------
/**
 * Returns a human-readable reason if quantity is bad, otherwise null.
 */
function quantityProblem(q) {
    if (q === undefined || q === null)          return 'missing / null';
    if (typeof q === 'string')                  return `string ("${q}")`;
    if (typeof q === 'boolean')                 return `boolean (${q})`;
    if (typeof q !== 'number')                  return `unexpected type (${typeof q})`;
    if (!isFinite(q) || isNaN(q))              return `non-finite number (${q})`;
    return null; // OK
}

// --------------- Main ---------------
async function main() {
    console.log('🔍 Quantity Audit — products collection');
    console.log(`📍 Project: ${PROJECT_ID}\n`);

    console.log('🔑 Signing in...');
    const idToken = await signIn();
    console.log('✅ Authenticated\n');

    console.log('📦 Fetching all products...');
    const products = await fetchAllProducts(idToken);
    console.log(`   Total documents: ${products.length}\n`);

    // Separate into bad / suspect / ok
    const bad = [];
    const softDeleted = [];

    for (const p of products) {
        const problem = quantityProblem(p.quantity);
        if (problem) {
            if (p.deleted === true) {
                softDeleted.push({ id: p.id, name: p.name, quantity: p.quantity, problem, deleted: true });
            } else {
                bad.push({ id: p.id, name: p.name, quantity: p.quantity, problem, deleted: p.deleted });
            }
        }
    }

    const okCount = products.length - bad.length - softDeleted.length;

    // ── Report ──────────────────────────────────────────────────────────────────
    console.log('═'.repeat(70));
    console.log('📊  AUDIT RESULTS');
    console.log('═'.repeat(70));
    console.log(`  Total products scanned : ${products.length}`);
    console.log(`  ✅ Valid quantity        : ${okCount}`);
    console.log(`  🗑️  Soft-deleted (bad qty): ${softDeleted.length}  (won't appear on storefront anyway)`);
    console.log(`  ❌ Live docs — bad qty  : ${bad.length}`);
    console.log('');

    if (bad.length === 0) {
        console.log('🎉 No issues found in live (non-deleted) products!');
    } else {
        console.log('❌ LIVE PRODUCTS WITH BAD quantity:');
        console.log('─'.repeat(70));
        const COL = { id: 24, name: 28, qty: 12, problem: 28 };
        const header =
            'DOC ID'.padEnd(COL.id) +
            'NAME'.padEnd(COL.name) +
            'quantity'.padEnd(COL.qty) +
            'PROBLEM';
        console.log(header);
        console.log('─'.repeat(70));

        for (const p of bad) {
            const idCol     = String(p.id   || '').slice(0, COL.id - 1).padEnd(COL.id);
            const nameCol   = String(p.name || '(no name)').slice(0, COL.name - 1).padEnd(COL.name);
            const qtyCol    = String(p.quantity === undefined ? 'undefined' : p.quantity).slice(0, COL.qty - 1).padEnd(COL.qty);
            const probCol   = p.problem;
            console.log(`${idCol}${nameCol}${qtyCol}${probCol}`);
        }
        console.log('─'.repeat(70));
        console.log('');

        // Breakdown by problem type
        const byType = {};
        for (const p of bad) {
            const key = p.problem.split(' ')[0];
            byType[key] = (byType[key] || 0) + 1;
        }
        console.log('  Problem breakdown:');
        for (const [k, v] of Object.entries(byType)) {
            console.log(`    ${k.padEnd(20)} ${v}`);
        }
        console.log('');
        console.log('⚠️  These documents are silently excluded by the Firestore');
        console.log('   `where("quantity", ">", 0)` filter and will NOT appear');
        console.log('   on the ecommerce storefront until quantity is coerced to a number.');
        console.log('');
        console.log('👉 Run `node scripts/migrate-quantity.mjs` to fix them (after review).');
    }

    if (softDeleted.length > 0) {
        console.log(`\nℹ️  ${softDeleted.length} soft-deleted product(s) also have bad quantity`);
        console.log('   (deleted=true — they are excluded from all queries so no action required).');
    }

    console.log('\n🏁 Audit complete. No data was written.');
}

main().catch((err) => {
    console.error('\n❌ Audit failed:', err.message || err);
    process.exit(1);
});
