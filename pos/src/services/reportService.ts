import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions(undefined, 'us-central1');

export interface ReportDataResponse {
    totalRevenue: number;
    totalDiscounts: number;
    totalTransactions: number;
    avgOrderValue: number;
    totalExpenses: number;
    totalRefunds: number;
    totalValueLost: number;
    totalCOGS: number;
    grossProfit: number;
    netProfit: number;
    totalSupplierDebt: number;
    totalPurchases: number;
    totalDebtPaid: number;
    salesByDate: Array<{ date: string; amount: number }>;
    salesByPayment: Array<{ name: string; value: number }>;
    topProducts: Array<{ name: string; qty: number; revenue: number }>;
    salesCount: number;
    sales: any[]; // individual sale records for the Detailed Sales Log
}

const _generateReportFn = httpsCallable<
    { startDate: string; endDate: string; source?: 'pos' | 'online' | 'all' },
    ReportDataResponse
>(functions, 'generateReport');

export async function fetchServerReport(
    startDate: string,
    endDate: string,
    source: 'pos' | 'online' | 'all' = 'pos'
): Promise<ReportDataResponse> {
    console.log(`[ReportService] Requesting server report for ${startDate} to ${endDate} (source: ${source})…`);
    const result = await _generateReportFn({ startDate, endDate, source });
    return result.data;
}
