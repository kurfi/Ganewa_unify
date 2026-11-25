"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateStaffAccounts = migrateStaffAccounts;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const crypto = __importStar(require("crypto"));
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const auth = (0, auth_1.getAuth)();
const db = (0, firestore_1.getFirestore)();
/**
 * Staff Account Migration
 *
 * Maps existing username-based staff to standard corporate emails:
 * <username>@ganewa.store (or specified domain).
 * Sets custom claims role (SUPER_ADMIN, ADMIN, CASHIER).
 *
 * IMPORTANT: Does NOT delete or scrub plaintext passwords.
 * Scrubbing is performed independently via scrub-staff-passwords.ts
 * only after staff have verified login access.
 */
async function migrateStaffAccounts(options = {}) {
    var _a;
    const isDryRun = (_a = options.dryRun) !== null && _a !== void 0 ? _a : false;
    const domain = options.domain || 'ganewa.store';
    console.log(`[StaffMigration] Starting migration... (dryRun=${isDryRun}, domain=${domain})`);
    const usersSnapshot = await db.collection('users').get();
    console.log(`[StaffMigration] Found ${usersSnapshot.size} total user documents in Firestore.`);
    const results = {
        created: 0,
        updated: 0,
        tempPasswordsIssued: [],
        resetLinksGenerated: [],
        errors: []
    };
    for (const docSnap of usersSnapshot.docs) {
        const userData = docSnap.data();
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
            }
            catch (emailErr) {
                if (emailErr.code !== 'auth/user-not-found') {
                    throw emailErr;
                }
            }
            try {
                await auth.getUser(uid);
                console.log(`[StaffMigration] Firebase Auth user already exists for UID: ${uid}`);
            }
            catch (err) {
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
                            }
                            catch (linkErr) {
                                console.warn(`[StaffMigration] Could not generate reset link for ${email}:`, linkErr.message);
                            }
                        }
                    }
                }
                else {
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
                    migratedAt: firestore_1.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        }
        catch (err) {
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
if (((_a = process.argv[1]) === null || _a === void 0 ? void 0 : _a.endsWith('migrate-staff-accounts.ts')) || ((_b = process.argv[1]) === null || _b === void 0 ? void 0 : _b.endsWith('migrate-staff-accounts.js'))) {
    const isDryRun = process.argv.includes('--dry-run');
    const sendReset = process.argv.includes('--send-reset');
    migrateStaffAccounts({ dryRun: isDryRun, sendResetEmails: sendReset })
        .then(() => process.exit(0))
        .catch((err) => {
        console.error('[StaffMigration] Fatal error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate-staff-accounts.js.map