import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_COLLECTIONS = ['products', 'orders', 'customerPayments', 'shopUsers'];

function loadServiceAccountKey(envVar, defaultPath) {
  const keyPath = process.env[envVar] || defaultPath;
  if (process.env[`${envVar}_CONTENT`]) {
    try {
      return JSON.parse(process.env[`${envVar}_CONTENT`]);
    } catch (e) {
      console.error(`Failed to parse JSON from env var ${envVar}_CONTENT:`, e.message);
    }
  }
  
  if (fs.existsSync(keyPath)) {
    try {
      return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    } catch (e) {
      console.error(`Failed to read key file at ${keyPath}:`, e.message);
    }
  }

  return null;
}

async function migrate() {
  console.log('--- Ganewa Shared Collections Migration Script ---');

  const posKey = loadServiceAccountKey(
    'POS_SERVICE_ACCOUNT_KEY',
    path.join(__dirname, '../credentials/pos-service-account.json')
  );
  const ecoKey = loadServiceAccountKey(
    'ECOMMERCE_SERVICE_ACCOUNT_KEY',
    path.join(__dirname, '../credentials/ecommerce-service-account.json')
  );

  if (!posKey || !ecoKey) {
    console.error('\nERROR: Missing service account credentials!');
    console.error('Please provide service account JSON key files or env vars:');
    console.error('  1. POS credentials: credentials/pos-service-account.json OR POS_SERVICE_ACCOUNT_KEY / POS_SERVICE_ACCOUNT_KEY_CONTENT');
    console.error('  2. Ecommerce credentials: credentials/ecommerce-service-account.json OR ECOMMERCE_SERVICE_ACCOUNT_KEY / ECOMMERCE_SERVICE_ACCOUNT_KEY_CONTENT\n');
    process.exit(1);
  }

  const posApp = admin.initializeApp(
    { credential: admin.credential.cert(posKey) },
    'posSourceApp'
  );
  const ecoApp = admin.initializeApp(
    { credential: admin.credential.cert(ecoKey) },
    'ecommerceDestApp'
  );

  const posDb = posApp.firestore();
  const ecoDb = ecoApp.firestore();

  const totalSummary = {};

  for (const collectionName of SHARED_COLLECTIONS) {
    console.log(`\nMigrating collection: "${collectionName}"...`);
    
    try {
      const snapshot = await posDb.collection(collectionName).get();
      console.log(`  Found ${snapshot.size} documents in source collection "${collectionName}".`);

      if (snapshot.empty) {
        totalSummary[collectionName] = { copied: 0, failed: 0 };
        continue;
      }

      let copiedCount = 0;
      let failedCount = 0;

      // Use Firestore Batches (max 500 ops per batch)
      const docs = snapshot.docs;
      const batchSize = 450;

      for (let i = 0; i < docs.length; i += batchSize) {
        const chunk = docs.slice(i, i + batchSize);
        const batch = ecoDb.batch();

        for (const doc of chunk) {
          const docRef = ecoDb.collection(collectionName).doc(doc.id);
          const data = doc.data();

          // Mark migration source timestamp
          data._syncedFrom = 'migration';
          data._syncedAt = admin.firestore.FieldValue.serverTimestamp();

          batch.set(docRef, data, { merge: true });
        }

        try {
          await batch.commit();
          copiedCount += chunk.length;
          console.log(`  [${collectionName}] Batch ${Math.floor(i / batchSize) + 1} committed (${copiedCount}/${docs.length} docs).`);
        } catch (batchErr) {
          console.error(`  [${collectionName}] Batch commit failed for docs ${i}..${i + chunk.length}:`, batchErr.message);
          
          // Fallback to individual set to pinpoint failed document(s)
          for (const doc of chunk) {
            try {
              const data = doc.data();
              data._syncedFrom = 'migration';
              data._syncedAt = admin.firestore.FieldValue.serverTimestamp();
              await ecoDb.collection(collectionName).doc(doc.id).set(data, { merge: true });
              copiedCount++;
            } catch (singleErr) {
              failedCount++;
              console.error(`    FAILED to write doc ID ${doc.id} in collection ${collectionName}:`, singleErr.message);
            }
          }
        }
      }

      totalSummary[collectionName] = { copied: copiedCount, failed: failedCount };
    } catch (colErr) {
      console.error(`Error querying source collection "${collectionName}":`, colErr.message);
      totalSummary[collectionName] = { copied: 0, failed: -1, error: colErr.message };
    }
  }

  console.log('\n========================================');
  console.log('MIGRATION SUMMARY REPORT');
  console.log('========================================');
  console.table(totalSummary);
  console.log('========================================\n');
}

migrate().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
