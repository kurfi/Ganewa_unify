import { collection, query, where, getAggregateFromServer, sum, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { roundTo2 } from './math';
import { PaymentMethod } from '../types';
import { subscribeDashboardRefresh } from './dashboardRefreshSignal';

let cachedBalances: { cashAtHand: number; moneyInBank: number; timestamp: number } | null = null;
const CACHE_TTL_MS = 45000; // 45 seconds in-memory cache

export const invalidateBalancesCache = () => {
    cachedBalances = null;
};

// Automatically invalidate cache whenever a transaction (sale, expense, purchase, debt payment) occurs
subscribeDashboardRefresh(() => {
    invalidateBalancesCache();
});

export const computeBalances = async (forceRefresh = false): Promise<{
    cashAtHand: number;
    moneyInBank: number;
}> => {
    if (!forceRefresh && cachedBalances && (Date.now() - cachedBalances.timestamp < CACHE_TTL_MS)) {
        return {
            cashAtHand: cachedBalances.cashAtHand,
            moneyInBank: cachedBalances.moneyInBank,
        };
    }

    try {
        const runningSnap = await getDoc(doc(db, 'settings', 'runningBalance'));
        if (runningSnap.exists()) {
            const data = runningSnap.data();
            if (typeof data.cashAtHand === 'number' && typeof data.moneyInBank === 'number') {
                const res = {
                    cashAtHand: roundTo2(data.cashAtHand),
                    moneyInBank: roundTo2(data.moneyInBank),
                };
                cachedBalances = { ...res, timestamp: Date.now() };
                return res;
            }
        }
    } catch (err) {
        console.warn('[computeBalances] Fast running balance read failed, falling back to aggregate queries:', err);
    }

    const notDeleted = where('deleted', '==', false);

    const salesCol = collection(db, 'sales');
    const custPayCol = collection(db, 'customerPayments');
    const retCol = collection(db, 'returns');
    const suppPayCol = collection(db, 'supplierPayments');
    const expCol = collection(db, 'expenses');

    const safeAggregate = async (q: any, spec: any, maxRetries = 4, baseDelay = 300): Promise<any> => {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                return await getAggregateFromServer(q, spec);
            } catch (err: any) {
                attempt++;
                const isRateLimit =
                    err?.code === 'resource-exhausted' ||
                    (err?.message && (err.message.includes('429') || err.message.includes('Too Many Requests'))) ||
                    err?.status === 429;

                if (isRateLimit && attempt < maxRetries) {
                    const jitter = Math.floor(Math.random() * 200);
                    const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
                    await new Promise((res) => setTimeout(res, delay));
                } else {
                    throw err;
                }
            }
        }
        return await getAggregateFromServer(q, spec);
    };

    const aggSum = (col: any, filters: any[], sumField: string): () => Promise<number> => async () => {
        const q = query(col, ...filters);
        const snap = await safeAggregate(q, { total: sum(sumField) });
        return Number(snap.data().total || 0);
    };

    const limitConcurrency = async <T>(tasks: (() => Promise<T>)[], limit = 5): Promise<T[]> => {
        const results: T[] = new Array(tasks.length);
        let index = 0;
        const worker = async () => {
            while (index < tasks.length) {
                const i = index++;
                try {
                    results[i] = await tasks[i]();
                } catch (err) {
                    console.warn(`Aggregation task ${i} warning:`, err);
                    results[i] = 0 as unknown as T;
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
        return results;
    };

    const methodTasks = [
        // salesSums
        aggSum(salesCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CASH), where('status', '==', 'COMPLETED')], 'finalAmount'),
        aggSum(salesCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CARD), where('status', '==', 'COMPLETED')], 'finalAmount'),
        aggSum(salesCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.TRANSFER), where('status', '==', 'COMPLETED')], 'finalAmount'),
        // repaySums
        aggSum(custPayCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CASH)], 'amount'),
        aggSum(custPayCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CARD)], 'amount'),
        aggSum(custPayCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.TRANSFER)], 'amount'),
        // refundSums
        aggSum(retCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CASH)], 'totalRefundAmount'),
        aggSum(retCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CARD)], 'totalRefundAmount'),
        aggSum(retCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.TRANSFER)], 'totalRefundAmount'),
        // suppPaySums
        aggSum(suppPayCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CASH)], 'amount'),
        aggSum(suppPayCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CARD)], 'amount'),
        aggSum(suppPayCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.TRANSFER)], 'amount'),
        // expSums
        aggSum(expCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CASH), where('status', '==', 'PAID')], 'amount'),
        aggSum(expCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.CARD), where('status', '==', 'PAID')], 'amount'),
        aggSum(expCol, [notDeleted, where('paymentMethod', '==', PaymentMethod.TRANSFER), where('status', '==', 'PAID')], 'amount'),
    ];

    const methodResults = await limitConcurrency(methodTasks, 5);

    const salesSums = { cash: methodResults[0], bank: methodResults[1] + methodResults[2] };
    const repaySums = { cash: methodResults[3], bank: methodResults[4] + methodResults[5] };
    const refundSums = { cash: methodResults[6], bank: methodResults[7] + methodResults[8] };
    const suppPaySums = { cash: methodResults[9], bank: methodResults[10] + methodResults[11] };
    const expSums = { cash: methodResults[12], bank: methodResults[13] + methodResults[14] };

    const multiPaySnap = await getDocs(query(salesCol, notDeleted, where('paymentMethod', '==', PaymentMethod.MULTIPAY), where('status', '==', 'COMPLETED')));
    let multiCash = 0;
    let multiBank = 0;
    multiPaySnap.forEach(doc => {
        const methods = doc.data().paymentMethods || [];
        methods.forEach((m: any) => {
            const amt = m.amount || 0;
            if (m.method === PaymentMethod.CASH) multiCash += amt;
            if (m.method === PaymentMethod.CARD || m.method === PaymentMethod.TRANSFER) multiBank += amt;
        });
    });

    const cashFromSales = salesSums.cash + multiCash;
    const bankFromSales = salesSums.bank + multiBank;

    const result = {
        cashAtHand: roundTo2(cashFromSales + repaySums.cash - expSums.cash - refundSums.cash - suppPaySums.cash),
        moneyInBank: roundTo2(bankFromSales + repaySums.bank - expSums.bank - refundSums.bank - suppPaySums.bank),
    };
    cachedBalances = { ...result, timestamp: Date.now() };
    return result;
};
