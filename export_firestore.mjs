/**
 * Ganewa Firestore REST Exporter
 * ──────────────────────────────
 * Uses Firestore REST API (HTTPS) with OAuth2 user credentials.
 * No gRPC, no service-account key needed.
 *
 * Run:  node export_firestore.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';

const PROJECT_ID  = 'ganewa-provision-pos';
const DATABASE    = '(default)';
const OUTPUT_DIR  = './firestore_export';
const BASE_URL    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;
const TOKEN_URL   = 'https://oauth2.googleapis.com/token';

// All top-level collections (from firestore.rules)
const COLLECTIONS = [
  'products',
  'users',
  'customers',
  'sales',
  'expenses',
  'purchases',
  'suppliers',
  'returns',
  'returnedItems',
  'departments',
  'cashBook',
  'supplierPayments',
  'auditLogs',
  'stockWriteOffs',
  'settings',
  'bankAccounts',
  'dailyStats',
  'stockAlerts',
  'debtDiscrepancies',
  'customerPayments',
  'shopUsers',
  'orders',
];

// ── Load credentials ──────────────────────────────────────────────────────────
const credPath = path.join(
  os.homedir(),
  'AppData', 'Roaming', 'firebase',
  'abdulhakimaminu_gmail_com_application_default_credentials.json'
);
const creds = JSON.parse(readFileSync(credPath, 'utf8'));

// ── Get access token via refresh token ────────────────────────────────────────
async function getAccessToken() {
  const body = new URLSearchParams({
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type:    'refresh_token',
  });

  const res  = await fetch(TOKEN_URL, { method: 'POST', body });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`);
  return json.access_token;
}

// ── Convert Firestore value objects → plain JS ────────────────────────────────
function convertValue(val) {
  if (val === undefined || val === null) return null;
  if ('nullValue'      in val) return null;
  if ('booleanValue'   in val) return val.booleanValue;
  if ('integerValue'   in val) return Number(val.integerValue);
  if ('doubleValue'    in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;           // ISO string
  if ('stringValue'    in val) return val.stringValue;
  if ('bytesValue'     in val) return `<bytes:${val.bytesValue}>`;
  if ('referenceValue' in val) return `<ref:${val.referenceValue}>`;
  if ('geoPointValue'  in val) return { lat: val.geoPointValue.latitude, lng: val.geoPointValue.longitude };
  if ('arrayValue'     in val) return (val.arrayValue.values ?? []).map(convertValue);
  if ('mapValue'       in val) return convertFields(val.mapValue.fields ?? {});
  return val;
}

function convertFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, convertValue(v)]));
}

// ── Fetch one page of a collection ───────────────────────────────────────────
async function fetchPage(collection, pageToken, token) {
  const url = new URL(`${BASE_URL}/${collection}`);
  url.searchParams.set('pageSize', '300');
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

// ── Fetch all docs in a collection (paginated) ────────────────────────────────
async function fetchCollection(name, token) {
  process.stdout.write(`  Fetching /${name} ... `);
  const records = [];
  let pageToken = null;

  while (true) {
    const data = await fetchPage(name, pageToken, token);

    for (const doc of data.documents ?? []) {
      // doc.name = "projects/.../databases/.../documents/collection/docId"
      const docId = doc.name.split('/').pop();
      records.push({ _id: docId, ...convertFields(doc.fields ?? {}) });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  console.log(`${records.length} docs`);
  return records;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔥 Ganewa Firestore REST Exporter');
  console.log(`   Project     : ${PROJECT_ID}`);
  console.log(`   Output dir  : ${OUTPUT_DIR}`);
  console.log(`   Collections : ${COLLECTIONS.length}\n`);

  console.log('  🔑 Refreshing access token...');
  const token = await getAccessToken();
  console.log('  ✅ Token obtained\n');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const summary = {};

  for (const col of COLLECTIONS) {
    try {
      const docs    = await fetchCollection(col, token);
      const outPath = join(OUTPUT_DIR, `${col}.json`);
      writeFileSync(outPath, JSON.stringify(docs, null, 2), 'utf8');
      summary[col] = docs.length;
    } catch (err) {
      console.error(`  ❌ ${col}: FAILED — ${err.message}`);
      summary[col] = `ERROR: ${err.message}`;
    }
  }

  // Manifest
  const manifestPath = join(OUTPUT_DIR, '_manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({ exportedAt: new Date().toISOString(), project: PROJECT_ID, collections: summary }, null, 2),
    'utf8'
  );

  console.log('\n─────────────────────────────────────────────');
  console.log('SUMMARY');
  for (const [col, count] of Object.entries(summary)) {
    const icon = typeof count === 'number' ? '✅' : '❌';
    console.log(`  ${icon}  ${col.padEnd(24)} ${count}`);
  }
  const total = Object.values(summary).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
  console.log(`\n  Total documents exported : ${total}`);
  console.log(`  Manifest                 : ${manifestPath}`);
  console.log('\n✅ Export complete!\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
