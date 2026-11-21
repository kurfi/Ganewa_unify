import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const envPath = path.join(__dirname, '../.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const firebaseConfig = {
    apiKey: envConfig.VITE_FIREBASE_API_KEY,
    authDomain: envConfig.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: envConfig.VITE_FIREBASE_PROJECT_ID,
    storageBucket: envConfig.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: envConfig.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const STORE_EMAIL = 'ganewashoppingmallkurfi@gmail.com';
const STORE_PASSWORD = envConfig.VITE_FIREBASE_STORE_PASSWORD || 'GanewaStore123!';

const productsPath = path.join(__dirname, '../firebase-export/products.json');
const salesPath = path.join(__dirname, '../firebase-export/sales.json');
const purchasesPath = path.join(__dirname, '../firebase-export/purchases.json');

async function main() {
    if (!fs.existsSync(productsPath)) {
        console.error('❌ products.json export not found. Please run export first.');
        process.exit(1);
    }

    const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
    const sales = fs.existsSync(salesPath) ? JSON.parse(fs.readFileSync(salesPath, 'utf8')) : [];
    const purchases = fs.existsSync(purchasesPath) ? JSON.parse(fs.readFileSync(purchasesPath, 'utf8')) : [];

    // Find corrupted products
    const corrupted = products.filter(p => !p.name || p.name === 'undefined' || p.name.trim() === '');
    if (corrupted.length === 0) {
        console.log('✅ No corrupted products (with missing/undefined names) found in products.json.');
        return;
    }

    console.log(`🔍 Found ${corrupted.length} corrupted products. Resolving details...`);

    const repairs = [];

    for (const p of corrupted) {
        let name = null;
        let sellPrice = p.sellPrice || 0;
        let buyPrice = p.buyPrice || 0;
        let category = p.category || 'General';

        // 1. Search in sales
        for (const sale of sales) {
            if (!sale.items) continue;
            const match = sale.items.find(item => item.productId === p.id);
            if (match) {
                name = match.productName;
                if (!sellPrice && match.price) sellPrice = match.price;
                break;
            }
        }

        // 2. Search in purchases if not found in sales
        if (!name) {
            for (const purchase of purchases) {
                if (!purchase.items) continue;
                const match = purchase.items.find(item => item.productId === p.id);
                if (match) {
                    name = match.productName;
                    if (!buyPrice && match.price) buyPrice = match.price;
                    break;
                }
            }
        }

        // If name still not resolved, use a descriptive placeholder
        if (!name) {
            name = `RECOVERED PRODUCT ${p.id.substring(0, 4).toUpperCase()}`;
        }

        // Fallbacks for prices
        if (!sellPrice && buyPrice) sellPrice = buyPrice * 1.2;
        if (!buyPrice && sellPrice) buyPrice = sellPrice * 0.8;

        repairs.push({
            id: p.id,
            original: p,
            repaired: {
                name,
                sellPrice,
                buyPrice,
                wholesalePrice: sellPrice * 0.9,
                category,
                minStockLevel: p.minStockLevel || 10,
                updated_at: new Date().toISOString()
            }
        });
    }

    console.log('\nProposed repairs:');
    repairs.forEach(r => {
        console.log(`- ID: ${r.id}`);
        console.log(`  Original Name: ${r.original.name}`);
        console.log(`  Repaired Name: ${r.repaired.name}`);
        console.log(`  Prices: Buy: ${r.repaired.buyPrice} | Sell: ${r.repaired.sellPrice}`);
    });

    console.log(`\n🔑 Authenticating as ${STORE_EMAIL}...`);
    await signInWithEmailAndPassword(auth, STORE_EMAIL, STORE_PASSWORD);
    console.log('✅ Authentication successful!');

    console.log('\nPushing updates to Firestore...');
    for (const r of repairs) {
        try {
            const docRef = doc(db, 'products', r.id);
            await updateDoc(docRef, r.repaired);
            console.log(`  ✓ Updated product ${r.id} -> "${r.repaired.name}"`);
        } catch (err) {
            console.error(`  ✗ Failed to update product ${r.id}:`, err.message);
        }
    }

    console.log('\n🎉 Repair process completed! Run export-from-firebase and analyze-inventory to verify.');
}

main().catch(console.error);
