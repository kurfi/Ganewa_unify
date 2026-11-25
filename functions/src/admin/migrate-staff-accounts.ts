import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { STAFF_EMAIL_DOMAIN } from '../constants/staffAuth';

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

export interface MigrationOptions {
    dryRun?: boolean;
    domain?: string;
    sendResetEmails?: boolean;
}

/**
 * Staff Account Migration
 * 
 * Maps existing username-based staff to hidden internal emails:
 * <username>@staff.ganewa.invalid (or specified domain).
 * Sets custom claims role (SUPER_ADMIN, ADMIN, CASHIER).
 * 
 * IMPORTANT: Does NOT delete or scrub plaintext passwords.
 * Scrubbing is performed independently via scrub-staff-passwords.ts
 * only after staff have verified login access.
 */
export async function migrateStaffAccounts(options: MigrationOptions = {}) {
    const isDryRun = options.dryRun ?? false;
    const domain = options.domain || STAFF_EMAIL_DOMAIN;
    console.log(`[StaffMigration] Starting migration... (dryRun=${isDryRun}, domain=${domain})`);

    const usersSnapshot = await db.collection('users').get();
    console.log(`[StaffMigration] Found ${usersSnapshot.size} total user documents in Firestore.`);

    const results = {
        created: 0,
        updated: 0,
        tempPasswordsIssued: [] as { username: string; email: string; tempPass: string }[],
        resetLinksGenerated: [] as { username: string; email: string; link: string }[],
        errors: [] as string[]
    };

    for (const docSnap of usersSnapshot.docs) {
        const userData = docSnap.data() as LegacyStaffUser;
        const uid = docSnap.id;
        const username = userData.username || uid;
        const normalizedUsername = username.toLowerCase().replace(/[^a-z0-9._-]/g, '');
        const email = userData.email || `${normalizedUsername}@${domain}`;
        const role = userData.role || 'CASHIER';

        console.log(`[StaffMigration] Processing: ${username} -> ${email} (Role: ${role})`);

        try {
            // Safety Check: Verify if an account with this email already exists under a DIFFERENT UID.
            // If so, fail loudly to prevent account hijacking/linking.
            try {
                const existingByEmail = await auth.getUserByEmail(email);
                if (existingByEmail.uid !== uid) {
                    throw new Error(`SECURITY ALERT: Account already exists for email ${email} under UID ${existingByEmail.uid} (differs from Firestore UID ${uid}). Refusing to link or proceed.`);
                }
            } catch (emailErr: any) {
                if (emailErr.code !== 'auth/user-not-found') {
                    throw emailErr;
                }
            }

            try {
                await auth.getUser(uid);
                console.log(`[StaffMigration] Firebase Auth user already exists for UID: ${uid}`);
            } catch (err: any) {
                if (err.code === 'auth/user-not-found') {
                    if (!isDryRun) {
                        const tempPass = userData.password && userData.password.length >= 6
                            ? userData.password
                            : `GanewaStaff#${crypto.randomBytes(3).toString('hex')}!`;

                        await auth.createUser({
                            uid: uid,
                            email: email,
                            displayName: userData.name || username,
                            password: tempPass,
                            disabled: userData.active === false
                        });

                        results.created++;
                        // Print temporary password strictly to stdout once; NEVER write to file or Firestore
                        console.log(`[StaffMigration] CREATED AUTH USER:`);
                        console.log(`   Username: ${username}`);
                        console.log(`   Email:    ${email}`);
                        console.log(`   TempPass: ${tempPass}`);
                        console.log(`   ------------------------------------------`);

                        results.tempPasswordsIssued.push({ username, email, tempPass });

                        if (options.sendResetEmails) {
                            try {
                                const resetLink = await auth.generatePasswordResetLink(email);
                                results.resetLinksGenerated.push({ username, email, link: resetLink });
                            } catch (linkErr: any) {
                                console.warn(`[StaffMigration] Could not generate reset link for ${email}:`, linkErr.message);
                            }
                        }
                    }
                } else {
                    throw err;
                }
            }

            // Assign role custom claims
            if (!isDryRun) {
                await auth.setCustomUserClaims(uid, { role, mustChangePassword: true });
                results.updated++;

                // Record email and username mapping in document (preserving legacy password for now)
                await db.collection('users').doc(uid).set({
                    email,
                    username,
                    role,
                    migratedToAuth: true,
                    mustChangePassword: true,
                    migratedAt: FieldValue.serverTimestamp()
                }, { merge: true });
            }
        } catch (err: any) {
            console.error(`[StaffMigration] Error migrating ${username}:`, err.message);
            results.errors.push(`${username}: ${err.message}`);
        }
    }

    console.log('[StaffMigration] Migration finished. Summary:', {
        created: results.created,
        updated: results.updated,
        tempPasswordsCount: results.tempPasswordsIssued.length,
        errors: results.errors
    });

    return results;
}

if (process.argv[1]?.endsWith('migrate-staff-accounts.ts') || process.argv[1]?.endsWith('migrate-staff-accounts.js')) {
    const isDryRun = process.argv.includes('--dry-run');
    const sendReset = process.argv.includes('--send-reset');
    migrateStaffAccounts({ dryRun: isDryRun, sendResetEmails: sendReset })
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('[StaffMigration] Fatal error:', err);
            process.exit(1);
        });
}
