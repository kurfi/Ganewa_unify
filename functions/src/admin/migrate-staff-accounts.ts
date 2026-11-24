import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

if (!getApps().length) {
    initializeApp();
}

const auth = getAuth();
const db = getFirestore();

interface LegacyStaffUser {
    id: string;
    username: string;
    password?: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'CASHIER';
    name?: string;
    email?: string;
    active?: boolean;
}

export async function migrateStaffAccounts(options: { dryRun?: boolean } = {}) {
    console.log(`[StaffMigration] Starting staff account migration... (dryRun=${options.dryRun ?? false})`);
    
    const usersSnapshot = await db.collection('users').get();
    console.log(`[StaffMigration] Found ${usersSnapshot.size} total user documents in Firestore.`);

    const results = {
        created: 0,
        updated: 0,
        passwordsScrubbed: 0,
        skipped: 0,
        errors: [] as string[]
    };

    for (const docSnap of usersSnapshot.docs) {
        const userData = docSnap.data() as LegacyStaffUser;
        const uid = docSnap.id;
        const username = userData.username || uid;
        const email = userData.email || `${username.toLowerCase().trim()}@ganewa.store`;
        const role = userData.role || 'CASHIER';

        console.log(`[StaffMigration] Processing user: ${username} (${email}), role: ${role}`);

        try {
            let firebaseUser;
            try {
                firebaseUser = await auth.getUser(uid);
                console.log(`[StaffMigration] Firebase Auth user already exists for UID: ${uid}`);
            } catch (err: any) {
                if (err.code === 'auth/user-not-found') {
                    if (!options.dryRun) {
                        // Generate a strong temporary password if no legacy password existed
                        const initialPassword = userData.password && userData.password.length >= 6
                            ? userData.password
                            : `GanewaStaff#${crypto.randomBytes(4).toString('hex')}`;

                        firebaseUser = await auth.createUser({
                            uid: uid,
                            email: email,
                            displayName: userData.name || username,
                            password: initialPassword,
                            disabled: userData.active === false
                        });
                        results.created++;
                        console.log(`[StaffMigration] Created Firebase Auth user: ${email} (UID: ${uid})`);
                    }
                } else {
                    throw err;
                }
            }

            // Set custom claim role
            if (!options.dryRun) {
                await auth.setCustomUserClaims(uid, { role });
                results.updated++;

                // Scrub plaintext password from Firestore
                if (userData.password) {
                    await db.collection('users').doc(uid).update({
                        password: FieldValue.delete(),
                        migratedToAuthAt: FieldValue.serverTimestamp(),
                        email: email
                    });
                    results.passwordsScrubbed++;
                    console.log(`[StaffMigration] Scrubbed plaintext password for user doc: ${uid}`);
                }
            }
        } catch (err: any) {
            console.error(`[StaffMigration] Error migrating user ${username}:`, err.message);
            results.errors.push(`${username}: ${err.message}`);
        }
    }

    console.log('[StaffMigration] Migration complete. Summary:', results);
    return results;
}

// CLI execution check
if (process.argv[1]?.endsWith('migrate-staff-accounts.ts') || process.argv[1]?.endsWith('migrate-staff-accounts.js')) {
    const isDryRun = process.argv.includes('--dry-run');
    migrateStaffAccounts({ dryRun: isDryRun })
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('[StaffMigration] Fatal error:', err);
            process.exit(1);
        });
}
