import { useState, useEffect, useCallback, useRef } from 'react';
import { startOfDay, endOfDay, subDays, startOfMonth, format, isBefore } from 'date-fns';
import {
    collection, query, where, getAggregateFromServer, sum, count, getDocs,
    doc, getDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { roundTo2 } from '../utils/math';
import { PaymentMethod, Sale } from '../types';
import { subscribeDashboardRefresh } from '../utils/dashboardRefreshSignal';

export function useDashboardStats() {
    const [stats, setStats] = useState({
        todaySales: 0,
        netSalesToday: 0,
        todayExpenses: 0,
        totalExpenses: 0,
        totalDebtToUs: 0,
        totalDebtToPay: 0,
        inventoryValue: 0,
        lowStockItems: 0,
        totalProducts: 0,
        totalRefundAmountToday: 0,
        totalRefundAmountLast7Days: 0,
        totalRefundAmountThisMonth: 0,
        numItemsReturnedToday: 0,
        numItemsReturnedLast7Days: 0,
        numItemsReturnedThisMonth: 0,
        totalValueDamagedToday: 0,
        totalValueDamagedLast7Days: 0,
        totalValueDamagedThisMonth: 0,
        returnRateToday: 0,
        returnRateLast7Days: 0,
        returnRateThisMonth: 0,
        totalSupplierDebt: 0,
        cashAtHand: 0,
        moneyInBank: 0,
        workingCapital: 0,
        assets: 0,
        liabilities: 0,
    });

    const [weeklyData, setWeeklyData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const isFetchingRef = useRef(false);
    const lastFetchTimeRef = useRef<number>(0);
    const STATS_TTL_MS = 60_000;

    // ─────────────────────────────────────────────────────────────────────────
    //  dailyStats helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Represents the shape of a pre-rolled dailyStats document.
     */
    interface DailyStatDoc {
        grossSales?: number;
        netSales?: number;
        totalRefundAmount?: number;
        numItemsReturned?: number;
        totalValueDamaged?: number;
        totalExpenses?: number;
        numSales?: number;
        returnRate?: number;
    }

    /**
     * Enumerate all calendar dates (YYYY-MM-DD) between two Date objects, inclusive.
     */
    function enumerateDates(start: Date, end: Date): string[] {
        const dates: string[] = [];
        const current = new Date(start);
        current.setHours(0, 0, 0, 0);
        const endMidnight = new Date(end);
        endMidnight.setHours(0, 0, 0, 0);
        while (current <= endMidnight) {
            dates.push(format(current, 'yyyy-MM-dd'));
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    /**
     * Read and sum multiple dailyStats documents.
     * Missing docs (days without a rollup yet) are treated as zeros.
     * Returns `null` if ANY of the docs is missing AND it is today or in the future
     * (i.e., the rollup hasn't run yet for that day — fall back to live queries).
     */
    async function readDailyStats(
        start: Date,
        end: Date,
        todayStart: Date
    ): Promise<DailyStatDoc | null> {
        const dates = enumerateDates(start, end);

        // If any date in the range is today or future we must fall back to live queries
        for (const d of dates) {
            const dateObj = new Date(d + 'T00:00:00');
            if (!isBefore(dateObj, todayStart)) {
                return null; // contains today → use live aggregates
            }
        }

        const fetches = dates.map(d => getDoc(doc(db, 'dailyStats', d)));
        const snaps = await Promise.all(fetches);

        // If any document in the date range is missing (rollup hasn't run or dailyStats unpopulated),
        // fall back to live aggregate queries so we don't silently report 0 for missing rollup days.
        if (snaps.some(snap => !snap.exists())) {
            return null;
        }

        const totals: DailyStatDoc = {
            grossSales: 0,
            netSales: 0,
            totalRefundAmount: 0,
            numItemsReturned: 0,
            totalValueDamaged: 0,
            totalExpenses: 0,
            numSales: 0,
            returnRate: 0,
        };

        let totalGrossForRate = 0;
        let totalRefundForRate = 0;

        for (const snap of snaps) {
            const d = snap.data() as DailyStatDoc;
            totals.grossSales! += d.grossSales ?? 0;
            totals.netSales! += d.netSales ?? 0;
            totals.totalRefundAmount! += d.totalRefundAmount ?? 0;
            totals.numItemsReturned! += d.numItemsReturned ?? 0;
            totals.totalValueDamaged! += d.totalValueDamaged ?? 0;
            totals.totalExpenses! += d.totalExpenses ?? 0;
            totals.numSales! += d.numSales ?? 0;
            totalGrossForRate += d.grossSales ?? 0;
            totalRefundForRate += d.totalRefundAmount ?? 0;
        }

        // Recalculate return rate for the combined range
        totals.returnRate = totalGrossForRate > 0
            ? roundTo2((totalRefundForRate / totalGrossForRate) * 100)
            : 0;

        return totals;
    }

    // ─────────────────────────────────────────────────────────────────────────

    const refresh = useCallback(async (force?: boolean) => {
        if (!navigator.onLine) {
            setError('The user is offline');
            setLoading(false);
            return;
        }

        if (!force && Date.now() - lastFetchTimeRef.current < STATS_TTL_MS) {
            setLoading(false);
            return;
        }

        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        setLoading(true);

        try {
            const now = new Date();
            const todayStart = startOfDay(now);
            const todayEnd = endOfDay(now);
            const sevenDaysAgo = startOfDay(subDays(now, 6));
            const monthStart = startOfMonth(now);

            const salesCol = collection(db, 'sales');
            const expCol = collection(db, 'expenses');
            const retCol = collection(db, 'returns');
            const retItemCol = collection(db, 'returnedItems');
            const custCol = collection(db, 'customers');
            const suppCol = collection(db, 'suppliers');
            const prodCol = collection(db, 'products');
            const custPayCol = collection(db, 'customerPayments');
            const suppPayCol = collection(db, 'supplierPayments');

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

            const aggCount = (col: any, filters: any[]): () => Promise<number> => async () => {
                const q = query(col, ...filters);
                const snap = await safeAggregate(q, { cnt: count() });
                return Number(snap.data().cnt || 0);
            };

            const limitConcurrency = async <T>(tasks: (() => Promise<T>)[], limit = 2): Promise<T[]> => {
                const results: T[] = new Array(tasks.length);
                let index = 0;
                const worker = async () => {
                    while (index < tasks.length) {
                        const i = index++;
                        try {
                            results[i] = await tasks[i]();
                        } catch (err) {
                            console.warn(`Aggregation query ${i} warning:`, err);
                            results[i] = 0 as unknown as T;
                        }
                        await new Promise((res) => setTimeout(res, 40));
                    }
                };
                await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
                return results;
            };

            const notDeleted = where('deleted', '==', false);

            // ── Phase 1: Date-range aggregations ────────────────────────────
            // For date windows that fall entirely in the past we read from the
            // pre-rolled `dailyStats` collection instead of running expensive
            // aggregate queries.  "Today" always uses live aggregates because
            // no rollup exists for the current day yet.

            // ── Yesterday window (the last completed day) ──
            // The scheduler runs at 00:05, so yesterday's rollup should be
            // available from shortly after midnight.
            const yesterdayStart = startOfDay(subDays(now, 1));
            const yesterdayEnd   = endOfDay(subDays(now, 1));

            // Try to read last-7-days from dailyStats (excludes today, so it
            // covers D-6 through D-1 — 6 past days).  We add today's live
            // values on top.
            const [last7DailyRaw, thisMonthDailyRaw] = await Promise.all([
                readDailyStats(sevenDaysAgo, yesterdayEnd, todayStart),
                readDailyStats(monthStart, yesterdayEnd, todayStart),
            ]);

            // TODAY: always use live aggregate queries regardless of rollup
            const phase1TodayTasks = [
                // Today's sales (0)
                aggSum(salesCol, [notDeleted, where('date', '>=', todayStart), where('date', '<=', todayEnd), where('status', '==', 'COMPLETED')], 'finalAmount'),
                // Today's refunds (1)
                aggSum(retCol, [notDeleted, where('returnDate', '>=', todayStart), where('returnDate', '<=', todayEnd)], 'totalRefundAmount'),
                // Today's returned item count (2)
                aggSum(retItemCol, [notDeleted, where('returnDate', '>=', todayStart), where('returnDate', '<=', todayEnd)], 'quantity'),
                // Today's damaged value (3)
                aggSum(retItemCol, [notDeleted, where('returnDate', '>=', todayStart), where('returnDate', '<=', todayEnd), where('restockStatus', '==', 'damaged')], 'valueLost'),
                // Today's expenses (4)
                aggSum(expCol, [notDeleted, where('date', '>=', todayStart), where('date', '<=', todayEnd), where('status', '==', 'PAID')], 'amount'),
            ];

            const [
                todaySales,
                todayRefunds,
                todayItemsReturned,
                todayDamaged,
                todayExpensesTotal,
            ] = await limitConcurrency(phase1TodayTasks, 2);

            // PAST 7 DAYS: use dailyStats if available, else fall back to live
            let last7DaysSales: number;
            let last7DaysRefunds: number;
            let last7DaysItemsReturned: number;
            let last7DaysDamaged: number;

            if (last7DailyRaw !== null) {
                // Sum the 6 past days from dailyStats + today's live values
                console.log('[DashboardStats] Using dailyStats for last-7-days window');
                last7DaysSales          = (last7DailyRaw.grossSales ?? 0) + todaySales;
                last7DaysRefunds        = (last7DailyRaw.totalRefundAmount ?? 0) + todayRefunds;
                last7DaysItemsReturned  = (last7DailyRaw.numItemsReturned ?? 0) + todayItemsReturned;
                last7DaysDamaged        = (last7DailyRaw.totalValueDamaged ?? 0) + todayDamaged;
            } else {
                // Fall back to live aggregates for the full 7-day window
                console.log('[DashboardStats] dailyStats unavailable for last-7-days, using live queries');
                const fallbackTasks = [
                    aggSum(salesCol, [notDeleted, where('date', '>=', sevenDaysAgo), where('date', '<=', todayEnd), where('status', '==', 'COMPLETED')], 'finalAmount'),
                    aggSum(retCol, [notDeleted, where('returnDate', '>=', sevenDaysAgo), where('returnDate', '<=', todayEnd)], 'totalRefundAmount'),
                    aggSum(retItemCol, [notDeleted, where('returnDate', '>=', sevenDaysAgo), where('returnDate', '<=', todayEnd)], 'quantity'),
                    aggSum(retItemCol, [notDeleted, where('returnDate', '>=', sevenDaysAgo), where('returnDate', '<=', todayEnd), where('restockStatus', '==', 'damaged')], 'valueLost'),
                ];
                [last7DaysSales, last7DaysRefunds, last7DaysItemsReturned, last7DaysDamaged] =
                    await limitConcurrency(fallbackTasks, 2);
            }

            // THIS MONTH: use dailyStats (past days of month) + today's live
            let thisMonthSales: number;
            let thisMonthRefunds: number;
            let thisMonthItemsReturned: number;
            let thisMonthDamaged: number;

            if (thisMonthDailyRaw !== null) {
                console.log('[DashboardStats] Using dailyStats for this-month window');
                thisMonthSales          = (thisMonthDailyRaw.grossSales ?? 0) + todaySales;
                thisMonthRefunds        = (thisMonthDailyRaw.totalRefundAmount ?? 0) + todayRefunds;
                thisMonthItemsReturned  = (thisMonthDailyRaw.numItemsReturned ?? 0) + todayItemsReturned;
                thisMonthDamaged        = (thisMonthDailyRaw.totalValueDamaged ?? 0) + todayDamaged;
            } else {
                console.log('[DashboardStats] dailyStats unavailable for this-month, using live queries');
                const fallbackMonthTasks = [
                    aggSum(salesCol, [notDeleted, where('date', '>=', monthStart), where('date', '<=', todayEnd), where('status', '==', 'COMPLETED')], 'finalAmount'),
                    aggSum(retCol, [notDeleted, where('returnDate', '>=', monthStart), where('returnDate', '<=', todayEnd)], 'totalRefundAmount'),
                    aggSum(retItemCol, [notDeleted, where('returnDate', '>=', monthStart), where('returnDate', '<=', todayEnd)], 'quantity'),
                    aggSum(retItemCol, [notDeleted, where('returnDate', '>=', monthStart), where('returnDate', '<=', todayEnd), where('restockStatus', '==', 'damaged')], 'valueLost'),
                ];
                [thisMonthSales, thisMonthRefunds, thisMonthItemsReturned, thisMonthDamaged] =
                    await limitConcurrency(fallbackMonthTasks, 2);
            }

            // Phase 2: Totals and Inventory (combined prodCol stockValue & count)
            const prodAggTask = async () => {
                const q = query(prodCol, notDeleted);
                const snap = await safeAggregate(q, { stockValue: sum('stockValue'), cnt: count() });
                return { stockValue: snap.data().stockValue || 0, cnt: snap.data().cnt || 0 };
            };

            const phase2Tasks = [
                aggSum(expCol, [notDeleted, where('status', '==', 'PAID')], 'amount'),
                aggSum(expCol, [notDeleted, where('status', '==', 'PENDING')], 'amount'),
                aggSum(custCol, [notDeleted], 'currentDebt'),
                aggSum(suppCol, [notDeleted], 'balance'),
                prodAggTask,
                aggCount(prodCol, [notDeleted, where('quantity', '<=', 5)]),
            ];

            const [
                totalExpenses, totalDebtToPay, totalDebtToUs, totalSupplierDebt, prodAggResult, lowStockItems
            ] = await limitConcurrency<any>(phase2Tasks, 2);

            const inventoryValue = (prodAggResult as any).stockValue || 0;
            const totalProducts = (prodAggResult as any).cnt || 0;

            // Phase 3: Payment methods breakdown (Cash, Card, Transfer)
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

            const methodResults = await limitConcurrency(methodTasks, 2);

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

            const cashAtHand = roundTo2(cashFromSales + repaySums.cash - expSums.cash - refundSums.cash - suppPaySums.cash);
            const moneyInBank = roundTo2(bankFromSales + repaySums.bank - expSums.bank - refundSums.bank - suppPaySums.bank);

            // Phase 4: Weekly chart day-by-day
            const weekDays = [6, 5, 4, 3, 2, 1, 0].map(i => {
                const date = subDays(now, i);
                return { date, name: format(date, 'EEE'), start: startOfDay(date), end: endOfDay(date) };
            });

            const chartTasks = weekDays.map(d => 
                aggSum(salesCol, [notDeleted, where('date', '>=', d.start), where('date', '<=', d.end), where('status', '==', 'COMPLETED')], 'finalAmount')
            );
            const chartValues = await limitConcurrency(chartTasks, 2);
            const last7DaysChartData = weekDays.map((d, i) => ({
                name: d.name,
                sales: roundTo2(chartValues[i])
            }));

            const calcRate = (sales: number, refs: number) => sales > 0 ? roundTo2((refs / sales) * 100) : 0;

            const calculatedStats = {
                todaySales: roundTo2(todaySales),
                netSalesToday: roundTo2(todaySales - todayRefunds),
                todayExpenses: roundTo2(todayExpensesTotal),
                totalExpenses: roundTo2(totalExpenses),
                totalDebtToUs: roundTo2(totalDebtToUs),
                totalDebtToPay: roundTo2(totalDebtToPay),
                inventoryValue: roundTo2(inventoryValue),
                lowStockItems: lowStockItems,
                totalProducts: totalProducts,
                totalRefundAmountToday: roundTo2(todayRefunds),
                totalRefundAmountLast7Days: roundTo2(last7DaysRefunds),
                totalRefundAmountThisMonth: roundTo2(thisMonthRefunds),
                numItemsReturnedToday: todayItemsReturned,
                numItemsReturnedLast7Days: last7DaysItemsReturned,
                numItemsReturnedThisMonth: thisMonthItemsReturned,
                totalValueDamagedToday: roundTo2(todayDamaged),
                totalValueDamagedLast7Days: roundTo2(last7DaysDamaged),
                totalValueDamagedThisMonth: roundTo2(thisMonthDamaged),
                returnRateToday: calcRate(todaySales, todayRefunds),
                returnRateLast7Days: calcRate(last7DaysSales, last7DaysRefunds),
                returnRateThisMonth: calcRate(thisMonthSales, thisMonthRefunds),
                totalSupplierDebt: roundTo2(totalSupplierDebt),
                cashAtHand: cashAtHand,
                moneyInBank: moneyInBank,
                workingCapital: roundTo2((cashAtHand + moneyInBank + inventoryValue + totalDebtToUs) - (totalSupplierDebt + totalDebtToPay)),
                assets: roundTo2(cashAtHand + moneyInBank + inventoryValue + totalDebtToUs),
                liabilities: roundTo2(totalSupplierDebt + totalDebtToPay),
            };

            setStats(calculatedStats);
            lastFetchTimeRef.current = Date.now();
            setWeeklyData(last7DaysChartData);
            setError(null);
        } catch (err: any) {
            console.error('Error computing dashboard stats:', err);
            setError('Failed to refresh stats');
        } finally {
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, []);

    useEffect(() => {
        refresh();

        const unsubSignal = subscribeDashboardRefresh(() => {
            refresh(true);
        });

        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible') {
                refresh();
            }
        }, 3 * 60 * 1000);

        const handleOnline = () => refresh();
        window.addEventListener('online', handleOnline);

        return () => {
            unsubSignal();
            clearInterval(intervalId);
            window.removeEventListener('online', handleOnline);
        };
    }, [refresh]);

    return { stats, weeklyData, loading, error, refresh };
}
