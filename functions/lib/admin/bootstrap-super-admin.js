"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSuperAdmin = bootstrapSuperAdmin;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const staffAuth_1 = require("../constants/staffAuth");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const auth = (0, auth_1.getAuth)();
const db = (0, firestore_1.getFirestore)();
async function bootstrapSuperAdmin(emailOrUsername, password, displayName = 'Super Administrator') {
    const email = emailOrUsername.includes('@')
        ? emailOrUsername.trim().toLowerCase()
        : `${emailOrUsername.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}${staffAuth_1.STAFF_EMAIL_SUFFIX}`;
    console.log(`[BootstrapSuperAdmin] Bootstrapping primary SUPER_ADMIN: ${email}...`);
    let user;
    try {
        user = await auth.getUserByEmail(email);
        console.log(`[BootstrapSuperAdmin] Existing Auth user found for ${email} (UID: ${user.uid})`);
    }
    catch (err) {
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
        }
        else {
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
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[BootstrapSuperAdmin] Super Admin profile updated in Firestore: ${user.uid}`);
    return { uid: user.uid, email, role: 'SUPER_ADMIN' };
}
if (((_a = process.argv[1]) === null || _a === void 0 ? void 0 : _a.endsWith('bootstrap-super-admin.ts')) || ((_b = process.argv[1]) === null || _b === void 0 ? void 0 : _b.endsWith('bootstrap-super-admin.js'))) {
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
//# sourceMappingURL=bootstrap-super-admin.js.map