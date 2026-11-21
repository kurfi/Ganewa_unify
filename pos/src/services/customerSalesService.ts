/**
 * customerSalesService.ts
 *
 * Thin client wrappers around the two customer-sales Cloud Functions:
 *   - getCustomerSalesHistory  → used by CustomerHistoryModal
 *   - searchCustomerSalesPOS   → used by POS History tab customer-search
 *
 * Both functions are `onCall` in Firebase Functions v2 (us-central1).
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Sale, CustomerPayment } from '../types';

const functions = getFunctions(undefined, 'us-central1');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CustomerHistoryResult {
    sales: Sale[];
    payments: CustomerPayment[];
    aggregates: {
        totalSpent: number;
        salesCount: number;
        totalRepaid: number;
        paymentsCount: number;
    };
}

export interface CustomerAggregate {
    totalSpent: number;
    salesCount: number;
    customerName: string;
}

export interface CustomerSalesSearchResult {
    sales: Sale[];
    customerAggregates: Record<string, CustomerAggregate>;
}

// ─── Callables ───────────────────────────────────────────────────────────────

const _getCustomerSalesHistoryFn = httpsCallable<
    { customerId: string },
    CustomerHistoryResult
>(functions, 'getCustomerSalesHistory');

const _searchCustomerSalesPOSFn = httpsCallable<
    { query: string },
    CustomerSalesSearchResult
>(functions, 'searchCustomerSalesPOS');

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetches a customer's full sale + repayment history from the server.
 * Returns up to 50 of each, plus server-side aggregates (total spent / repaid).
 *
 * Dates are returned as ISO strings and must be re-parsed where needed.
 *
 * @throws If the Cloud Function call fails.
 */
export async function fetchCustomerHistory(customerId: string): Promise<CustomerHistoryResult> {
    console.log(`[CustomerSalesService] Fetching history for customer: ${customerId}`);
    const result = await _getCustomerSalesHistoryFn({ customerId });
    return result.data;
}

/**
 * Searches for customers matching the supplied query string (prefix match on
 * nameLower) and returns up to 50 of their most-recent sales together with
 * per-customer aggregate totals.
 *
 * @param query  At least 2 characters. Compared case-insensitively.
 * @throws If the Cloud Function call fails.
 */
export async function searchCustomerSalesPOS(query: string): Promise<CustomerSalesSearchResult> {
    console.log(`[CustomerSalesService] Searching POS sales for query: "${query}"`);
    const result = await _searchCustomerSalesPOSFn({ query });
    return result.data;
}
