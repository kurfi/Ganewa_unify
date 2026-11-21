/**
 * migrate-quantity.mjs
 *
 * MIGRATION: coerces every live (non-deleted) product document whose `quantity`
 * field is missing, null, or not a finite number to a valid integer.
 *
 * Coercion rules (in order):
 *   1. If `quantity` is a string that parses to a finite number  → use that integer.
 *   2. Otherwise                                                  → default to 0.
 *
 * ⚠️  DRY-RUN mode is ON by default.
 *     Set DRY_RUN=false in the environment to write to Firestore:
 *       DRY_RUN=false node scripts/migrate-quantity.mjs
 *
 * Usage (review first):
 *   node scripts/migrate-quantity.mjs            # dry-run, prints what would change
 *   DRY_RUN=false node scripts/migrate-quantity.mjs   # actually writes
 *
 * On Windows PowerShell:
 *   $env:DRY_RUN="false"; node scripts/migrate-quantity.mjs
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

// --------------- Config ---------------
const API_KEY       = process.env.VITE_FIREBASE_API_KEY;
const PROJECT_ID    = process.env.VITE_FIREBASE_PROJECT_ID;
const STORE_EMAIL   = 'ganewashoppingmallkurfi@gmail.com';
const STORE_PASSWORD = process.env.VITE_FIREBASE_STORE_PASSWORD || 'GanewaStore123!';
const DRY_RUN       = process.env.DRY_RUN !== 'false'; // default: true

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

// --------------- Firestore REST helpers ---------------
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

async function fetchAllProducts(idToken) {
    const runQueryUrl =
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

    const all = [];
    const PAGE = 200;
    let offset = 0;

    while (true) {
        if (offset > 0) await sleep(400);

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

        const rows = await res.json();
        const docs = rows.filter(r => r.document);

        for (const { document: doc } of docs) {
            const parts = doc.name.split('/');
            const id = parts[parts.length - 1];
            // Preserve raw fields for the PATCH — we only need converted fields for analysis
            all.push({ id, ...convertFields(doc.fields || {}) });
        }

        process.stdout.write(`\r   Fetched ${all.length} documents…`);

        if (docs.length < PAGE) break;
        offset += docs.length;
    }
    console.log('');
    return all;
}

/**
 * PATCH only the `quantity` field of a single Firestore document using
 * the REST updateMask parameter (field mask patch — no other fields touched).
 */
async function patchQuantity(docId, newQuantity, idToken) {
    const url =
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/products/${docId}` +
        `?updateMask.fieldPaths=quantity`;

    const body = {
        fields: {
            quantity: { integerValue: String(newQuantity) }
        }
    };

    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`PATCH ${docId} failed (${res.status}): ${err.error?.message || res.statusText}`);
    }
}

// --------------- Coercion logic ---------------
function isValidQuantity(q) {
    return typeof q === 'number' && isFinite(q) && !isNaN(q);
}

function coerce(q) {
    if (isValidQuantity(q)) return q; // already fine (shouldn't be called)
    if (typeof q === 'string') {
        const parsed = Number(q.trim());
        if (isFinite(parsed) && !isNaN(parsed)) return Math.round(parsed);
    }
    // null, undefined, boolean, or unparseable string → default 0
    return 0;
}

// --------------- Main ---------------
async function main() {
    console.log('');
    console.log('🔧 Quantity Migration — products collection');
    console.log(`📍 Project  : ${PROJECT_ID}`);
    console.log(`🧪 Mode     : ${DRY_RUN ? 'DRY RUN (no writes)' : '⚠️  LIVE — will write to Firestore'}`);
    console.log('');

    if (!DRY_RUN) {
        console.log('⏳ Starting in 3 seconds — press Ctrl+C to cancel...');
        await new Promise(r => setTimeout(r, 3000));
    }

    console.log('🔑 Signing in...');
    const idToken = await signIn();
    console.log('✅ Authenticated\n');

    console.log('📦 Fetching all products...');
    const products = await fetchAllProducts(idToken);
    console.log(`   Total documents: ${products.length}\n`);

    // Find live docs with bad quantity
    const toFix = products.filter(p => p.deleted !== true && !isValidQuantity(p.quantity));

    console.log(`❌ Live products with bad quantity: ${toFix.length}`);

    if (toFix.length === 0) {
        console.log('🎉 Nothing to migrate! All live products already have a valid numeric quantity.');
        return;
    }

    console.log('');
    console.log('─'.repeat(72));
    const H = { id: 24, name: 28, old: 14, new: 8 };
    console.log('DOC ID'.padEnd(H.id) + 'NAME'.padEnd(H.name) + 'old qty'.padEnd(H.old) + '→ new qty');
    console.log('─'.repeat(72));

    let fixedCount = 0;
    let errorCount = 0;

    for (const p of toFix) {
        const newQty = coerce(p.quantity);
        const idCol  = String(p.id   || '').slice(0, H.id - 1).padEnd(H.id);
        const nmCol  = String(p.name || '(no name)').slice(0, H.name - 1).padEnd(H.name);
        const oldCol = String(p.quantity === undefined ? 'undefined' : p.quantity).slice(0, H.old - 1).padEnd(H.old);

        if (DRY_RUN) {
            console.log(`${idCol}${nmCol}${oldCol}→ ${newQty}`);
            fixedCount++;
        } else {
            try {
                await patchQuantity(p.id, newQty, idToken);
                console.log(`${idCol}${nmCol}${oldCol}→ ${newQty}  ✅`);
                fixedCount++;
            } catch (err) {
                console.log(`${idCol}${nmCol}${oldCol}→ ${newQty}  ❌ ${err.message}`);
                errorCount++;
            }
        }
    }

    console.log('─'.repeat(72));
    console.log('');

    if (DRY_RUN) {
        console.log(`🧪 DRY RUN complete.`);
        console.log(`   Would have patched: ${fixedCount} document(s).`);
        console.log('');
        console.log('   To apply, run:');
        console.log('     DRY_RUN=false node scripts/migrate-quantity.mjs');
        console.log('   (PowerShell: $env:DRY_RUN="false"; node scripts/migrate-quantity.mjs)');
    } else {
        console.log(`✅ Migration complete.`);
        console.log(`   Patched : ${fixedCount}`);
        console.log(`   Errors  : ${errorCount}`);
        if (errorCount > 0) {
            console.log('   ⚠️  Some documents failed — re-run the script to retry errors.');
        }
    }
    console.log('');
}

main().catch((err) => {
    console.error('\n❌ Migration failed:', err.message || err);
    process.exit(1);
});
