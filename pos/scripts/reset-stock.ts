import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import * as path from 'path';
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

async function resetStock() {
    console.log('🚀 Starting stock reset for all products...');
    
    const productsRef = collection(db, 'products');
    const snapshot = await getDocs(productsRef);
    
    if (snapshot.empty) {
        console.log('⚠️ No products found in the database.');
        return;
    }

    console.log(`📋 Found ${snapshot.size} products. Resetting quantity to 0...`);

    let batch = writeBatch(db);
    let count = 0;
    let total = 0;

    for (const document of snapshot.docs) {
        const docId = document.id;
        const docRef = doc(db, 'products', docId);
        
        batch.update(docRef, { 
            quantity: 0,
            updated_at: new Date().toISOString()
        });

        count++;
        total++;

        if (count >= BATCH_SIZE) {
            await batch.commit();
            console.log(`  ✓ Updated ${total} products...`);
            batch = writeBatch(db);
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
    }
    
    console.log(`✅ Successfully reset stock for ${total} products.`);
}

resetStock().catch(err => {
    console.error('\n❌ Reset failed:', err);
    process.exit(1);
});
