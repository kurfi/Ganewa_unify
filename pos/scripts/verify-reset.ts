import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

async function verifyReset() {
    console.log('🔍 Verifying stock reset...');
    
    const productsRef = collection(db, 'products');
    const snapshot = await getDocs(productsRef);
    
    if (snapshot.empty) {
        console.log('⚠️ No products found to verify.');
        return;
    }

    let failedCount = 0;
    const failedProducts: string[] = [];

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.quantity !== 0) {
            failedCount++;
            failedProducts.push(`${data.name} (ID: ${doc.id}, Quantity: ${data.quantity})`);
        }
    });

    if (failedCount === 0) {
        console.log(`✅ Success! All ${snapshot.size} products have 0 quantity.`);
    } else {
        console.error(`❌ Verification failed: ${failedCount} products still have non-zero quantity.`);
        console.log('Failing products:');
        failedProducts.forEach(p => console.log(`  - ${p}`));
        process.exit(1);
    }
}

verifyReset().catch(err => {
    console.error('\n❌ Verification script failed:', err);
    process.exit(1);
});
