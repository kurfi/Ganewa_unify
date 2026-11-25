"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrubStaffPasswords = scrubStaffPasswords;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
/**
 * Separate Password Scrubbing Script
 *
 * Safely removes legacy plaintext `password` fields from Firestore `users` documents.
 * MUST only be executed after all staff members have verified their login via Firebase Auth.
 * Includes mandatory confirmation and supports --dry-run.
 */
async function scrubStaffPasswords(options = {}) {
    var _a;
    const isDryRun = (_a = options.dryRun) !== null && _a !== void 0 ? _a : false;
    console.log(`[ScrubPasswords] Starting plaintext password scrub... (dryRun=${isDryRun})`);
    const usersSnapshot = await db.collection('users').get();
    let eligibleCount = 0;
    let scrubbedCount = 0;
    for (const docSnap of usersSnapshot.docs) {
        const data = docSnap.data();
        if (data.password) {
            eligibleCount++;
            console.log(`[ScrubPasswords] Found plaintext password on user doc: ${docSnap.id} (${data.username || data.email})`);
            if (!isDryRun) {
                await db.collection('users').doc(docSnap.id).update({
                    password: firestore_1.FieldValue.delete(),
                    passwordsScrubbedAt: firestore_1.FieldValue.serverTimestamp()
                });
                scrubbedCount++;
            }
        }
    }
    console.log(`[ScrubPasswords] Summary: Found ${eligibleCount} users with plaintext passwords. Scrubbed: ${scrubbedCount}`);
    return { eligibleCount, scrubbedCount, dryRun: isDryRun };
}
if (((_a = process.argv[1]) === null || _a === void 0 ? void 0 : _a.endsWith('scrub-staff-passwords.ts')) || ((_b = process.argv[1]) === null || _b === void 0 ? void 0 : _b.endsWith('scrub-staff-passwords.js'))) {
    const isDryRun = process.argv.includes('--dry-run');
    const isForce = process.argv.includes('--force');
    if (!isDryRun && !isForce) {
        console.error('SAFETY BLOCK: To execute real scrubbing, run with --force. Use --dry-run to preview.');
        process.exit(1);
    }
    scrubStaffPasswords({ dryRun: isDryRun, force: isForce })
        .then(() => process.exit(0))
        .catch(err => {
        console.error('[ScrubPasswords] Error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=scrub-staff-passwords.js.map