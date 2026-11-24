/**
 * fix-customer-debt.mjs
 *
 * Corrects MASAUDU BELLO's currentDebt in Firestore.
 *
 * Chronology:
 * 1. Sale #62731340-89d4-48b9-8496-b28a3d8eb9bf was created on Sep 30, 2026 16:59:06
 *    - previousDebt: ₦1,100
 *    - thisSaleDebt: ₦2,950
 *    - newDebt:      ₦4,050
 * 2. At 17:05:25 - 17:05:28 (6 minutes later), 4 duplicate returns fired.
 *    Because useReturns uses Math.max(0, currentDebt - 2950):
 *    - Return 1: 4,050 - 2,950 = 1,100
 *    - Return 2: 1,100 - 2,950 = clamped to 0
 *    - Return 3 & 4: clamped to 0
 *    So debt was reduced from ₦4,050 to ₦0.
 * 3. With all 4 returns now deleted, customer's pre-return debt of ₦4,050 must be restored.
 *    (When the return is cleanly re-processed, ₦2,950 will be deducted, leaving ₦1,100).
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
    getFirestore, doc, getDoc, updateDoc,
    collection, query, where, limit, setDoc, serverTimestamp, getDocs
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CUSTOMER_ID = '07f6694a-2d8d-4936-b3ca-aa51b9fea7f7';
const TARGET_DEBT = 4050; // Exact pre-return debt recorded on the sale

const envPath = path.join(__dirname, '../.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const firebaseConfig = {
    apiKey:            envConfig.VITE_FIREBASE_API_KEY,
    authDomain:        envConfig.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         envConfig.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     envConfig.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             envConfig.VITE_FIREBASE_APP_ID,
};

const STORE_EMAIL    = 'ganewashoppingmallkurfi@gmail.com';
const STORE_PASSWORD = envConfig.VITE_FIREBASE_STORE_PASSWORD;
if (!STORE_PASSWORD) {
    throw new Error('VITE_FIREBASE_STORE_PASSWORD is required in environment configuration');
}

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

async function main() {
    console.log('══════════════════════════════════════════════════════════════');
    console.log('  Customer Debt Correction — MASAUDU BELLO');
    console.log('══════════════════════════════════════════════════════════════\n');

    console.log(`🔑 Signing in as ${STORE_EMAIL}...`);
    await signInWithEmailAndPassword(auth, STORE_EMAIL, STORE_PASSWORD);
    console.log('✅ Authenticated.\n');

    const custRef = doc(db, 'customers', CUSTOMER_ID);
    const custSnap = await getDoc(custRef);
    if (!custSnap.exists()) {
        console.error(`❌ Customer ${CUSTOMER_ID} not found.`);
        process.exit(1);
    }

    const custData = custSnap.data();
    console.log(`👤 Customer: ${custData.name} (${CUSTOMER_ID})`);
    console.log(`   Current Debt in DB: ₦${(custData.currentDebt || 0).toLocaleString()}`);
    console.log(`   Restoring to:       ₦${TARGET_DEBT.toLocaleString()} (pre-return debt from sale #62731340)`);

    const nowIso = new Date().toISOString();
    await updateDoc(custRef, {
        currentDebt: TARGET_DEBT,
        updated_at: nowIso,
    });
    console.log(`\n✅ Successfully updated customer currentDebt to ₦${TARGET_DEBT.toLocaleString()}`);

    // Check shopUsers link just in case
    const shopUsersRef = collection(db, 'shopUsers');
    const qShop = query(shopUsersRef, where('linkedPosCustomerId', '==', CUSTOMER_ID), limit(1));
    const shopSnap = await getDocs(qShop);
    if (!shopSnap.empty) {
        const linked = shopSnap.docs[0];
        const creditLimit = Number(custData.creditLimit) || 0;
        await setDoc(doc(db, 'shopUsers', linked.id), {
            creditInfo: {
                creditLimit,
                currentDebt: TARGET_DEBT,
                availableCredit: Math.max(0, creditLimit - TARGET_DEBT),
                updatedAt: serverTimestamp(),
            }
        }, { merge: true });
        console.log(`✅ Synced with linked shopUser account ${linked.id}`);
    }

    console.log('\n🎉 Done!');
}

main().catch(err => {
    console.error('❌ Failed:', err);
    process.exit(1);
});
