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
const dataDir = path.join(__dirname, '../migration-data');

// ID Mappings
const productMap = new Map(); // barcode -> newId
const customerMap = new Map(); // oldId -> newId

async function importCollection(fileName, collectionName, transform) {
    const filePath = path.join(dataDir, fileName);
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ Skipping ${fileName} - not found`);
        return;
    }

    console.log(`\n📦 Importing ${collectionName}...`);
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    let batch = writeBatch(db);
    let count = 0;
    let total = 0;

    for (const record of records) {
        const transformed = transform(record);
        if (!transformed) continue;

        const docRef = doc(db, collectionName, transformed.id);
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
    console.log(`✅ Completed ${collectionName}: ${total} records`);
}

async function main() {
    console.log('🚀 Starting Firebase Migration\n');

    // 1. Import Products
    await importCollection('products.json', 'products', (item) => {
        const id = uuidv4();
        if (item.barcode) productMap.set(item.barcode, id);
        return {
            id,
            name: item.itemname || 'Unknown Item',
            barcode: item.barcode || '',
            category: item.category || 'General',
            buyPrice: parseFloat(item.buyprice) || 0,
            sellPrice: parseFloat(item.sellprice) || 0,
            wholesalePrice: parseFloat(item.wholesale) || 0,
            quantity: parseFloat(item.quantity) || 0,
            minStockLevel: parseInt(item.minqty) || 0,
            department: item.dept || '',
            brand: item.brand || '',
            unitOfMeasure: item.uom || '',
            unitPack: item.unitpack || '',
            supplierName: item.suppliername || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    });

    // 2. Import Customers
    await importCollection('customers.json', 'customers', (cust) => {
        const id = uuidv4();
        if (cust.customerid) customerMap.set(cust.customerid, id);
        return {
            id,
            name: cust.custname || 'Generic Customer',
            phone: cust.gsm || cust.phone || '',
            email: cust.email || '',
            address: cust.address || '',
            creditLimit: parseFloat(cust.creditlimit) || 0,
            currentDebt: parseFloat(cust.balance) || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    });

    // 3. Import Sales (Receipts) - We'll group them with details if possible, but for large migrations flat is safer.
    // However, the interface expects nested. Let's group them.
    console.log('\n🔄 Preparing Sales data (grouping items)...');
    const salesRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'sales.json'), 'utf-8'));
    const detailsRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'receipt_details.json'), 'utf-8'));

    const detailsMap = new Map();
    detailsRaw.forEach(d => {
        if (!detailsMap.has(d.receiptid)) detailsMap.set(d.receiptid, []);
        detailsMap.get(d.receiptid).push(d);
    });

    let saleBatch = writeBatch(db);
    let saleCount = 0;
    let saleTotal = 0;

    for (const s of salesRaw) {
        const id = uuidv4();
        const items = (detailsMap.get(s.receiptid) || []).map(d => ({
            productId: productMap.get(d.barcode) || 'historical-' + d.barcode,
            productName: d.itemname,
            quantity: parseFloat(d.counts) || 0,
            price: parseFloat(d.price) || 0,
            total: parseFloat(d.tprice) || 0
        }));

        const transformed = {
            id,
            customerId: customerMap.get(s.customerid) || null,
            customerName: s.customer || 'Walking Customer',
            date: new Date(s.receiptdate || Date.now()).toISOString(),
            items: items,
            totalAmount: parseFloat(s.receipttotal) || 0,
            finalAmount: parseFloat(s.amounts) || 0,
            discount: parseFloat(s.discount) || 0,
            paymentMethod: (s.mode || 'CASH').toUpperCase(),
            status: 'COMPLETED',
            cashier: s.username || 'System',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const docRef = doc(db, 'sales', id);
        saleBatch.set(docRef, transformed);
        saleCount++;
        saleTotal++;

        if (saleCount >= BATCH_SIZE) {
            await saleBatch.commit();
            console.log(`  ✓ Uploaded ${saleTotal} sales...`);
            saleBatch = writeBatch(db);
            saleCount = 0;
        }
    }
    if (saleCount > 0) await saleBatch.commit();
    console.log(`✅ Completed sales: ${saleTotal} records`);

    // 4. Import Expenses
    await importCollection('expenses.json', 'expenses', (exp) => ({
        id: uuidv4(),
        date: new Date(exp.dates || Date.now()).toISOString(),
        category: exp.description || 'General',
        amount: parseFloat(exp.amount) || 0,
        note: exp.note || '',
        status: 'PAID',
        department: exp.dept || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }));

    // 5. Import Users
    await importCollection('users.json', 'users', (u) => ({
        id: uuidv4(),
        username: u.username,
        role: (u.role || 'CASHIER').toUpperCase(),
        firstName: u.firstname || '',
        lastName: u.lastname || '',
        phone: u.phoneno || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }));

    console.log('\n🎉 Migration Fully Completed!');
}

main().catch(err => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
});
