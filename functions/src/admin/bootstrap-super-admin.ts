import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { STAFF_EMAIL_SUFFIX } from '../constants/staffAuth';

if (!getApps().length) {
    initializeApp();
}

const auth = getAuth();
const db = getFirestore();

export async function bootstrapSuperAdmin(
    emailOrUsername: string,
    password?: string,
    displayName = 'Super Administrator',
    role: 'SUPER_ADMIN' | 'ADMIN' = 'SUPER_ADMIN'
) {
    const email = emailOrUsername.includes('@')
        ? emailOrUsername.trim().toLowerCase()
        : `${emailOrUsername.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}${STAFF_EMAIL_SUFFIX}`;
    console.log(`[BootstrapSuperAdmin] Bootstrapping ${role}: ${email}...`);

    let user;
    try {
        user = await auth.getUserByEmail(email);
        console.log(`[BootstrapSuperAdmin] Existing Auth user found for ${email} (UID: ${user.uid})`);
        if (password) {
            await auth.updateUser(user.uid, { password });
            await auth.revokeRefreshTokens(user.uid);
            console.log(`[BootstrapSuperAdmin] Updated password and revoked old sessions for ${email}`);
        }
    } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
            if (!password) {
                throw new Error(`Password must be provided when creating a new ${role} account.`);
            }
            user = await auth.createUser({
                email,
                password,
                displayName
            });
            console.log(`[BootstrapSuperAdmin] Created new Auth user ${email} (UID: ${user.uid})`);
        } else {
            throw err;
        }
    }

    // Set role custom claim
    await auth.setCustomUserClaims(user.uid, { role });
    console.log(`[BootstrapSuperAdmin] Successfully set role="${role}" custom claim on user ${user.uid}`);

    // Update Firestore users collection
    await db.collection('users').doc(user.uid).set({
        username: email.split('@')[0],
        name: displayName,
        email,
        role,
        active: true,
        deleted: false,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[BootstrapSuperAdmin] ${role} profile updated in Firestore: ${user.uid}`);
    return { uid: user.uid, email, role };
}

if (process.argv[1]?.endsWith('bootstrap-super-admin.ts') || process.argv[1]?.endsWith('bootstrap-super-admin.js')) {
    const email = process.argv[2];
    const password = process.argv[3];
    const argRole = (process.argv[4]?.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN') as 'SUPER_ADMIN' | 'ADMIN';
    if (!email) {
        console.error('Usage: tsx bootstrap-super-admin.ts <email-or-username> [password] [SUPER_ADMIN|ADMIN]');
        process.exit(1);
    }
    bootstrapSuperAdmin(email, password, argRole === 'ADMIN' ? 'Store Administrator' : 'Super Administrator', argRole)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('[BootstrapSuperAdmin] Error:', err);
            process.exit(1);
        });
}
