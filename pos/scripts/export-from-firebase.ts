import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Setup __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
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
const auth = getAuth(app);
const db = getFirestore(app);

// Authentication details from .env.local or defaults
const STORE_EMAIL = 'ganewashoppingmallkurfi@gmail.com';
const STORE_PASSWORD = process.env.VITE_FIREBASE_STORE_PASSWORD;
if (!STORE_PASSWORD) {
    throw new Error('VITE_FIREBASE_STORE_PASSWORD is required in environment variables');
}

const outputDir = path.join(__dirname, '../firebase-export');

const collectionsToExport = [
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
    'auditLogs'
];

async function fetchCollection(collectionName: string) {
    try {
        const colRef = collection(db, collectionName);
        const snapshot = await getDocs(colRef);
        const documents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log(`  ✓ Successfully exported '${collectionName}': ${documents.length} documents`);
        return documents;
    } catch (error: any) {
        console.error(`  ✗ Error exporting '${collectionName}':`, error.message);
        return null;
    }
}

async function main() {
    console.log('🚀 Starting Firebase Firestore Local Export...');
    console.log(`📍 Project ID: ${firebaseConfig.projectId}`);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
        console.log(`📁 Created output directory at: ${outputDir}`);
    }

    // Authenticate as Store Account to satisfy security rules
    console.log(`🔑 Authenticating as ${STORE_EMAIL}...`);
    try {
        await signInWithEmailAndPassword(auth, STORE_EMAIL, STORE_PASSWORD);
        console.log('✅ Authentication successful!\n');
    } catch (error: any) {
        console.error('❌ Authentication failed:', error.message);
        console.log('Ensure VITE_FIREBASE_STORE_PASSWORD is correct in .env.local');
        process.exit(1);
    }

    // Export each collection
    for (const col of collectionsToExport) {
        const data = await fetchCollection(col);
        if (data !== null) {
            const fileDest = path.join(outputDir, `${col}.json`);
            fs.writeFileSync(fileDest, JSON.stringify(data, null, 2), 'utf-8');
        }
    }

    console.log(`\n🎉 Export finished! All available collections are stored in:`);
    console.log(`👉 ${outputDir}`);
}

main().catch((err) => {
    console.error('❌ Script failed unexpectedly:', err);
});
