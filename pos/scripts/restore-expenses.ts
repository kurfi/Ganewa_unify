import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BATCH_SIZE = 500;
const filePath = path.join(__dirname, '../migration-data/expenses.json');

async function restoreExpenses() {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: Backup file not found at ${filePath}`);
        process.exit(1);
    }

    console.log('🚀 Restoring Expenses collection...');
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`📋 Found ${records.length} records in backup.`);

    let batch = writeBatch(db);
    let count = 0;
    let total = 0;

    for (const exp of records) {
        const id = uuidv4();
        const transformed = {
            id,
            date: new Date(exp.dates || Date.now()).toISOString(),
            category: exp.details || 'General', // Using details as category based on migration script pattern
            amount: parseFloat(exp.amount) || 0,
            note: exp.filename || exp.note || '', // Using filename as note based on JSON structure
            status: 'PAID',
            department: exp.dept || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const docRef = doc(db, 'expenses', transformed.id);
        batch.set(docRef, transformed);

        count++;
        total++;

        if (count >= BATCH_SIZE) {
            await batch.commit();
            console.log(`  ✓ Uploaded ${total} records...`);
            batch = writeBatch(db);
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
    }
    console.log(`✅ Successfully restored expenses: ${total} records`);
}

restoreExpenses().catch(err => {
    console.error('\n❌ Restoration failed:', err);
    process.exit(1);
});
