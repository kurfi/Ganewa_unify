import { useState, useEffect } from 'react';
import { startOfDay, endOfDay, subDays, startOfMonth, format } from 'date-fns';
import { db } from '../db/db';
import { roundTo2 } from '../utils/math';
import { PaymentMethod, Sale } from '../types';

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

    useEffect(() => {
        const fetchStats = async () => {
            const now = new Date();
            const todayStart = startOfDay(now);
            const todayEnd = endOfDay(now);
            const sevenDaysAgo = startOfDay(subDays(now, 6));
            const monthStart = startOfMonth(now);

            const [
                todaySalesArr, last7DaysSalesArr, thisMonthSalesArr,
                paidExpensesArr,
                todayReturnsArr, last7DaysReturnsArr, thisMonthReturnsArr,
                allCustomers, allProducts, allReturnedItems, allSuppliers,
                allCustomerPayments, allReturns, allSupplierPayments
            ] = await Promise.all([
                db.sales.where('date').between(todayStart, todayEnd, true, true).toArray(),
                db.sales.where('date').between(sevenDaysAgo, todayEnd, true, true).toArray(),
                db.sales.where('date').between(monthStart, todayEnd, true, true).toArray(),
                db.expenses.toArray(),
                db.returns.where('returnDate').between(todayStart, todayEnd, true, true).toArray(),
                db.returns.where('returnDate').between(sevenDaysAgo, todayEnd, true, true).toArray(),
                db.returns.where('returnDate').between(monthStart, todayEnd, true, true).toArray(),
                db.customers.toArray(),
                db.products.toArray(),
                db.returnedItems.toArray(),
                db.suppliers.toArray(),
                db.customerPayments.toArray(),
                db.returns.toArray(),
                db.supplierPayments.toArray()
            ]);

            const allCompletedSales = await db.sales.where('status').equals('COMPLETED').toArray();

            const todaySalesTotal = roundTo2(todaySalesArr.reduce((acc, sale) => acc + (sale.finalAmount || 0), 0));
            const last7DaysSalesTotal = roundTo2(last7DaysSalesArr.reduce((acc, sale) => acc + (sale.finalAmount || 0), 0));
            const thisMonthSalesTotal = roundTo2(thisMonthSalesArr.reduce((acc, sale) => acc + (sale.finalAmount || 0), 0));

            const paidExpenses = paidExpensesArr.filter(e => e.status === 'PAID' || !e.status);
            const pendingExpenses = paidExpensesArr.filter(e => e.status === 'PENDING');

            const todayExpensesTotal = roundTo2(paidExpenses
                .filter(e => e.date >= todayStart && e.date <= todayEnd)
                .reduce((acc, exp) => acc + (exp.amount || 0), 0));
 
            const totalExpenses = roundTo2(paidExpenses.reduce((acc, exp) => acc + (exp.amount || 0), 0));
            const totalDebtToPay = roundTo2(pendingExpenses.reduce((acc, exp) => acc + (exp.amount || 0), 0));
 
            const totalDebtToUs = roundTo2(allCustomers.reduce((acc, c) => acc + (c.currentDebt || 0), 0));
            const totalSupplierDebt = roundTo2(allSuppliers.reduce((acc, s) => acc + (s.balance || 0), 0));
            const inventoryValue = roundTo2(allProducts.reduce((acc, p) => acc + ((p.quantity || 0) * (p.buyPrice || 0)), 0));

            let lowStockCount = 0;
            for (const p of allProducts) {
                if (p.quantity <= p.minStockLevel) lowStockCount++;
            }

            const calculateReturnMetrics = (periodReturns: any[]) => {
                const periodReturnIds = (periodReturns || []).map(ret => ret.id);
                const periodReturnedItems = allReturnedItems.filter(item => periodReturnIds.includes(item.returnId));
                const totalRefundAmount = roundTo2((periodReturns || []).reduce((acc, ret) => acc + (ret.totalRefundAmount || 0), 0));
                const numItemsReturned = periodReturnedItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
                const totalValueDamaged = roundTo2(periodReturnedItems
                    .filter(item => item.restockStatus === 'damaged')
                    .reduce((acc, item) => acc + (item.valueLost || 0), 0));
                return { totalRefundAmount, numItemsReturned, totalValueDamaged };
            };

            const todayMetrics = calculateReturnMetrics(todayReturnsArr);
            const last7DaysMetrics = calculateReturnMetrics(last7DaysReturnsArr);
            const thisMonthMetrics = calculateReturnMetrics(thisMonthReturnsArr);

            const calculateReturnRate = (totalSales: number, totalRefunds: number) => totalSales > 0 ? roundTo2((totalRefunds / totalSales) * 100) : 0;

            const returnRateToday = calculateReturnRate(todaySalesTotal, todayMetrics.totalRefundAmount);
            const returnRateLast7Days = calculateReturnRate(last7DaysSalesTotal, last7DaysMetrics.totalRefundAmount);
            const returnRateThisMonth = calculateReturnRate(thisMonthSalesTotal, thisMonthMetrics.totalRefundAmount);

            const netSalesToday = roundTo2(todaySalesTotal - todayMetrics.totalRefundAmount);

            // Compute Business Finance KPIs
            const CASH_METHODS = [PaymentMethod.CASH];
            const BANK_METHODS = [PaymentMethod.TRANSFER, PaymentMethod.CARD];

            const sumMethodFromSales = (sales: Sale[], methods: PaymentMethod[]) =>
                sales.reduce((acc, sale) => {
                    if (sale.paymentMethods?.length) {
                        const total = sale.paymentMethods
                            .filter(m => methods.includes(m.method))
                            .reduce((s, m) => s + (m.amount || 0), 0);
                        return acc + total;
                    }
                    return acc + (methods.includes(sale.paymentMethod) ? (sale.finalAmount || 0) : 0);
                }, 0);

            const cashFromSales = sumMethodFromSales(allCompletedSales, CASH_METHODS);
            const bankFromSales = sumMethodFromSales(allCompletedSales, BANK_METHODS);

            const cashRepayments = allCustomerPayments.filter(p => CASH_METHODS.includes(p.paymentMethod)).reduce((acc, p) => acc + (p.amount || 0), 0);
            const bankRepayments = allCustomerPayments.filter(p => BANK_METHODS.includes(p.paymentMethod)).reduce((acc, p) => acc + (p.amount || 0), 0);

            const cashRefunds = allReturns.filter(r => CASH_METHODS.includes(r.paymentMethod)).reduce((acc, r) => acc + (r.totalRefundAmount || 0), 0);
            const bankRefunds = allReturns.filter(r => BANK_METHODS.includes(r.paymentMethod)).reduce((acc, r) => acc + (r.totalRefundAmount || 0), 0);

            // Supplier payments that reduced cash or bank
            const cashSupplierPayments = allSupplierPayments
                .filter(p => CASH_METHODS.includes(p.paymentMethod))
                .reduce((acc, p) => acc + (p.amount || 0), 0);

            const bankSupplierPayments = allSupplierPayments
                .filter(p => BANK_METHODS.includes(p.paymentMethod))
                .reduce((acc, p) => acc + (p.amount || 0), 0);

            // Split expenses by payment method — legacy records without paymentMethod default to CASH
            const cashExpenses = paidExpenses
                .filter(e => !e.paymentMethod || CASH_METHODS.includes(e.paymentMethod))
                .reduce((acc, e) => acc + (e.amount || 0), 0);

            const bankExpenses = paidExpenses
                .filter(e => e.paymentMethod && BANK_METHODS.includes(e.paymentMethod))
                .reduce((acc, e) => acc + (e.amount || 0), 0);

            const cashAtHand  = roundTo2(cashFromSales  + cashRepayments - cashExpenses  - cashRefunds - cashSupplierPayments);
            const moneyInBank = roundTo2(bankFromSales  + bankRepayments - bankExpenses  - bankRefunds - bankSupplierPayments);

            const assets = roundTo2(cashAtHand + moneyInBank + inventoryValue + totalDebtToUs);
            const liabilities = roundTo2(totalSupplierDebt + totalDebtToPay);
            const workingCapital = roundTo2(assets - liabilities);

            setStats({
                todaySales: todaySalesTotal,
                netSalesToday: netSalesToday,
                todayExpenses: todayExpensesTotal,
                totalExpenses: totalExpenses,
                totalDebtToUs: totalDebtToUs,
                totalDebtToPay: totalDebtToPay,
                inventoryValue: inventoryValue,
                lowStockItems: lowStockCount,
                totalProducts: allProducts.length,
                totalRefundAmountToday: todayMetrics.totalRefundAmount,
                totalRefundAmountLast7Days: last7DaysMetrics.totalRefundAmount,
                totalRefundAmountThisMonth: thisMonthMetrics.totalRefundAmount,
                numItemsReturnedToday: todayMetrics.numItemsReturned,
                numItemsReturnedLast7Days: last7DaysMetrics.numItemsReturned,
                numItemsReturnedThisMonth: thisMonthMetrics.numItemsReturned,
                totalValueDamagedToday: todayMetrics.totalValueDamaged,
                totalValueDamagedLast7Days: last7DaysMetrics.totalValueDamaged,
                totalValueDamagedThisMonth: thisMonthMetrics.totalValueDamaged,
                returnRateToday: returnRateToday,
                returnRateLast7Days: returnRateLast7Days,
                returnRateThisMonth: returnRateThisMonth,
                totalSupplierDebt: totalSupplierDebt,
                cashAtHand: cashAtHand,
                moneyInBank: moneyInBank,
                workingCapital: workingCapital,
                assets: assets,
                liabilities: liabilities,
            });

            const last7DaysChartData = [];
            for (let i = 6; i >= 0; i--) {
                const date = subDays(now, i);
                const dayStart = startOfDay(date);
                const dayEnd = endOfDay(date);
                const salesForDay = last7DaysSalesArr.filter(sale => sale.date >= dayStart && sale.date <= dayEnd);
                const total = roundTo2(salesForDay.reduce((acc, curr) => acc + curr.finalAmount, 0));
                last7DaysChartData.push({ name: format(date, 'EEE'), sales: total });
            }
            setWeeklyData(last7DaysChartData);
        };

        fetchStats();
    }, []);

    return { stats, weeklyData };
}
