import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
const dataDir = path.join(__dirname, '../migration-data');

async function main() {
    const filePath = path.join(dataDir, 'purchases.json');
    if (!fs.existsSync(filePath)) return;

    console.log('📦 Importing purchases...');
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const batch = writeBatch(db);

    for (const p of records) {
        const id = uuidv4();
        const transformed = {
            id,
            invoiceNo: p.invno || '',
            supplierName: p.supplier || '',
            date: new Date(p.sdate || Date.now()).toISOString(),
            totalAmount: parseFloat((p.total || '0').replace(/,/g, '')) || 0,
            paidAmount: parseFloat((p.paid || '0').replace(/,/g, '')) || 0,
            balance: parseFloat((p.balance || '0').replace(/,/g, '')) || 0,
            status: (p.status || 'PENDING').toUpperCase(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        batch.set(doc(db, 'purchases', id), transformed);
    }

    await batch.commit();
    console.log(`✅ Completed purchases: ${records.length} records`);
}

main().catch(console.error);
