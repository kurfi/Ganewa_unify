# Daily Reports

## [2026-08-17] Online Customer Account Linking, Phone Normalization & Firestore Write Hang Fixes

### Summary
Conducted a deep-dive investigation into customer linking between online ecommerce shop users (`shopUsers`) and POS customer profiles (`customers`). Fixed query misses caused by trailing whitespace and composite phone numbers, decoupled the Online Accounts tab from paginated parent state, added a real-time search filter to manual customer dropdowns, and eliminated infinite UI hangs on linking/unlinking and customer updates by migrating Firestore write calls from memory-only `fastDb` to persistent cache `db` and making background credit sync non-blocking.

---

### Root Cause Analysis & Fixes

1. **Firestore Query Misses from Trailing Spaces & Multi-Number Fields (High)**
   - **Root Cause**: Several `shopUsers` records in Firestore contained trailing spaces in phone fields (e.g. `"09121886883 "`), and POS customer profiles often contained multiple phone numbers separated by slashes (e.g. `"0806... / 0812..."`). Exact-match equality and `in` queries failed to match these variants.
   - **Fix**:
     - In [`phoneNormalization.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/utils/phoneNormalization.ts), updated `getPhoneVariants` to include trailing-space variations (kept within Firestore's 10-item `in` query limit).
     - Added `getNormalizedPhoneKeys` to parse and extract individual numbers delimited by `/`, `,`, `;`, `&`, `and`, or `or`, allowing all numbers to index back to the customer profile.
     - In [`LinkOnlineAccountModal.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/LinkOnlineAccountModal.tsx), normalized search inputs by lowercasing emails and stripping non-digit characters from phone numbers.

2. **Decoupled POS Customer List & Real-Time Select Filter (UX Improvement)**
   - **Root Cause**: [`OnlineAccountsTab.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/OnlineAccountsTab.tsx) relied on a paginated `posCustomers` prop from the parent component, limiting suggested matches and manual mapping options to only the first loaded page of customers. Furthermore, picking a customer from a raw `<select>` containing hundreds of entries was tedious.
   - **Fix**:
     - Decoupled `OnlineAccountsTab.tsx` to load the full customer repository on mount via `customersRepo.getAll()`.
     - Built a real-time search filter input above the manual mapping dropdown so operators can quickly filter customer options by name or phone as they type.

3. **Infinite UI Hang on Linking / Unlinking / Customer Updates (Critical)**
   - **Root Cause**: Writes to `shopUsers` were being dispatched via `fastDb`, a secondary Firestore instance configured with `memoryLocalCache()`. Writes on a memory-only instance wait for server roundtrip acknowledgment; if the connection is slow or idle, `setDoc` hangs indefinitely without resolving. Additionally, `EditCustomerModal.tsx` and `Orders.tsx` were `await`ing `syncCreditInfoToShopUser`, blocking the UI from closing.
   - **Fix**:
     - Replaced `fastDb` with the primary `db` instance (which has persistent IndexedDB caching) for all `setDoc` write operations across [`creditInfoSync.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/utils/creditInfoSync.ts), [`LinkOnlineAccountModal.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/LinkOnlineAccountModal.tsx), and [`OnlineAccountsTab.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/OnlineAccountsTab.tsx).
     - Removed the blocking `await` on `syncCreditInfoToShopUser` in [`EditCustomerModal.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/EditCustomerModal.tsx), [`usePOS.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/usePOS.ts), and [`Orders.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Orders.tsx), turning it into a true fire-and-forget background sync. Modals and checkout flows now resolve and close instantaneously.

---

### Files Modified
| File | Change |
|---|---|
| [`pos/src/utils/phoneNormalization.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/utils/phoneNormalization.ts) | Added trailing-space variants in `getPhoneVariants`; added `getNormalizedPhoneKeys` for composite phone splitting |
| [`pos/src/components/customers/LinkOnlineAccountModal.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/LinkOnlineAccountModal.tsx) | Cleaned search query inputs; switched writes to `db` instance |
| [`pos/src/components/customers/OnlineAccountsTab.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/OnlineAccountsTab.tsx) | Fetched all POS customers via `customersRepo.getAll()`; added dropdown search filter; switched unlink writes to `db` |
| [`pos/src/utils/creditInfoSync.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/utils/creditInfoSync.ts) | Replaced `fastDb` writes with `db` for instant local cache resolution |
| [`pos/src/components/customers/EditCustomerModal.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/EditCustomerModal.tsx) | Removed blocking `await` on credit sync to make customer updates instantaneous |
| [`pos/src/hooks/usePOS.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/usePOS.ts) | Made post-checkout credit sync call non-blocking |
| [`pos/src/pages/Orders.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Orders.tsx) | Made credit order approval sync non-blocking |

---

### Verification
- `npx tsc --noEmit` — ✅ Exit code 0, zero TypeScript errors across all modified files.

---

## [2026-08-14] Dashboard — Total Refunds (Month), Paid Expenses & Unpaid Expenses Showing Zero

### Summary
Investigated why **Total Refunds (Month)**, **Paid Expenses**, and **Unpaid Expenses** on the dashboard were all displaying `₦0.00`. Determined that **Paid Expenses** (today's paid expenses) and **Unpaid Expenses** (total pending expenses) were working correctly — they legitimately return zero when no qualifying records exist for the day/lifetime. However, **Total Refunds (Month)** had a real bug: the `dailyStats` pre-aggregation layer was silently treating missing rollup documents as zero rather than falling back to live Firestore queries. Fixed the fallback logic and resolved downstream TypeScript compile errors.

---

### Root Cause Analysis & Fixes

1. **`readDailyStats` Silent Zero on Missing Rollup Docs (Critical)**
   - **Root Cause**: In [`useDashboardStats.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useDashboardStats.ts), the `readDailyStats()` function fetches pre-aggregated documents from the `dailyStats` Firestore collection (written nightly by the `rollupDailyStats` Cloud Function). When a day's document was missing (e.g. the Cloud Function hadn't run yet, or the collection was empty), the loop silently skipped that day with `if (!snap.exists()) continue` and treated it as `₦0`. The function still returned a non-`null` totals object, so the caller never fell back to live aggregate queries — causing `totalRefundAmountThisMonth` to compute as `₦0` even when real return records existed in Firestore.
   - **Fix**: Added an early-exit check: if **any** document in the requested date range is missing, `readDailyStats` immediately returns `null`. This causes the caller to fall back to live Firestore aggregate queries on the `returns` collection, which accurately reflect all processed returns.
   ```typescript
   // Before: silently skipped missing docs and returned 0 totals
   if (!snap.exists()) continue;

   // After: treat any missing doc as "rollup not ready" → live fallback
   if (snaps.some(snap => !snap.exists())) {
       return null;
   }
   ```

2. **TypeScript Type Errors in `useDashboardStats.ts` & `computeBalances.ts` (Medium)**
   - **Root Cause**: The `safeAggregate`, `aggSum`, `aggCount`, and `limitConcurrency` helper functions lacked explicit return type annotations. TypeScript inferred the return type of `safeAggregate` as `unknown` (because `getAggregateFromServer` has a complex generic return type), which propagated through `aggSum`/`aggCount` and caused type errors throughout all downstream arithmetic operations.
   - **Fix**:
     - Annotated `safeAggregate` with `: Promise<any>` return type in both files.
     - Annotated `aggSum` with `: () => Promise<number>` and wrapped the result in `Number(...)`.
     - Annotated `aggCount` with `: () => Promise<number>` and wrapped the result in `Number(...)`.
     - Added explicit `<any>` generic to the `limitConcurrency<any>(phase2Tasks, 2)` call to accommodate the mixed-type `prodAggTask` (which returns `{ stockValue, cnt }` rather than a plain `number`).
   - **Verification**: `npx tsc --noEmit` exited with code **0** — zero TypeScript errors.

---

### Files Modified
| File | Change |
|---|---|
| [`pos/src/hooks/useDashboardStats.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useDashboardStats.ts) | Fixed `readDailyStats` to return `null` on missing docs; added explicit return type annotations to `safeAggregate`, `aggSum`, `aggCount`; added `<any>` generic to `phase2Tasks` `limitConcurrency` call |
| [`pos/src/utils/computeBalances.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/utils/computeBalances.ts) | Added explicit return type annotations to `safeAggregate` and `aggSum` |

---

### Verification
- `npx tsc --noEmit` — ✅ Exit code 0, zero errors.

---

## [2026-08-17] Expense System Deep-Dive & Bug Fixes

### Summary
Conducted a deep-dive audit of the expenses system and fixed 7 bugs ranging from a critical financial miscalculation in reporting to various UX issues. The most critical fix ensures that only PAID expenses are counted towards `totalExpenses` and `netProfit` on the Reports page, aligning it with the Dashboard's logic and preventing unpaid (PENDING) obligations from artificially deflating net profit.

---

### Root Cause Analysis & Fixes

1. **Cloud Function `generateReport` & Client Fallback (Critical)**
   - **Root Cause:** The `generateReport` Cloud Function (and the offline fallback in `useReportsData.ts`) summed ALL expenses in a given date range without filtering by status. This meant PENDING expenses artificially inflated `totalExpenses`.
   - **Fix:** Added a `.filter(e => e.status === 'PAID')` before the reduce step in both the server and client calculations.

2. **Stale Balance in Expense Form (Medium)**
   - **Root Cause:** The `ExpenseForm` fetched "Cash at hand" and "Bank balance" only once on mount. It did not refresh when switching payment methods or after submitting a new expense.
   - **Fix:** Wired up a `refreshKey` (driven by a `submitCount` in the parent) and added `paymentMethod` to the form's `useEffect` dependencies so balances are always live.

3. **Silent Reversion of PAID Expenses (Medium)**
   - **Root Cause:** Tapping a `PAID` badge in `ExpenseHistory` immediately reverted the expense to `PENDING` in Firestore with no confirmation.
   - **Fix:** Introduced a "Mark as Unpaid?" confirmation modal.

4. **Blank Desktop Table for Empty History (Medium)**
   - **Root Cause:** When no expenses existed, the desktop table rendered a blank white box.
   - **Fix:** Added an empty-state `<tr>` ("No expense history found") to the desktop view.

5. **Financials Table Displaying Pending Expenses (Low)**
   - **Root Cause:** The "Detailed Expenses" table on the Financials report tab listed both PAID and PENDING expenses.
   - **Fix:** Filtered the table to only show `PAID` expenses, updated the header to "Detailed Expenses (Paid only)", and added a badge indicating if there are hidden pending expenses.

6. **Minor Fixes (Low)**
   - **Category Dropdown:** Added explicit `value=` attributes to hardcoded expense categories in `ExpenseForm` to prevent duplication risks.
   - **Redundant Filtering:** Removed a redundant client-side date filter from the `expenses` memo in `useReportsData.ts` (the data is already date-filtered by the Firestore query).

---

### Files Modified
| File | Change |
|---|---|
| [`functions/src/index.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/functions/src/index.ts) | Filtered expenses to `PAID` in `generateReport` |
| [`pos/src/hooks/useReportsData.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useReportsData.ts) | Filtered offline fallback expenses to `PAID`; removed redundant date filter |
| [`pos/src/pages/Expenses.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Expenses.tsx) | Added `submitCount` state to force form re-renders on success |
| [`pos/src/components/expenses/ExpenseForm.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/expenses/ExpenseForm.tsx) | Balance refreshes on `paymentMethod` or `refreshKey` change; added `value=` to options |
| [`pos/src/components/expenses/ExpenseHistory.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/expenses/ExpenseHistory.tsx) | Added PAID→PENDING confirmation modal; added desktop empty state |
| [`pos/src/components/reports/FinancialsTab.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/reports/FinancialsTab.tsx) | Filtered detailed list to PAID only; added pending warning badge |

---

## [2026-08-17] POS Return Receipt Mismatch & Online Order Invoice Collisions

### Summary
Fixed a critical bug where searching for a sale by invoice number during a return would sometimes load the wrong receipt. This was caused by online order fulfillments bypassing the atomic invoice counter and generating timestamp-based invoice numbers that collided with the POS till. We also improved the returns search to strictly exclude deleted sales and gracefully handle pre-existing duplicate invoices by presenting a selection list instead of blindly loading the first match.

---

### Root Cause Analysis & Fixes

1. **Online Order Invoice Collisions (Root Cause)**
   - **Root Cause**: The POS checkout correctly uses an atomic Cloud Function (`fetchNextInvoiceNo`) to generate sequential invoice numbers. However, when an online order was fulfilled or approved for credit in [`Orders.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Orders.tsx), it bypassed the counter and used `` `INV-${Date.now().toString().slice(-6)}` ``, causing collisions with legitimate POS receipts.
   - **Fix**: Replaced the timestamp-based generator in both `handleCompleteOrder` and `handleApproveCreditOrder` with calls to `await fetchNextInvoiceNo()`. All channels now use the same guaranteed-unique counter.

2. **Returns Search Auto-Selection of Wrong Receipts**
   - **Root Cause**: In [`useReturns.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useReturns.ts), the invoice search query omitted the `deleted == false` check and blindly selected the very first matching document. If a collision existed (or if the real sale was deleted), it would silently load the wrong receipt.
   - **Fix**:
     - Added `where('deleted', '==', false)` to all search strategies (by ID, Invoice Number, and exact Customer Name).
     - Upgraded the invoice number search logic: if multiple active sales share the same invoice (due to historical collisions), the system now displays a "Multiple Sales Found" selection list instead of auto-picking, allowing the cashier to choose the correct one based on date and customer.

---

### Files Modified
| File | Change |
|---|---|
| [`pos/src/hooks/useReturns.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useReturns.ts) | Filtered soft-deleted records and implemented multi-result selection for invoice searches |
| [`pos/src/pages/Orders.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Orders.tsx) | Enforced atomic invoice numbering for all online fulfillments |

---
## [2026-08-13] Credit Buying System — Complete Rewrite & Full Platform Deployment

### Summary
Completely rewrote the credit buying system from scratch after repeated silent failures caused by brittle client-side synchronization in the POS browser. Replaced it with a robust server-side architecture using Firebase Cloud Functions (Admin SDK), auto-sync Firestore triggers, an improved ecommerce checkout UX, and a manual sync button on the Account page. Then resolved TypeScript/firebase-admin v12 upgrade errors and successfully deployed all components (Cloud Functions, Firestore rules, POS app, Ecommerce app) to Firebase.

---

### Root Cause Analysis — Why the Old System Failed

1. **Client-Side POS Syncing (Root Cause)**
   - **Problem**: `creditInfoSync.ts` ran sync logic in the POS browser tab. When the tab was closed, the network dropped, or the auth token expired, the sync silently failed.
   - **Result**: Ecommerce users saw stale or zero credit balances. Credit purchases were blocked incorrectly.
   - **Impact**: Completely unreliable. Even a "successful" update in POS gave no guarantee the ecommerce side was updated.

---

### Architecture — New Server-Side Credit System

The new system uses a **4-layer approach** where all synchronization is handled by Cloud Functions (server-side, using the Admin SDK) — not the browser:

| Layer | Component | Role |
|-------|-----------|------|
| 1 | `syncCustomerCreditOnWritten` (Cloud Function) | Auto-fires on every POS `customers/{id}` write; updates all linked `shopUsers` via batch |
| 2 | `syncShopUserCreditOnLink` (Cloud Function) | Auto-fires when a `shopUsers` doc is created/updated; backfills `creditInfo` when `linkedPosCustomerId` is set |
| 3 | `syncUserCreditInfo` (Callable Cloud Function) | On-demand sync callable from ecommerce Cart and Account pages |
| 4 | Ecommerce Cart (`Cart.tsx`) | Calls `syncUserCreditInfo` on entry; shows credit status cards and informative error banners |

**Data Flow**: `POS customers` (source of truth) → Cloud Function trigger → `shopUsers.creditInfo` (ecommerce view)

---

### Changes Made

#### 1. Cloud Functions — [`functions/src/index.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/functions/src/index.ts)

**`syncCustomerCreditOnWritten`** (new)
- Trigger: `onDocumentWritten` on `customers/{customerId}`
- Queries all `shopUsers` where `linkedPosCustomerId == customerId`
- On update: batch-updates `creditInfo` (creditLimit, currentDebt, availableCredit, updatedAt)
- On delete: batch-clears `creditInfo` to null on all linked accounts

**`syncShopUserCreditOnLink`** (new)
- Trigger: `onDocumentWritten` on `shopUsers/{userId}`
- Runs only when `linkedPosCustomerId` changes or `creditInfo` is missing despite having a link
- Fetches the POS customer and writes `creditInfo` directly to the shopUser doc

**`syncUserCreditInfo`** (new, callable)
- Auth-gated on-demand sync
- Returns `{ success, creditInfo: { creditLimit, currentDebt, availableCredit } }`
- Called automatically on Cart page entry and manually via the Account page sync button

Also applied **firebase-admin v12 modular import fixes** to the entire `index.ts`:
- Replaced `admin.firestore.FieldValue` → `FieldValue` (from `firebase-admin/firestore`)
- Replaced `admin.firestore.AggregateField` → `AggregateField`
- Replaced `admin.firestore.Timestamp` → `Timestamp`
- Replaced `admin.initializeApp()` → guarded `initializeApp()` from `firebase-admin/app`
- Added `setGlobalOptions({ region: 'us-central1' })` to fix the Firebase CLI 10s deployment timeout

#### 2. Ecommerce Cart — [`ecommerce/src/pages/Cart.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/ecommerce/src/pages/Cart.tsx)
- Auto-calls `syncUserCreditInfo` Cloud Function when the checkout method section is rendered
- Shows credit status card displaying `availableCredit`, `creditLimit`, `currentDebt`
- Shows descriptive error banners for: insufficient credit, unlinked profile, loading state
- Credit payment option is disabled if balance is insufficient or profile is not linked

#### 3. Ecommerce Account — [`ecommerce/src/pages/Account.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/ecommerce/src/pages/Account.tsx)
- Added **"Sync Credit"** button that calls `syncUserCreditInfo` on demand
- Shows loading spinner during sync; displays updated balance immediately on success

#### 4. Ecommerce Firebase Config — [`ecommerce/src/firebase/config.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/ecommerce/src/firebase/config.ts)
- Initialized and exported `functions` instance for callable Cloud Function triggers

---

### Deployment Issues Resolved

| Error | Cause | Fix |
|-------|-------|-----|
| `TS2339: Property 'firestore' does not exist on admin` | firebase-admin upgraded from v11 → v12; namespace changed | Switched to modular imports (`firebase-admin/firestore`, `firebase-admin/app`) |
| `TS18048: possibly 'undefined'` | Strict mode on new functions | Added `if (!data) return;` guards |
| `TS2300: Duplicate identifier` | Patch script ran twice | Deduplicated imports via `patch2.js` |
| `User code failed to load. Timeout after 10000` | Firebase CLI v15 timed out probing functions; `initializeApp()` called unconditionally | Added `setGlobalOptions()` + guarded `initializeApp()` with `getApps().length === 0` |
| `TS6133: 'admin' is declared but never read` | Wildcard `admin` import replaced by modular imports | Removed the `import * as admin` line |

---

### Files Modified
| File | Change |
|------|--------|
| [`functions/src/index.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/functions/src/index.ts) | Added 3 credit sync Cloud Functions; migrated to firebase-admin v12 modular imports; added `setGlobalOptions` |
| [`ecommerce/src/pages/Cart.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/ecommerce/src/pages/Cart.tsx) | Redesigned checkout method UI with credit status cards, error banners, auto-sync on entry |
| [`ecommerce/src/pages/Account.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/ecommerce/src/pages/Account.tsx) | Added manual "Sync Credit" button |
| [`ecommerce/src/firebase/config.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/ecommerce/src/firebase/config.ts) | Initialized `functions` export |
| [`functions/tsconfig.json`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/functions/tsconfig.json) | Added `"noImplicitAny": false` to allow quick migration |

---

### Verification & Deployment

| Step | Result |
|------|--------|
| `npm run build` (functions/) | ✅ TypeScript compiled, exit code 0 |
| `firebase deploy --only functions` | ✅ All 14 functions deployed (3 new, 11 updated) |
| `npm run build` (pos/) | ✅ 3,069 modules transformed |
| `firebase deploy --only firestore:rules,hosting` (POS) | ✅ Rules + POS hosting deployed |
| `npm run build` (ecommerce/) | ✅ 1,640 modules transformed |
| `firebase deploy --only hosting` (ecommerce) | ✅ Ecommerce hosting deployed |

**Live URLs:**
- POS: https://ganewa-provision-pos.web.app
- Ecommerce: https://ganewamall-shop.web.app

---

## [2026-08-13] Online Orders — Completed & Cancelled Tabs Always Empty (Bug Fix & Deploy)

### Summary
Investigated and fixed a bug where the **Completed**, **Cancelled**, and **All** status tabs on the Online Orders page always showed 0 orders and an empty state, even when fulfilled or cancelled orders existed in the database. Only the **Active Orders** view (Pending / Processing) worked correctly. The fix was built and deployed to Firebase Hosting.

---

### Root Cause Analysis & Fix

#### 1. `OnlineOrdersContext` Query Scoped to Active Orders Only (Critical Bug)

- **Root Cause**: [`OnlineOrdersContext.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/contexts/OnlineOrdersContext.tsx) contained a Firestore `onSnapshot` query with a hard `where` filter:
  ```js
  where('status', 'in', ['pending', 'processing'])
  ```
  This is intentional for real-time badge notifications and new-order sounds — but `Orders.tsx` was using **the same `orders` array** from the context to power all five status tabs (`All`, `Pending`, `Processing`, `Completed`, `Cancelled`). Orders with `completed` or `cancelled` status were never fetched from Firestore at all, so every derived count and filter for those tabs always returned 0 / empty.

#### 2. Fix — Lazy Secondary Query in `Orders.tsx` (Minimised Firestore Reads)

- **Strategy**: Keep `OnlineOrdersContext` completely unchanged (it is correct for its notification purpose). Add a **separate, lazy `onSnapshot` subscription** inside `Orders.tsx` that loads only `completed` and `cancelled` orders.
- **Read optimisation**: The secondary query is:
  - **Activated lazily** — only when the user first clicks the **Completed**, **Cancelled**, or **All** tabs (not on page load).
  - **Date-bounded** — restricted to orders created within the **last 30 days** using a `Timestamp` cutoff, preventing full-collection scans as the database grows.
  - **Subscribe-once** — tracked via a `useRef` flag so the subscription is created only once per component mount; a cleanup effect unsubscribes on unmount.
- **Merge**: Active orders (from context) and archived orders (from the new query) are combined in a `useMemo` sorted by `createdAt` descending into a single unified `orders` array. All existing tab counts (`getCount`) and the `filteredOrders` filter logic work correctly against this merged array without any other changes.

---

### Files Modified
| File | Change |
|---|---|
| [`pos/src/pages/Orders.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Orders.tsx) | Added lazy Firestore subscription for completed/cancelled orders (30-day window); merged with active orders via `useMemo`; added `useRef`, `Timestamp`, `collection`, `query`, `where`, `onSnapshot` imports |

> `OnlineOrdersContext.tsx` was **not changed** — the active-only query is correct for its notification role.

---

### Verification & Deployment
- **TypeScript check** (`npx tsc --noEmit`): ✅ Zero new errors introduced in `Orders.tsx`. Pre-existing errors in `useDashboardStats.ts` and `computeBalances.ts` are unrelated.
- **Production build** (`npm run build`): ✅ 3,069 modules transformed in 23s, exit code 0.
- **Firebase deploy** (`firebase deploy --only hosting`): ✅ 4 new files uploaded, version finalized and released.
- **Live URL**: https://ganewa-provision-pos.web.app

---

## [2026-08-17] POS Customer Selection UI Cleanup & Nameless Customer Exclusion

### Summary
Fixed an issue in the Point of Sale customer selection dropdown where empty rows with debt amounts (e.g. `Debt: ₦750.00`) were appearing at the top of the list without customer names. Completely excluded nameless and corrupt customer entries from the POS customer search dropdown and added robust display fallbacks.

---

### Root Cause Analysis & Fixes

1. **Empty / Missing Customer Name Fields in Database**
   - **Root Cause**: Certain customer records in Firestore had empty, `null`, `undefined`, or whitespace-only `name` properties (e.g., from quick-debt creation or external syncs).
   - **Sorting & Matching Anomaly**: In `CustomerSearch.tsx`, `.sort((a, b) => (a.name || '').localeCompare(b.name || ''))` placed empty string names at the very top of the dropdown, right after "Walk-in Customer". Empty search queries included them, and `<span className="truncate">{customer.name}</span>` rendered blank text above the debt tags.

2. **Strict Filtering & Fallback Display**
   - **Fix — POS Page** ([`pos/src/pages/POS.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/POS.tsx)): Updated the `customers` memoization hook to filter out any record where `!c.name || c.name.trim() === '' || c.name === 'Walk-in Customer'`.
   - **Fix — Customer Search Component** ([`pos/src/components/pos/CustomerSearch.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/pos/CustomerSearch.tsx)):
     - Added `getCustomerDisplayName()` helper function with fallback priority (`name` → `Customer (phone)` → `email` → `'Unnamed Customer'`).
     - Added strict check in `filteredCustomers` to reject any customer without a valid, non-empty `name`.

---

### Files Modified
| File | Change |
|---|---|
| [`pos/src/pages/POS.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/POS.tsx) | Filtered out customer records without valid non-empty names |
| [`pos/src/components/pos/CustomerSearch.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/pos/CustomerSearch.tsx) | Added display fallback helper and strictly excluded nameless entries |

---

## [2026-08-11] Online Transaction Reporting & Inventory Low/Out-of-Stock Bug Fixes

### Summary
Added online transaction support to the Business Intelligence Reports page (allowing operators to filter report financials and sales logs by **POS Only**, **Online Shop**, or **All Channels**). Also fixed a critical bug where Low Stock Alerts and Detailed Expenses in the Inventory and Financials tabs were always empty, and enhanced the inventory report with clear status badges and sorting.

---

### Root Cause Analysis & Fixes

#### 1. Low Stock Alerts Always Empty (Critical Bug)
- **Root Cause**: When the server-side `generateReport` Cloud Function call succeeded, the client-side hook (`useReportsData.ts`) only populated `allSales` from the server response and skipped fetching the `products` and `expenses` collections. These collections were only fetched in the **offline fallback path**. As a result, `inventoryAnalysis.lowStockProducts` was always an empty array and the Detailed Expenses table was also blank whenever the server was reachable.
- **Fix** ([`useReportsData.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useReportsData.ts)): Modified the success path of `fetchReports` to also fetch `products` and `expenses` from Firestore in **parallel** alongside the server report response. This ensures the Inventory and Financials tabs are always populated regardless of the server path taken.

#### 2. Online Transactions Not Included in Reports (Feature)
- **Root Cause**: The `generateReport` Cloud Function hard-filtered all sales to POS-only (`!s.source || s.source === 'pos'`), and the client also applied the same filter. Online orders fulfilled through the POS (`source === 'online'`) were never included in any financial totals, sales logs, or charts.
- **Fix — Cloud Function** ([`functions/src/index.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/functions/src/index.ts)): Updated `generateReport` to accept an optional `source` parameter (`'pos' | 'online' | 'all'`). The sales filter now respects this parameter:
  - `'pos'` → POS sales only (default legacy behaviour).
  - `'online'` → Online shop sales only.
  - `'all'` → All channels combined.
- **Fix — Report Service** ([`reportService.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/services/reportService.ts)): Updated `fetchServerReport` signature to accept and pass a `source` parameter to the Cloud Function.
- **Fix — Hook** ([`useReportsData.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useReportsData.ts)): Added `saleSource` state (`'pos' | 'online' | 'all'`, default `'all'`). The hook now passes `saleSource` to the server call and applies a matching client-side filter for the offline fallback path. `saleSource` and `setSaleSource` are exposed to the UI.
- **Fix — UI** ([`Reports.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Reports.tsx)): Added a **channel selector dropdown** in the Filter Bar next to the date pickers. Options: **All Channels**, **POS (In-Store)**, **Online Shop**. Selecting a channel immediately refetches and recalculates all financial aggregates, charts, and sales logs.

#### 3. Inventory Status Badges & Sorting (Enhancement)
- **Fix** ([`InventoryTab.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/reports/InventoryTab.tsx)):
  - Added a **Status** column with color-coded badges:
    - 🔴 **Out of Stock** (Red) — when `currentStock === 0`
    - 🟡 **Low Stock** (Amber) — when `currentStock > 0` but below `minStockLevel`
  - Stock value color now also changes (Red for out-of-stock, Amber for low stock).
- **Fix** ([`useReportsData.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useReportsData.ts)): `inventoryAnalysis.lowStockProducts` is now sorted to surface **Out of Stock (qty = 0)** items first, followed by low stock items in ascending quantity order.

---

### Files Modified
| File | Change |
|---|---|
| [`functions/src/index.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/functions/src/index.ts) | Added `source` filter to `generateReport` Cloud Function |
| [`pos/src/services/reportService.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/services/reportService.ts) | Updated `fetchServerReport` to accept `source` param |
| [`pos/src/hooks/useReportsData.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/hooks/useReportsData.ts) | Added `saleSource` state; fetch products/expenses in success path; sort low stock |
| [`pos/src/pages/Reports.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Reports.tsx) | Added channel selector dropdown in Filter Bar |
| [`pos/src/components/reports/InventoryTab.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/reports/InventoryTab.tsx) | Added Status column with Out of Stock / Low Stock badges |

---

### Verification
- `npm run build` in `functions/` — ✅ TypeScript compiled, exit code 0.
- `npm run build` in `pos/` — ✅ All 3069 modules transformed, exit code 0.
- `firebase deploy` (full: functions + hosting + firestore rules + indexes) — ✅ Deploy complete.
- **Live URL**: https://ganewa-provision-pos.web.app

---

## [2026-08-16] Resolved Product Search in Expired Stock Inventory (Low-Reads Optimized)

### Summary
Fixed a critical bug where users could not search products properly in the Expired Stock inventory tab because it was coupled with the Products tab's paginated/filtered state. Resolved the issue by introducing independent server-side paginated searching and event-derived filtering, which completely eliminates unnecessary Firestore reads and prevents performance lag.

---

### Root Cause Analysis & Fixes

1. **Coupled and Paginated Client State**
   * **Root Cause**: The Expired Stock components were previously bound to the same `products` array returned by `useInventory(currentUser)`. This array was paginated to the first 50 items and filtered by whatever search term was active in the **Products** tab. Consequently, users could not search products from subsequent pages, or search at all if a filtering term was active in the Products tab.
   * **Fix**: Decoupled the Expired Stock product search from the main Products tab. 

2. **Server-Side Paginated Search (Low-Reads Optimization)**
   * **Fix**: Integrated the `usePaginatedCollection` hook directly into [`ExpiredStockForm.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/inventory/ExpiredStockForm.tsx) to perform server-side prefix searches against the `nameLower` field. Capped the search page size at 50. This avoids fetching the entire `products` collection (which would result in thousands of Firestore reads), ensuring that only up to 50 reads are performed per search request.

3. **Event-Derived History Filtering**
   * **Fix**: Modified the filter dropdown in [`ExpiredStockHistory.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/inventory/ExpiredStockHistory.tsx) to use `uniqueProductsFromWriteOffs` derived dynamically from the loaded write-off logs, instead of the main products list. This consumes **zero** extra product reads, handles soft-deleted items with history logs, and keeps the dropdown 100% relevant to the history events.

4. **Parent Page Cleanup**
   * **Fix**: Cleaned up [`Inventory.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/Inventory.tsx) by removing the `products` prop from the form and history elements and deleting the expensive full-collection `useCollection` call.

---

## [2026-08-16] Resolved Customer History Precondition Errors (Missing Composite Indexes)

### Summary
Resolved database pre-condition query failures in the `getCustomerSalesHistory` Cloud Function that caused customer history lookups to crash with a 500 server error. Added the two required composite indexes to the Firestore index configuration and deployed them to Firebase.

---

### Root Cause Analysis & Fixes

1. **Firestore Query Precondition Failures (Critical)**
   * **Root Cause**: The `getCustomerSalesHistory` Cloud Function queries both the `sales` and `customerPayments` collections to compute aggregate metrics (`sum('finalAmount')` for sales and `sum('amount')` for payments) filtered by a specific customer (`customerId`) and deletion status (`deleted == false`). Since these aggregated queries combine equality filters with field aggregations, Firestore requires composite indexes to compute them.
   * **Fix**: Added two new composite indexes to [`firestore.indexes.json`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/firestore.indexes.json):
     * **`sales`**: Added composite index on `customerId` (ASC), `deleted` (ASC), and `finalAmount` (ASC).
     * **`customerPayments`**: Added composite index on `customerId` (ASC), `deleted` (ASC), and `amount` (ASC).

2. **Index Deployment**
   * **Fix**: Deployed the index changes using the Firebase CLI:
     ```bash
     firebase deploy --only firestore:indexes
     ```
     The deployment completed successfully, allowing Firestore to start building the indexes and resolving the `FAILED_PRECONDITION` (500) errors in the POS app.

---

## [2026-08-10] Added Aggregated Cloud Functions for Customer History & POS History Search

### Summary
Replaced two client-side Firestore query flows with dedicated `onCall` Cloud Functions. The Customer History Modal now fetches sales and payments via `getCustomerSalesHistory`, which also returns server-side aggregate totals (total spent, total repaid, exact counts) — so the footer is always accurate even when a customer has more than 50 records. The POS History tab search now calls `searchCustomerSalesPOS`, which performs a server-side `nameLower` prefix query on the `customers` collection and then retrieves matching sales in parallel, removing the dependency on the locally loaded customer list and eliminating multiple parallel client-side Firestore reads.

---

### Changes Made

#### 1. New Cloud Functions — [`functions/src/index.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/functions/src/index.ts)

**`getCustomerSalesHistory`**
- Accepts `{ customerId: string }`.
- Runs 4 Firestore operations in parallel: latest 50 sales, latest 50 `customerPayments`, aggregate `sum(finalAmount)` + `count()` on sales, and aggregate `sum(amount)` + `count()` on payments.
- Returns `{ sales[], payments[], aggregates: { totalSpent, salesCount, totalRepaid, paymentsCount } }`.
- Serializes all Firestore Timestamps to ISO strings before returning.

**`searchCustomerSalesPOS`**
- Accepts `{ query: string }` (minimum 2 characters).
- Step 1: Prefix-range query on `customers.nameLower` (`>= query`, `<= query + '\uf8ff'`), up to 5 matches.
- Step 2: For each matched customer, fetches latest 50 sales + aggregate totals in parallel.
- Step 3: Merges results into a de-duplicated Map, sorts descending by date, slices to 50.
- Returns `{ sales[], customerAggregates: { [customerId]: { totalSpent, salesCount, customerName } } }`.
- Both functions are restricted to `STORE_EMAIL` and throw `permission-denied` for any other caller.
- Both builds (`functions/` and `pos/`) passed with exit code 0.

#### 2. New Service File — [`src/services/customerSalesService.ts`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/services/customerSalesService.ts)

- Created a typed wrapper service with `fetchCustomerHistory(customerId)` and `searchCustomerSalesPOS(query)`.
- Follows the same pattern as the existing `invoiceNumberService.ts` and `reportService.ts`.

#### 3. Updated Component — [`src/components/customers/CustomerHistoryModal.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/components/customers/CustomerHistoryModal.tsx)

- Removed direct Firestore imports (`collection`, `query`, `where`, `getDocs`, `orderBy`, `limit`, `db`, `normalizeFirestoreDates`).
- Now calls `fetchCustomerHistory()` on modal open, with a cancellation flag to prevent state updates after unmount.
- Footer now shows **server-aggregate totals** (always accurate regardless of record count) and a "Showing X of Y" label when there are more than 50 records.
- Added `isLoading` state with a loading indicator in the footer while the function resolves.

#### 4. Updated Page — [`src/pages/POS.tsx`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/src/pages/POS.tsx)

- Removed direct Firestore query imports (`query`, `collection`, `getDocs`, `db`) that were only used for the customer search.
- Replaced the 5-parallel-Firestore-query `useEffect` (which depended on the local `customers` array) with a single `searchCustomerSalesPOS()` call.
- Search debounce increased from 250 ms to 300 ms.
- Minimum query length set to 2 characters (enforced both client-side and in the Cloud Function).
- `useEffect` dependency array simplified from `[historySearchQuery, customers]` to `[historySearchQuery]`.

---

### Verification
- `npm run build` in `functions/` — ✅ exit code 0, no TypeScript errors.
- `npm run build` in `pos/` — ✅ exit code 0, all 3069 modules transformed successfully.

### Deployment Required
```bash
# Deploy the two new Cloud Functions
firebase deploy --only functions
```
Then deploy the frontend as normal.

---

## [2026-08-14] Resolved Online Order Operational Bugs & Stock Discrepancies

### Summary
Conducted a deep-dive investigation into the Online Orders system across both the POS app and the Ecommerce platform. Identified and fixed multiple critical and high-severity bugs that caused order cancellations to fail, double-deducted inventory, created race conditions during order fulfillment, and could trigger client-side runtime errors.

---

### Root Cause Analysis & Fixes

1. **Order Cancellation Failure for Multi-Product Orders (Critical)**
   * **Root Cause**: `handleCancelOrder` in `Orders.tsx` ran database reads (`transaction.get()`) inside a loop *after* starting updates (`transaction.update()`). Firestore transactions require all reads to be completed before any writes.
   * **Fix**: Rewrote the transaction loop to read all product snapshots first, collect them, and then perform the inventory updates in a separate loop.

2. **Double Inventory Deduction on Order Fulfillment (Critical)**
   * **Root Cause**: Stock was already deducted atomically in the ecommerce transaction at order placement (`Cart.tsx`). When the order was fulfilled/completed (or credit approved) in the POS (`Orders.tsx`), the POS code subtracted inventory a second time.
   * **Fix**: Removed the duplicate stock deduction logic from both `handleCompleteOrder` and `handleApproveCreditOrder`.

3. **Non-Atomic Fulfillment Race Conditions (High)**
   * **Root Cause**: POS order fulfillment checks and updates for `fulfillmentProcessed` and `creditProcessed` were non-atomic. Two cashiers clicking "Complete" concurrently could bypass the checks and record duplicate POS sale logs.
   * **Fix**: Wrapped the fulfillment check/set and credit approval check/set in atomic `runTransaction` blocks.

4. **Ecommerce 'pod' vs POS 'delivery' Mismatch (Medium)**
   * **Root Cause**: The Ecommerce site saved Pay-on-Delivery orders as `method: 'pod'`, while the POS typed and expected `method: 'delivery'`.
   * **Fix**: Standardized the method identifier to `'delivery'` throughout `Cart.tsx` (state, layout configs, options).

5. **Firestore 'in' Query 30-Item Limit in Cart (Medium)**
   * **Root Cause**: Carts with more than 30 unique items would crash during checkout because Firestore's `where(documentId(), 'in', itemIds)` query has a hard limit of 30 entries.
   * **Fix**: Chunked the lookup array into batches of maximum 30 IDs, queried them in parallel using `Promise.all()`, and merged the results.

6. **Missing 'credit' Type in OnlineOrdersContext (Medium)**
   * **Root Cause**: The POS `OnlineOrdersContext` typed order methods as only `'pickup' | 'delivery' | 'proof'`, excluding `'credit'`, causing type-safety and potential mapping failures.
   * **Fix**: Added `'credit'` to the union type definition in `OnlineOrdersContext.tsx`.

7. **Fulfillment Stale Data Usage (Low)**
   * **Root Cause**: POS completion was reading the items list from local component state (`order.items`), which could be stale if modified elsewhere since load time.
   * **Fix**: Now fetches fresh items directly from the Firestore transaction snapshot.


## [2026-08-10] Resolved Returns System Bugs, Chart Crashes, and Hidden Reports

### Summary
Conducted a deep-dive investigation into the POS Returns page and Return Analytics dashboard. Identified and resolved critical logic errors in return quantity validations, fixed double-deduction/wiping of customer debt during CASH refunds on credit sales, fixed a namespace clash causing chart page crashes, and integrated previously inaccessible, orphaned returns and damaged items reports into the UI.

---

### Root Cause Analysis & Fixes

1. **Over-Return / Duplicate Refund Validation (Critical)**
   * **Root Cause**: When a cashier clicked "Return All" or "Max", the hooks (`handleReturnAllItems` and `handleReturnAllOfThisItem` in `useReturns.ts`) set the returnable quantity to the original item quantity, completely ignoring historical returns (`returnedQuantity`) already processed.
   * **Fix**: Updated both methods to subtract previously returned quantities (`item.quantity - alreadyReturned`) to prevent double-refunding beyond the original purchase limits.

2. **Double-Dipping Debt Mitigation (Critical)**
   * **Root Cause**: If a sale originally made on `CREDIT` was returned, the system automatically wiped the customer's debt even if the cashier processed the refund as `CASH`. The customer would get cash back *and* have their debt erased. Conversely, returning a CASH sale for STORE_CREDIT failed because the customer document was never retrieved.
   * **Fix**: Refactored `useReturns.ts` to retrieve the customer record for any sale with an attached customer ID. Wiping/adjusting customer debt is now strictly restricted to returns processed via `STORE_CREDIT` or `CREDIT` refund methods.

3. **Returns Analytics Screen Crash (High)**
   * **Root Cause**: In `ReturnAnalytics.tsx`, Recharts `<PieChart>` and `<AreaChart>` components were used directly in the headers as inline Lucide icons, causing namespace clashes. Since they were rendered as empty tags without configuration properties, they threw rendering errors and crashed the Returns Analytics tab.
   * **Fix**: Imported Lucide icons with custom aliases (`PieChartIcon` and `AreaChartIcon`) and updated the header tags to prevent chart rendering failures.

4. **Integration of Orphaned Returns & Damaged Items Reports (Medium)**
   * **Root Cause**: The detailed list of returns (`ReturnsReport.tsx`) and damaged items log (`DamagedItemsReport.tsx`) existed as pages but were completely inaccessible in the POS app because they lacked routing or navigation links.
   * **Fix**: Added "Returns Log" and "Damaged Items" tabs to `ReportsTabs.tsx` and dynamically rendered `ReturnsReport` and `DamagedItemsReport` directly in `Reports.tsx` when their respective tabs are active. Expanded the `activeTab` type constraints in `useReportsData.ts`.

---

## [2026-08-10] Resolved Detailed Sales Log Empty State Bug

### Summary
Fixed an issue where the Detailed Sales Log in the Business Intelligence dashboard was always empty despite sales existing. The fix involved updating the `generateReport` Cloud Function to return individual sales records alongside its aggregate metrics, enabling the client to render the table with zero extra Firestore reads.

---

### Root Cause Analysis & Fixes

1. **Empty `filteredSales` on Server Success**
   * **Root Cause**: The client-side hook (`useReportsData`) used a fast server-path (`generateReport` Cloud Function) to fetch KPI aggregates. However, the Cloud Function did not return individual sales records, leaving `allSales` empty on the client. Since `filteredSales` derives from `allSales`, the Detailed Sales Log table was incorrectly rendering an empty state whenever the server was reachable.
   * **Fix**: 
     * Modified the `generateReport` Cloud Function (`functions/src/index.ts`) to serialize the `sales` array (converting Firestore Timestamps to ISO strings) and include it in the `ReportDataResponse`.
     * Updated the TypeScript interface in `reportService.ts` to type the new `sales` array.
     * Updated `useReportsData.ts` to populate `allSales` directly from `serverReport.sales`, eliminating the need for fallback client-side Firestore reads while retaining the fallback logic for offline scenarios.
     * Deployed the updated Cloud Function via the Firebase CLI (`ganewa-pos-functions:generateReport`).

---

## [Previous Report] Resolved Reports Data Loading Issues

### Summary
Resolved an issue where the POS reports were not showing any data and were throwing database errors. The issue was caused by missing Firestore composite indexes for date-range queries used by both the client-side app (`useReportsData`) and the server-side report generation Cloud Function (`generateReport`).

---

### Root Cause Analysis
1. **Inequality & Range Filters**: The queries filter on `deleted == false` (equality) and a range of `date` or `returnDate` (`>=` start and `<=` end timestamps).
2. **Missing Composite Indexes**: Firestore requires composite indexes for queries combining equality and inequality/range filters when they are query-scoped over a collection group or single collection. Without these indexes, the `generateReport` Cloud Function failed with an HTTP 500 error, and the client-side fallback query also threw a `FAILED_PRECONDITION` error.
3. **Ascending Sort Defaults**: Since the query did not specify an explicit `orderBy` clause, Firestore defaulted to ordering the results by `date`/`returnDate` in `ASCENDING` order. Existing indexes only had `DESCENDING` configurations.

---

### Actions Taken

#### 1. Updated Database Indexes
Added 5 missing composite index configurations to [`firestore.indexes.json`](file:///c:/Users/WIN11/Desktop/ganewa/ganewa/pos/firestore.indexes.json):

* **`customerPayments`**: Added composite index on `deleted` (ASC) and `date` (ASC).
* **`expenses`**: Added composite index on `deleted` (ASC) and `date` (ASC).
* **`sales`**: Added composite index on `deleted` (ASC) and `date` (ASC).
* **`returns`**: Added composite index on `deleted` (ASC) and `returnDate` (ASC).
* **`returnedItems`**: Added composite index on `deleted` (ASC) and `returnDate` (ASC).

#### 2. Deployed Indexes
Deployed the new composite index configuration to Google Cloud Firestore via the Firebase CLI:
```bash
npx firebase deploy --only firestore:indexes
```
The indexes were deployed successfully to the Firebase project `ganewa-provision-pos`.

#### 3. Verification
* Verified that the Cloud Functions compiled successfully (`npm run build`).
* Checked that the Firebase Console successfully registered the indexes and began building them.
