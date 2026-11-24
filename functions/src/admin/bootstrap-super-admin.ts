import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
    initializeApp();
}

const auth = getAuth();
const db = getFirestore();

export async function bootstrapSuperAdmin(email: string, password?: string, displayName = 'Super Administrator') {
    console.log(`[BootstrapSuperAdmin] Bootstrapping primary SUPER_ADMIN: ${email}...`);

    let user;
    try {
        user = await auth.getUserByEmail(email);
        console.log(`[BootstrapSuperAdmin] Existing Auth user found for ${email} (UID: ${user.uid})`);
    } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
            if (!password) {
                throw new Error('Password must be provided when creating a new Super Admin account.');
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

    // Set SUPER_ADMIN custom claim
    await auth.setCustomUserClaims(user.uid, { role: 'SUPER_ADMIN' });
    console.log(`[BootstrapSuperAdmin] Successfully set role="SUPER_ADMIN" custom claim on user ${user.uid}`);

    // Update Firestore users collection
    await db.collection('users').doc(user.uid).set({
        username: email.split('@')[0],
        name: displayName,
        email,
        role: 'SUPER_ADMIN',
        active: true,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[BootstrapSuperAdmin] Super Admin profile updated in Firestore: ${user.uid}`);
    return { uid: user.uid, email, role: 'SUPER_ADMIN' };
}

if (process.argv[1]?.endsWith('bootstrap-super-admin.ts') || process.argv[1]?.endsWith('bootstrap-super-admin.js')) {
    const email = process.argv[2];
    const password = process.argv[3];
    if (!email) {
        console.error('Usage: tsx bootstrap-super-admin.ts <email> [password]');
        process.exit(1);
    }
    bootstrapSuperAdmin(email, password)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('[BootstrapSuperAdmin] Error:', err);
            process.exit(1);
        });
}
