import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
    initializeApp();
}

const db = getFirestore();

/**
 * Separate Password Scrubbing Script
 * 
 * Safely removes legacy plaintext `password` fields from Firestore `users` documents.
 * MUST only be executed after all staff members have verified their login via Firebase Auth.
 * Includes mandatory confirmation and supports --dry-run.
 */
export async function scrubStaffPasswords(options: { dryRun?: boolean; force?: boolean } = {}) {
    const isDryRun = options.dryRun ?? false;
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
                    password: FieldValue.delete(),
                    passwordsScrubbedAt: FieldValue.serverTimestamp()
                });
                scrubbedCount++;
            }
        }
    }

    console.log(`[ScrubPasswords] Summary: Found ${eligibleCount} users with plaintext passwords. Scrubbed: ${scrubbedCount}`);
    return { eligibleCount, scrubbedCount, dryRun: isDryRun };
}

if (process.argv[1]?.endsWith('scrub-staff-passwords.ts') || process.argv[1]?.endsWith('scrub-staff-passwords.js')) {
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
