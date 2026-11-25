# Production Deployment & Hardening Release Checklist

This document details the exact, step-by-step procedure for releasing the hardened Ganewa Shopping Mall applications (`pos` and `ecommerce`) to production.

---

## 1. Secrets That MUST Be Rotated Immediately

The following credentials appeared in git commit history or environment scripts prior to the `hardening/cleanup` branch and **must be rotated**:

1. **Store Master Password**:
   - The legacy store password (`GanewaStore***` found in old commits) was committed to git in multiple scripts and fallback configurations. Change the password of `ganewashoppingmallkurfi@gmail.com` in Google / Firebase Auth console.
2. **Decommission Store Account**:
   - Once the first `SUPER_ADMIN` is bootstrapped, permanently disable or delete the shared store account (`ganewashoppingmallkurfi@gmail.com`) so all actions are tied to individual staff accounts with audit trails.
3. **Firebase Web API Keys**:
   - In Google Cloud Console -> APIs & Credentials, restrict your Firebase API keys by HTTP referrers:
     - `https://ganewa-provision-pos.web.app/*`
     - `https://ganewa-provision-pos.firebaseapp.com/*`
     - `https://ganewamall-shop.web.app/*`
     - `https://ganewamall-shop.firebaseapp.com/*`

---

## 2. Release & Execution Sequence

Execute strictly in the following sequential order:

```
[1. Backup Firestore] ➡️ [2. Staging Rehearsal] ➡️ [3. Deploy Cloud Functions]
         ⬇️
[4. Bootstrap 1st Super Admin] ➡️ [5. Staff Account Migration] ➡️ [6. Deploy Canonical Rules]
         ⬇️
[7. Deploy PWAs (POS & Shop)] ➡️ [8. Smoke Tests & Verification] ➡️ [9. Scrub Plaintext Passwords]
```

### Step 1: Backup Production Firestore
Run a manual export of your Firestore database before touching rules or deploying code:
```bash
gcloud firestore export gs://<your-backup-bucket>/pre-hardening-backup-$(date +%Y%m%d) --project=ganewa-provision-pos
```

### Step 2: Staging Rehearsal with Copied Data
Before running on production:
1. Export production data to a test bucket.
2. Import data into a staging Firebase project (e.g. `ganewa-staging`).
3. Run `migrate-staff-accounts.ts --dry-run` and verify created users in the staging Auth console.
4. Verify rules enforcement and order placement in the staging environment.

### Step 3: Deploy Cloud Functions
Deploy the newly hardened functions (`createOrder`, `setUserRole`, `getNextInvoiceNumber`, `completePasswordChange`, `blockStaffDomainSelfSignup`):

> **Verification Notice**:
> - Real rules & concurrency tests are executed and verified on the Firestore Emulator (`pos/src/__tests__/firestoreRulesLive.test.ts`).
> - The functions `setUserRole` and `blockStaffDomainSelfSignup` tests run against local mock logic and are marked **[NOT VERIFIED ON FULL EMULATOR]** because the Cloud Functions and Auth emulators require building functions (`tsc`), which was explicitly prohibited during this pass. They must be verified during Step 2 (Staging Rehearsal).
```bash
cd functions
npm install
npm run build
firebase deploy --only functions --project ganewa-provision-pos
```

### Step 4: Bootstrap Primary Super Admin & Rotate Store Account
Run the one-time bootstrap script you run yourself to create the first `SUPER_ADMIN`:

```bash
# Bootstrap your primary Super Admin account (with SUPER_ADMIN custom claim)
npx tsx src/admin/bootstrap-super-admin.ts admin@ganewa.store "YourStrongPasswordHere#"
```

*After this step:* Log into Firebase Auth console and disable `ganewashoppingmallkurfi@gmail.com`. From this point forward, `setUserRole` accepts calls strictly from `SUPER_ADMIN` callers.

### Step 5: Migrate Staff Accounts
Run the staff migration script to create Firebase Auth accounts for staff (with username-to-email mapping `<username>@ganewa.store`):
```bash
# Preview changes
npx tsx src/admin/migrate-staff-accounts.ts --dry-run

# Run migration (does NOT delete passwords)
npx tsx src/admin/migrate-staff-accounts.ts
```

### Step 6: Deploy Canonical Firestore Security Rules
Deploy the single canonical security rules file from `pos/firestore.rules`:
```bash
firebase deploy --only firestore:rules --project ganewa-provision-pos
```

### Step 7: Deploy Frontends via Firebase CLI
Deploy both PWA applications:
```bash
# POS PWA
cd pos
npm run build
firebase deploy --only hosting:ganewa-provision-pos --project ganewa-provision-pos

# Ecommerce Storefront
cd ../ecommerce
npm run build
firebase deploy --only hosting:ganewamall-shop --project ganewa-provision-pos
```

### Step 8: Post-Deployment Smoke Tests
1. **POS Till Login**:
   - Sign into the POS using individual staff credentials (email/password). Verify role capabilities match (`SUPER_ADMIN`, `ADMIN`, `CASHIER`).
   - Run the read-only IndexedDB diagnostic on each till to verify no unsynced local data remains:
     ```ts
     import { inspectLegacyIndexedDb } from './utils/inspectLegacyIndexedDb';
     inspectLegacyIndexedDb().then(console.log);
     ```
2. **POS Checkout (Cashier Role)**:
   - Attempt a test sale. Verify atomic invoice generation (`INV-XXXXXX`) and immediate stock deduction.
   - Verify cashier cannot change prices or cost prices in the product catalogue.
   - Verify cashier manual stock count changes generate audit log entries.
3. **Storefront Checkout**:
   - Add an item to cart and complete checkout.
   - Verify the order is created via `createOrder` Cloud Function with server-calculated price, delivery fee, and stock reduction.
   - Check that direct client writes to `/orders` are blocked with `PERMISSION_DENIED`.

### Step 9: Scrub Plaintext Passwords (Post-Verification Only)
Only after every staff member has logged in successfully and verified access:
```bash
# 1. Take a fresh Firestore export
gcloud firestore export gs://<your-backup-bucket>/post-migration-backup-$(date +%Y%m%d) --project=ganewa-provision-pos

# 2. Preview scrub
npx tsx src/admin/scrub-staff-passwords.ts --dry-run

# 3. Perform final scrub
npx tsx src/admin/scrub-staff-passwords.ts --force
```

---

## 3. Rollback Plan

If a critical issue occurs during release:

1. **Revert Rules**:
   ```bash
   git checkout HEAD~1 -- pos/firestore.rules
   firebase deploy --only firestore:rules --project ganewa-provision-pos
   ```
2. **Revert Hosting**:
   In Firebase Console -> Hosting -> View deployment history, click **Rollback** on the previous release.
3. **Revert Functions**:
   Deploy the previous function commit:
   ```bash
   firebase deploy --only functions --project ganewa-provision-pos
   ```
4. **Restore Database (Last Resort)**:
   ```bash
   gcloud firestore import gs://<your-backup-bucket>/pre-hardening-backup-<timestamp> --project=ganewa-provision-pos
   ```
