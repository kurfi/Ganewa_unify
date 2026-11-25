# Production Deployment & Hardening Release Checklist

This document is the direct-to-production release runbook for the hardened Ganewa Shopping Mall applications (`pos`, `ecommerce`, and `functions`) with unified product categories.

**Release Window**: Must happen **after closing time** when no tills are actively ringing up sales.

---

## 1. Before Go-Live (Mandatory Pre-Flight)

**Deployment must NOT proceed until every unticked box below is completed and ticked:**

- [ ] **Recover the store Gmail account** (`ganewashoppingmallkurfi@gmail.com`) and **enable 2-Step Verification** (and rotate the legacy `GanewaStore***` password found in pre-hardening git history).
- [ ] **Rotate or delete the shared Firebase Auth user** for the store account (`ganewashoppingmallkurfi@gmail.com`) at closing time, **after** per-staff logins are confirmed working.
- [ ] **Restrict the Firebase Web API key** in Google Cloud Console → APIs & Credentials (HTTP referrers):
  - `https://ganewa-provision-pos.web.app/*`
  - `https://ganewa-provision-pos.firebaseapp.com/*`
  - `https://ganewamall-shop.web.app/*`
  - `https://ganewamall-shop.firebaseapp.com/*`
- [ ] **Tighten the Cloudinary upload preset** (restrict allowed formats, max file size, and folder/unsigned upload scope).
- [ ] **Set a Google Cloud budget alert** on the `ganewa-provision-pos` billing account.
- [ ] **Run the legacy IndexedDB diagnostic** on every till to ensure no unsynced local data is stranded before cutover.
- [x] **Stock deliveries & write-offs policy (confirmed by owner)**: Only `ADMIN` and `SUPER_ADMIN` may receive stock (purchases) and perform stock write-offs. Cashiers cannot.
- [x] **Offline policy (confirmed by owner)**: When the internet drops, cashiers write the sale on paper and enter it into the POS afterwards.

---

## 2. Owner-Confirmed Operational Policies

### 2.1 Staff Logins & Forgotten Passwords
- **Username-only login**: Staff sign in with their username and password only. Internally, the POS maps `<username>` to `<username>@staff.ganewa.invalid` using the single shared constant `STAFF_EMAIL_SUFFIX` (`functions/src/constants/staffAuth.ts`). No staff email domain needs to be bought or owned.
- **Self-registration blocker**: `blockStaffDomainSelfSignup` (`beforeUserCreated`) rejects any public sign-up using `@staff.ganewa.invalid` or the store Gmail address.
  - **Identity Platform required**: `beforeUserCreated` blocking functions require Firebase Authentication with **Identity Platform** enabled. In Firebase Console → **Authentication** → **Settings** (or **Upgrade to Firebase Authentication with Identity Platform**), enable Identity Platform before deploying functions.
- **Forgotten staff passwords**: Because `@staff.ganewa.invalid` cannot receive emails, self-service password reset links do not work for staff.
  - When a staff member forgets their password, a `SUPER_ADMIN` calls the `setStaffPassword` Cloud Function (`{ targetUid, newPassword }`), which sets a new temporary password, revokes existing sessions, and enforces `mustChangePassword: true` so the staff member must choose a new personal password on next sign-in.
  - **Recommendation**: Always maintain **at least two `SUPER_ADMIN` accounts** so the store is never locked out if one super admin is unavailable or forgets their password.

### 2.2 Offline Policy (Plain-Language Staff Instruction)
> **What to do if the internet goes down:**
> 1. Do **not** ring up the sale on the till while offline.
> 2. Write the sale on a paper receipt book: **date and time**, **item names and quantities**, **unit prices and total**, **payment method (Cash / Transfer / POS)**, and the **paper receipt number**.
> 3. Give the customer their paper receipt.
> 4. As soon as the internet comes back, enter each paper sale into the POS right away so stock and daily totals stay accurate.

---

## 3. Direct-to-Production Release Procedure (After Closing Time)

Execute strictly in this order. **If any step fails, stop and run Section 4 (Rollback) immediately.**

### Step 1: Export Production Firestore to a Bucket
```bash
gcloud firestore export gs://<your-backup-bucket>/pre-hardening-backup-$(date +%Y%m%d-%H%M) --project=ganewa-provision-pos
```

### Step 2: Save Current Live Rules & Note Current Hosting Releases
Save a local copy of the currently deployed rules and record the active Hosting version/release IDs for both sites before deploying anything:
```bash
# 1. Save current live Firestore rules
firebase firestore:rules:get --project ganewa-provision-pos > live-firestore.rules.bak

# 2. Note the current live Hosting release/version ID for each site (write these down)
firebase hosting:channel:list --site ganewa-provision-pos --project ganewa-provision-pos
firebase hosting:releases:list --site ganewa-provision-pos --project ganewa-provision-pos
firebase hosting:releases:list --site ganewamall-shop --project ganewa-provision-pos
```

### Step 3: Deploy Cloud Functions
Ensure Identity Platform is enabled (see Section 2.1), then build and deploy functions:
```bash
cd functions
npm install
npm run build
firebase deploy --only functions --project ganewa-provision-pos
cd ..
```

### Step 4: Bootstrap Super Admin Accounts
Create at least **two** `SUPER_ADMIN` accounts (pass a username or full email; usernames automatically get `@staff.ganewa.invalid`):
```bash
cd functions
npx tsx src/admin/bootstrap-super-admin.ts primary_superadmin "StrongTempPass1!"
npx tsx src/admin/bootstrap-super-admin.ts backup_superadmin "StrongTempPass2!"
cd ..
```

### Step 5: Run Staff Migration (Dry-Run First) & Confirm Sign-Ins
```bash
cd functions
# 1. Dry-run first to verify username -> @staff.ganewa.invalid mapping
npx tsx src/admin/migrate-staff-accounts.ts --dry-run

# 2. Run migration
npx tsx src/admin/migrate-staff-accounts.ts
cd ..
```
- **Gate before continuing**: Confirm sign-in works for **1× SUPER_ADMIN**, **1× ADMIN**, and **1× CASHIER** before deploying the locked-down Firestore rules in Step 6.

### Step 6: Deploy Firestore Rules & Indexes
```bash
firebase deploy --only firestore:rules,firestore:indexes --project ganewa-provision-pos
```

### Step 7: Deploy Hosting for POS & Storefront
*(Includes unified categories; note that historical category SEO redirects are baked into `firebase.json` at build time for active categories with `oldSlugs`.)*
```bash
# POS
cd pos
npm run build
firebase deploy --only hosting:ganewa-provision-pos --project ganewa-provision-pos

# Storefront
cd ../ecommerce
npm run build
firebase deploy --only hosting:ganewamall-shop --project ganewa-provision-pos
cd ..
```

### Step 8: Post-Deployment Smoke Test
Verify all of the following before opening the store:
1. **Three sign-ins**: Sign in as `SUPER_ADMIN`, `ADMIN`, and `CASHIER` using username + password.
2. **Cash sale + receipt + drawer**: Complete a cash sale as `CASHIER`, confirm receipt prints and cash drawer opens.
3. **Return**: Process a test return and verify stock/refund behavior.
4. **Web order**: Place a test order on the storefront (`ganewamall-shop`) and verify it appears in POS Orders.
5. **Cost columns hidden**: Confirm `buyPrice` / `costPrice` / supplier columns are hidden from `CASHIER` in POS.

---

## 4. Immediate Rollback Commands

If **any** step fails, roll back immediately:

### Rollback Firestore Rules
```bash
firebase deploy --only firestore:rules --project ganewa-provision-pos --config <(echo '{"firestore":{"rules":"live-firestore.rules.bak"}}')
```
*(Or copy `live-firestore.rules.bak` over `pos/firestore.rules` and run `firebase deploy --only firestore:rules --project ganewa-provision-pos`.)*

### Rollback Hosting (POS & Storefront)
Use the previous release/version noted in Step 2:
```bash
# Roll back POS to previous release
firebase hosting:rollback ganewa-provision-pos --project ganewa-provision-pos

# Roll back Storefront to previous release
firebase hosting:rollback ganewamall-shop --project ganewa-provision-pos
```
*(Alternatively, in Firebase Console → Hosting → Release history, click **Rollback** on the noted release, or run `firebase hosting:clone <site>:<versionId> <site>:live --project ganewa-provision-pos`.)*

### Rollback Functions (if needed)
```bash
git checkout <previous-known-good-commit> -- functions/
cd functions && npm run build && firebase deploy --only functions --project ganewa-provision-pos
```

### Restore Firestore (Last Resort)
```bash
gcloud firestore import gs://<your-backup-bucket>/pre-hardening-backup-<timestamp> --project=ganewa-provision-pos
```

---

## 5. Deferred Post-Release Tasks (NOT Part of Release Night)

**Do NOT run these on release night.** Wait until the new release has run cleanly for **several days** in production:

1. **Cost-Field Migration (`privateData/financials`)** — only after all tills have run the new POS build cleanly for several days:
   - Create `settings/costFieldsMigration` with `{ codeSwitched: true }` in Firestore.
   - Dry-run: `npx tsx functions/src/admin/migrate-product-cost-fields.ts --dry-run`
   - Execute: `npx tsx functions/src/admin/migrate-product-cost-fields.ts --force`
2. **Plaintext-Password Scrub & Legacy `/departments` Cleanup** — only after every staff member has signed in and changed any temporary password:
   - Dry-run: `npx tsx functions/src/admin/scrub-staff-passwords.ts --dry-run`
   - Execute: `npx tsx functions/src/admin/scrub-staff-passwords.ts --force`
   - Remove deprecated `/departments` block from `pos/firestore.rules` after confirming zero traffic.
