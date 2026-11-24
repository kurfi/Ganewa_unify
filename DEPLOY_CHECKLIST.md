# Production Deployment & Hardening Release Checklist

This document details the exact, step-by-step procedure for releasing the hardened Ganewa Shopping Mall applications (`pos` and `ecommerce`) and rolling out the unified product categories to production.

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
[7. Category Rollout & Migration] ➡️ [8. Deploy PWAs (POS & Shop)] ➡️ [9. Smoke Tests & Verification]
         ⬇️
[10. Scrub Plaintext Passwords]
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
Deploy the newly hardened functions (`createOrder`, `setUserRole`, `getNextInvoiceNumber`, etc.):
```bash
cd functions
npm install
npm run build
firebase deploy --only functions --project ganewa-provision-pos
```

### Step 4: Bootstrap Primary Super Admin & Rotate Store Account
Run the one-time bootstrap script you run yourself to create the first `SUPER_ADMIN`:
```bash
cd functions
npx tsx src/admin/bootstrap-super-admin.ts \
  --email="your-actual-superadmin@domain.com" \
  --password="AStrongTemporaryPassword123!" \
  --username="PrimaryAdmin"
```

### Step 5: Migrate Staff Accounts to Firebase Auth
Run the idempotent staff account migration utility:
```bash
# Dry run first to verify mapping
npx tsx src/admin/migrate-staff-accounts.ts --dry-run

# Run migration
npx tsx src/admin/migrate-staff-accounts.ts
```

### Step 6: Deploy Canonical Firestore Rules & Indexes
Deploy `pos/firestore.rules` and `firestore.indexes.json`:
- Contains custom-claims-based RBAC helpers (`isCashier()`, `isAdmin()`, `isSuperAdmin()`).
- Contains `/categories/{categoryId}` rules (public reads only active categories, staff reads all, only admins write).
- Retains `/departments/{docId}` read/write rules marked deprecated so legacy POS clients remain functional during cutover.
- Contains composite indexes for `categories` (`active ASC, sortOrder ASC`).

```bash
firebase deploy --only firestore:rules,firestore:indexes --project ganewa-provision-pos
```

---

## 3. Unified Categories Rollout Section

This section details the zero-downtime transition from legacy department/category strings to the shared `categories` collection and `categoryId` link.

### Step 7a: Initialize Approved Standard Categories
- Initialize the 14 approved standard categories in the shared `/categories` collection:
  1. `Beverages (Drinks & Water)`
  2. `Milk & Dairy Products`
  3. `Hot Drinks (Tea, Coffee & Cocoa)`
  4. `Grains, Noodles & Staples`
  5. `Seasonings, Condiments & Oil`
  6. `Snacks, Biscuits & Confectionery`
  7. `Soap & Detergent`
  8. `Personal Care (Hair, Skin & Oral)`
  9. `Baby Products & Hygiene`
  10. `Household & Insect Control`
  11. `Eggs & Poultry`
  12. `Baking Supplies`
  13. `Stationery`
  14. `Other / Miscellaneous`

### Step 7b: Run Migration Dry-Run (POS Admin or CLI)
- In POS Admin (`Settings -> Product Categories`) or via the emulator-only migration script:
  - Run the dry run to inspect every distinct category string across all products.
  - Verify approved mappings:
    - `General` $\to$ `Other / Miscellaneous`
    - `BISCUIT` $\to$ `Snacks, Biscuits & Confectionery`
    - `FLOUR` $\to$ `Grains, Noodles & Staples`
    - `VASELINE` $\to$ `Personal Care (Hair, Skin & Oral)`
  - Confirm target mapping for any unmapped values (e.g. `STELLA`).
  - Verify zero unmapped items are left unresolved.

### Step 7c: Execute Product Category Migration
- Ensure Firestore backup is taken first.
- **Permission & Security Notice**: The restriction that only `SUPER_ADMIN` can run the category migration is enforced strictly in application code (`executeUnifiedCategoriesMigration`), not in Firestore security rules. This is because Firestore rules permit both `ADMIN` and `SUPER_ADMIN` to perform product writes, and rules cannot distinguish between the two for product catalog fields.
- Execute `migrateUnifiedCategories(confirmed = true)`:
  - Migrates products in batches of $\le 500$ writes.
  - Sets `categoryId` (the source of truth) and normalizes display `category` name copy.
  - Safe to re-run (idempotent; skips products that already have matching `categoryId` and `category`).

### Step 8: Deploy PWAs (POS & E-commerce Storefront)
Build and deploy both frontends:

> **SEO Branch Integration & Firebase Hosting Redirect Limits**:
> Because a Single Page Application (SPA) running in the browser cannot emit real HTTP 301 status headers, historical SEO redirects must be baked into Firebase Hosting at build/deploy time.
> - **Firebase Hosting Redirect Limits**: Firebase Hosting enforces a maximum of **2,000 redirects** (or a max configuration file size limit of 100 KB for `firebase.json`). With 14-50 categories, typical old slug counts are far below this limit (< 100 entries).
> - **Direct Redirect Guarantee (No Redirect Chains)**: In our data model, when a category is renamed multiple times, all previous historical slugs are stored in a flat array (`oldSlugs: string[]`). Build-time redirects map every historical slug directly to the CURRENT canonical slug (`/category/:oldSlug` $\to$ `/category/:canonicalSlug`), preventing multiple HTTP redirect hops.
> - The build script queries active categories with non-empty `oldSlugs` and appends `redirects` entries into `firebase.json`:
> ```json
> {
>   "hosting": {
>     "redirects": [
>       {
>         "source": "/category/:oldSlug",
>         "destination": "/category/:canonicalSlug",
>         "type": 301
>       }
>     ]
>   }
> }
> ```
> - At runtime within the SPA, `resolveCategoryBySlug(slug, categories)` performs client-side fallback navigation (`navigate('/category/' + category.slug, { replace: true })`) if a route is visited directly without hitting the hosting redirect.

```bash
# POS
cd pos
npm run build
firebase deploy --only hosting:ganewa-provision-pos --project ganewa-provision-pos

# Storefront
cd ../ecommerce
npm run build
firebase deploy --only hosting:ganewamall-shop --project ganewa-provision-pos
```

### Step 9: Post-Deployment Smoke Tests & Verification
1. **POS Tests**:
   - Log in as cashier $\to$ verify unable to add/edit/delete categories in `Settings`.
   - Log in as admin $\to$ create a category, edit slug, reorder, and toggle visibility.
   - Verify category deletion is blocked if child subcategories or products still exist.
   - Verify products can be created and edited using the dynamic category dropdown (`categoryId` set).
2. **Storefront Tests**:
   - Verify anonymous visitor sees only active categories.
   - Verify clicking category filter filters products by `categoryId`.
   - Verify changing category active/name in POS reflects in storefront without redeploy.
   - Verify old slugs redirect cleanly via `oldSlugs` lookup.

### Step 10: Scrub Plaintext Passwords & Decommission Deprecated Rules
Once all clients are on the new release:
```bash
# Preview scrub
npx tsx src/admin/scrub-staff-passwords.ts --dry-run
# Perform final scrub
npx tsx src/admin/scrub-staff-passwords.ts --force
```
Remove deprecated `/departments` block from `pos/firestore.rules` after confirming zero traffic to departments.

---

## 4. Rollback Plan

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
