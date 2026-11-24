# Production Deployment & Hardening Release Checklist

This document details the exact, step-by-step procedure for releasing the hardened Ganewa Shopping Mall applications (`pos` and `ecommerce`) to production.

---

## 1. Secrets That MUST Be Rotated Immediately

The following credentials appeared in git commit history or environment scripts prior to the `hardening/cleanup` branch and **must be rotated**:

1. **Store Master Password**:
   - `GanewaStore123!` was committed to git in multiple scripts and fallback configurations. Change the password of `ganewashoppingmallkurfi@gmail.com` in Google / Firebase Auth console.
2. **Firebase Web API Keys**:
   - In Google Cloud Console -> APIs & Credentials, restrict your Firebase API keys by HTTP referrers:
     - `https://ganewa-provision-pos.web.app/*`
     - `https://ganewa-provision-pos.firebaseapp.com/*`
     - `https://ganewamall-shop.web.app/*`
     - `https://ganewamall-shop.firebaseapp.com/*`
3. **Cloudinary Upload Credentials**:
   - Verify upload presets in Cloudinary dashboard to ensure unsigned uploads are restricted or signed.

---

## 2. Release & Execution Sequence

Execute strictly in the following sequential order:

```
[1. Backup Firestore] ➡️ [2. Deploy Cloud Functions] ➡️ [3. Bootstrap & Migrate Staff Accounts]
         ⬇️
[4. Deploy Firestore Rules] ➡️ [5. Deploy POS & Ecommerce PWAs] ➡️ [6. Smoke Tests & Verification]
```

### Step 1: Backup Production Firestore
Run a manual export of your Firestore database before touching rules or deploying code:
```bash
gcloud firestore export gs://<your-backup-bucket>/pre-hardening-backup-$(date +%Y%m%d) --project=ganewa-provision-pos
```

### Step 2: Deploy Cloud Functions
Deploy the newly hardened functions (`createOrder`, `setUserRole`, `getNextInvoiceNumber`, etc.):
```bash
cd functions
npm install
npm run build
firebase deploy --only functions --project ganewa-provision-pos
```

### Step 3: Bootstrap Primary Super Admin & Migrate Staff Accounts
Run the one-time migration script to create Firebase Auth accounts for existing staff and scrub plaintext passwords:

```bash
# 1. Bootstrap your primary Super Admin account (with SUPER_ADMIN custom claim)
npx tsx src/admin/bootstrap-super-admin.ts admin@ganewa.store "YourStrongPasswordHere#"

# 2. Migrate existing staff from Firestore `users` to Firebase Auth & scrub plaintext passwords
npx tsx src/admin/migrate-staff-accounts.ts
```

### Step 4: Deploy Canonical Firestore Security Rules
Deploy the single canonical security rules file from `pos/firestore.rules`:
```bash
firebase deploy --only firestore:rules --project ganewa-provision-pos
```

### Step 5: Deploy Web Frontends
Build and deploy both PWA applications:
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

### Step 6: Post-Deployment Smoke Tests
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
3. **Storefront Checkout**:
   - Add an item to cart and complete checkout.
   - Verify the order is created via `createOrder` Cloud Function with server-calculated price, delivery fee, and stock reduction.
   - Check that direct client writes to `/orders` are blocked with `PERMISSION_DENIED`.

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
