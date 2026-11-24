import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Initialize Admin SDK using service account key file
 * Path is read strictly from FIREBASE_ADMIN_KEY environment variable.
 */
export function getAdminFirestore() {
    const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
    const keyPath = process.env.FIREBASE_ADMIN_KEY;

    if (!isEmulator) {
        if (!keyPath) {
            console.error('❌ SAFETY BLOCK: Script requires FIREBASE_ADMIN_KEY environment variable pointing to service-account.json or FIRESTORE_EMULATOR_HOST to run.');
            process.exit(1);
        }

        const resolvedPath = path.resolve(keyPath);
        if (!fs.existsSync(resolvedPath)) {
            console.error(`❌ Service account key file not found at: ${resolvedPath}`);
            process.exit(1);
        }

        if (!getApps().length) {
            const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
            initializeApp({ credential: cert(serviceAccount) });
        }
    } else {
        if (!getApps().length) {
            initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-ganewa' });
        }
    }

    return getFirestore();
}
