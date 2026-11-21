import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
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

async function backfillSearchFields() {
    console.log('🔑 Authenticating as store account...');
    const auth = getAuth(app);
    const email = 'ganewashoppingmallkurfi@gmail.com';
    const password = process.env.VITE_FIREBASE_STORE_PASSWORD || 'GanewaStore123!';
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        console.log('✅ Authentication successful.');
    } catch (authErr: any) {
        console.error('❌ Authentication failed:', authErr.message);
        process.exit(1);
    }

    console.log('🚀 Starting search fields backfill...');

    // 1. Backfill Products (nameLower)
    console.log('\n--- Processing Products ---');
    const productsRef = collection(db, 'products');
    const productsSnapshot = await getDocs(productsRef);
    let batch = writeBatch(db);
    let count = 0;
    let totalProducts = 0;

    for (const docSnap of productsSnapshot.docs) {
        const data = docSnap.data();
        if (data.name && !data.nameLower) {
            batch.update(doc(db, 'products', docSnap.id), {
                nameLower: data.name.toLowerCase(),
                updated_at: new Date().toISOString()
            });
            count++;
            totalProducts++;
            if (count >= BATCH_SIZE) {
                await batch.commit();
                console.log(`  ✓ Updated ${totalProducts} products...`);
                batch = writeBatch(db);
                count = 0;
            }
        }
    }
    if (count > 0) {
        await batch.commit();
        console.log(`  ✓ Updated ${totalProducts} products...`);
    }
    console.log(`✅ Completed Products: updated ${totalProducts} records.`);

    // 2. Backfill Suppliers (nameLower)
    console.log('\n--- Processing Suppliers ---');
    const suppliersRef = collection(db, 'suppliers');
    const suppliersSnapshot = await getDocs(suppliersRef);
    batch = writeBatch(db);
    count = 0;
    let totalSuppliers = 0;

    for (const docSnap of suppliersSnapshot.docs) {
        const data = docSnap.data();
        if (data.companyName && !data.nameLower) {
            batch.update(doc(db, 'suppliers', docSnap.id), {
                nameLower: data.companyName.toLowerCase(),
                updated_at: new Date().toISOString()
            });
            count++;
            totalSuppliers++;
            if (count >= BATCH_SIZE) {
                await batch.commit();
                console.log(`  ✓ Updated ${totalSuppliers} suppliers...`);
                batch = writeBatch(db);
                count = 0;
            }
        }
    }
    if (count > 0) {
        await batch.commit();
        console.log(`  ✓ Updated ${totalSuppliers} suppliers...`);
    }
    console.log(`✅ Completed Suppliers: updated ${totalSuppliers} records.`);

    // 3. Backfill Customers (nameLower)
    console.log('\n--- Processing Customers ---');
    const customersRef = collection(db, 'customers');
    const customersSnapshot = await getDocs(customersRef);
    batch = writeBatch(db);
    count = 0;
    let totalCustomers = 0;

    for (const docSnap of customersSnapshot.docs) {
        const data = docSnap.data();
        if (data.name && !data.nameLower) {
            batch.update(doc(db, 'customers', docSnap.id), {
                nameLower: data.name.toLowerCase(),
                updated_at: new Date().toISOString()
            });
            count++;
            totalCustomers++;
            if (count >= BATCH_SIZE) {
                await batch.commit();
                console.log(`  ✓ Updated ${totalCustomers} customers...`);
                batch = writeBatch(db);
                count = 0;
            }
        }
    }
    if (count > 0) {
        await batch.commit();
        console.log(`  ✓ Updated ${totalCustomers} customers...`);
    }
    console.log(`✅ Completed Customers: updated ${totalCustomers} records.`);

    // 4. Backfill Purchases (supplierNameLower and invoiceNoLower)
    console.log('\n--- Processing Purchases ---');
    const purchasesRef = collection(db, 'purchases');
    const purchasesSnapshot = await getDocs(purchasesRef);
    batch = writeBatch(db);
    count = 0;
    let totalPurchases = 0;

    for (const docSnap of purchasesSnapshot.docs) {
        const data = docSnap.data();
        const updates: any = {};
        if (data.supplierName && !data.supplierNameLower) {
            updates.supplierNameLower = data.supplierName.toLowerCase();
        }
        if (data.invoiceNo && !data.invoiceNoLower) {
            updates.invoiceNoLower = data.invoiceNo.toLowerCase();
        }
        if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            batch.update(doc(db, 'purchases', docSnap.id), updates);
            count++;
            totalPurchases++;
            if (count >= BATCH_SIZE) {
                await batch.commit();
                console.log(`  ✓ Updated ${totalPurchases} purchases...`);
                batch = writeBatch(db);
                count = 0;
            }
        }
    }
    if (count > 0) {
        await batch.commit();
        console.log(`  ✓ Updated ${totalPurchases} purchases...`);
    }
    console.log(`✅ Completed Purchases: updated ${totalPurchases} records.`);

    console.log('\n🎉 Backfill successfully completed.');
}

backfillSearchFields().catch(err => {
    console.error('\n❌ Backfill failed:', err);
    process.exit(1);
});
