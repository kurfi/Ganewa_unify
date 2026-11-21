/**
 * Export Firestore collections to local JSON files using the REST API directly.
 * 
 * This approach bypasses the Firebase client SDK entirely,
 * authenticating via the Identity Toolkit REST API and then
 * fetching each collection via the Firestore REST API.
 * 
 * Usage:  node scripts/export-from-firebase.mjs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

// --------------- Config ---------------
const API_KEY = process.env.VITE_FIREBASE_API_KEY;
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const STORE_EMAIL = 'ganewashoppingmallkurfi@gmail.com';
const STORE_PASSWORD = process.env.VITE_FIREBASE_STORE_PASSWORD || 'GanewaStore123!';

const OUTPUT_DIR = path.join(__dirname, '../firebase-export');

const COLLECTIONS = [
    'products',
    'customers',
    'customerPayments',
    'sales',
    'expenses',
    'users',
    'returns',
    'returnedItems',
    'suppliers',
    'purchases',
    'departments',
    'bankAccounts',
    'cashBook',
    'supplierPayments',
    'auditLogs',
    'orders',
    'shopUsers',
];

// --------------- Helpers ---------------

/**
 * Sign in via the Firebase Auth REST API (Identity Toolkit).
 * Returns an ID token for authenticated Firestore requests.
 */
async function signIn() {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: STORE_EMAIL,
            password: STORE_PASSWORD,
            returnSecureToken: true,
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Auth failed: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.idToken;
}

/**
 * Convert a Firestore REST value object to a plain JS value.
 */
function convertValue(val) {
    if (val === undefined || val === null) return null;
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return val.doubleValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('nullValue' in val) return null;
    if ('timestampValue' in val) return val.timestampValue;
    if ('geoPointValue' in val) return val.geoPointValue;
    if ('referenceValue' in val) return val.referenceValue;
    if ('arrayValue' in val) {
        return (val.arrayValue.values || []).map(convertValue);
    }
    if ('mapValue' in val) {
        return convertFields(val.mapValue.fields || {});
    }
    // Fallback – return the raw object
    return val;
}

function convertFields(fields) {
    const obj = {};
    for (const [key, val] of Object.entries(fields)) {
        obj[key] = convertValue(val);
    }
    return obj;
}

/**
 * Fetch ALL documents in a collection, handling Firestore REST pagination.
 */
async function fetchCollection(collectionName, idToken) {
    const baseUrl =
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`;

    const allDocs = [];
    let pageToken = null;

    while (true) {
        let url = `${baseUrl}?pageSize=300`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok) {
            const err = await res.json();
            const msg = err.error?.message || res.statusText;
            // "NOT_FOUND" or "PERMISSION_DENIED" for empty / non-existent collections
            if (res.status === 404 || msg.includes('NOT_FOUND')) {
                return [];
            }
            throw new Error(`Fetch ${collectionName} failed (${res.status}): ${msg}`);
        }

        const data = await res.json();
        const docs = data.documents || [];

        for (const doc of docs) {
            // Extract the document ID from the full resource name
            const nameParts = doc.name.split('/');
            const docId = nameParts[nameParts.length - 1];
            allDocs.push({ id: docId, ...convertFields(doc.fields || {}) });
        }

        if (data.nextPageToken) {
            pageToken = data.nextPageToken;
        } else {
            break;
        }
    }

    return allDocs;
}

// --------------- Main ---------------

async function main() {
    console.log('🚀 Firebase Firestore → Local JSON Export');
    console.log(`📍 Project: ${PROJECT_ID}\n`);

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 1. Authenticate
    console.log(`🔑 Signing in as ${STORE_EMAIL}...`);
    const idToken = await signIn();
    console.log('✅ Authenticated successfully!\n');

    // 2. Export each collection
    const summary = [];

    for (const col of COLLECTIONS) {
        process.stdout.write(`  📦 ${col} ... `);
        try {
            const docs = await fetchCollection(col, idToken);
            const outPath = path.join(OUTPUT_DIR, `${col}.json`);
            fs.writeFileSync(outPath, JSON.stringify(docs, null, 2), 'utf-8');
            console.log(`${docs.length} documents`);
            summary.push({ collection: col, count: docs.length });
        } catch (e) {
            console.log(`FAILED – ${e.message}`);
            summary.push({ collection: col, count: 'ERROR' });
        }
    }

    // 3. Print summary
    console.log('\n' + '─'.repeat(45));
    console.log('📊 Export Summary');
    console.log('─'.repeat(45));
    for (const s of summary) {
        const pad = s.collection.padEnd(22);
        console.log(`  ${pad} ${s.count}`);
    }
    console.log('─'.repeat(45));
    console.log(`\n📁 Files saved to: ${OUTPUT_DIR}`);
    console.log('🎉 Done!');
}

main().catch((err) => {
    console.error('\n❌ Export failed:', err.message || err);
    process.exit(1);
});
