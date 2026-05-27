import { useState, useEffect, useMemo } from 'react';
import { db } from '../db/db';
import { Sale, Expense, Product, Return, ReturnedItem, PaymentMethod, CustomerPayment } from '../types';
import { roundTo2 } from '../utils/math';
import { format, startOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, endOfMonth, startOfDay, endOfDay, subDays, addDays } from 'date-fns';

export function useReportsData() {
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [sales, setSales] = useState<Sale[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [returns, setReturns] = useState<Return[]>([]);
    const [returnedItems, setReturnedItems] = useState<ReturnedItem[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
    const [loading, setLoading] = useState(false);
    const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
    const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'inventory' | 'financials' | 'returnAnalytics'>('overview');
    const [salesSearchQuery, setSalesSearchQuery] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);

            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const [fetchedSales, fetchedExpenses, fetchedProducts, fetchedReturns, fetchedReturnedItems, fetchedSuppliers, fetchedPurchases, fetchedCustomerPayments] = await Promise.all([
                db.sales.where('date').between(start, end).sortBy('date').then(res => res.reverse()),
                db.expenses.where('date').between(start, end).sortBy('date').then(res => res.reverse()),
                db.products.toArray(),
                db.returns.where('returnDate').between(start, end).toArray(),
                db.returnedItems.toArray(),
                db.suppliers.toArray(),
                db.purchases.where('date').between(start, end).toArray(),
                db.customerPayments.where('date').between(start, end).toArray()
            ]);

            const returnIds = fetchedReturns.map(r => r.id);
            const relevantReturnedItems = fetchedReturnedItems.filter(item => returnIds.includes(item.returnId));

            setSales(fetchedSales);
            setExpenses(fetchedExpenses);
            setProducts(fetchedProducts);
            setReturns(fetchedReturns);
            setReturnedItems(relevantReturnedItems);
            setSuppliers(fetchedSuppliers);
            setPurchases(fetchedPurchases);
            setCustomerPayments(fetchedCustomerPayments);
        } catch (error) {
            console.error("Failed to fetch report data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    const handleSetPreset = (preset: 'today' | 'week' | 'month' | 'year') => {
        setActivePreset(preset);
        let start, end;
        const now = new Date();
        switch (preset) {
            case 'today': start = startOfDay(now); end = endOfDay(now); break;
            case 'week': start = startOfWeek(now); end = endOfWeek(now); break;
            case 'month': start = startOfMonth(now); end = endOfMonth(now); break;
            case 'year': start = startOfYear(now); end = endOfYear(now); break;
        }
        setStartDate(format(start, 'yyyy-MM-dd'));
        setEndDate(format(end, 'yyyy-MM-dd'));
    };

    const totalRevenue = roundTo2(sales.reduce((sum, s) => sum + (s.finalAmount || 0), 0));
    const totalDiscounts = roundTo2(sales.reduce((sum, s) => sum + (s.discount || 0), 0));
    const totalTransactions = sales.length;
    const avgOrderValue = totalTransactions > 0 ? roundTo2(totalRevenue / totalTransactions) : 0;
    const totalExpenses = roundTo2(expenses.reduce((sum, e) => sum + (e.amount || 0), 0));
    const totalRefunds = roundTo2(returns.reduce((sum, r) => sum + (r.totalRefundAmount || 0), 0));
    const totalValueLost = roundTo2(returnedItems.reduce((sum, item) => sum + (item.valueLost || 0), 0));
    const totalSupplierDebt = roundTo2(suppliers.reduce((sum, s) => sum + (s.balance || 0), 0));
    const totalPurchases = roundTo2(purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0));
    const totalDebtPaid = roundTo2(customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0));

    const totalCOGS = roundTo2(sales.reduce((sum, sale) => {
        const saleCost = (sale.items || []).reduce((itemSum, item) => {
            return itemSum + (item.quantity * (item.costPrice || 0));
        }, 0);
        return sum + saleCost;
    }, 0));

    const totalCostOfGoodReturns = roundTo2(returnedItems.reduce((sum, item) => {
        if ((item.valueLost || 0) > 0) return sum;
 
        let cost = (item as any).costPrice;
        if (!cost) {
            const product = products.find(p => p.id === item.productId);
            cost = product?.buyPrice || 0;
        }
        return sum + (item.quantity * cost);
    }, 0));
 
    const grossProfit = roundTo2(totalRevenue - totalCOGS);
    const netProfit = roundTo2(grossProfit - totalExpenses - totalRefunds + totalCostOfGoodReturns);

    const filteredSales = useMemo(() => {
        const lowerQuery = (salesSearchQuery || '').toLowerCase();
        return sales.filter(sale =>
            (sale.customerName || '').toLowerCase().includes(lowerQuery) ||
            (sale.id?.toString() || '').includes(lowerQuery)
        );
    }, [sales, salesSearchQuery]);

    const salesByDate = useMemo(() => {
        const grouped: Record<string, number> = {};
        sales.forEach(sale => {
            const dateStr = format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'MMM dd');
            grouped[dateStr] = roundTo2((grouped[dateStr] || 0) + (sale.finalAmount || 0));
        });
        return Object.entries(grouped).map(([date, amount]) => ({ date, amount })).reverse();
    }, [sales]);

    const salesByPayment = useMemo(() => {
        const grouped: Record<string, number> = {};
        sales.forEach(sale => {
            if (sale.paymentMethod === PaymentMethod.MULTIPAY && sale.paymentMethods) {
                sale.paymentMethods.forEach(pm => {
                    grouped[pm.method] = roundTo2((grouped[pm.method] || 0) + pm.amount);
                });
            } else {
                grouped[sale.paymentMethod] = roundTo2((grouped[sale.paymentMethod] || 0) + sale.finalAmount);
            }
        });
        return Object.entries(grouped).map(([name, value]) => ({ name, value }));
    }, [sales]);

    const inventoryAnalysis = useMemo(() => {
        const lowStockProducts = products.filter(p => p.quantity <= p.minStockLevel).map(p => ({
            ...p,
            currentStock: p.quantity
        }));
        const expiringBatches: any[] = [];
        return { lowStockProducts, expiringBatches };
    }, [products]);

    const topProducts = useMemo(() => {
        const productStats: Record<number, { name: string, qty: number, revenue: number }> = {};
        sales.forEach(sale => {
            (sale.items || []).forEach(item => {
                if (!productStats[item.productId]) {
                    productStats[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
                }
                productStats[item.productId].qty += item.quantity;
                productStats[item.productId].revenue = roundTo2(productStats[item.productId].revenue + item.total);
            });
        });
        return Object.values(productStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
    }, [sales]);

    return {
        startDate, setStartDate,
        endDate, setEndDate,
        sales, expenses, products, returns, returnedItems,
        loading,
        activePreset, handleSetPreset,
        activeTab, setActiveTab,
        salesSearchQuery, setSalesSearchQuery,
        totalRevenue, totalDiscounts, totalTransactions, avgOrderValue,
        totalExpenses, totalRefunds, totalValueLost,
        totalCOGS, grossProfit, netProfit,
        totalSupplierDebt, totalPurchases, totalDebtPaid,
        filteredSales, salesByDate, salesByPayment,
        inventoryAnalysis, topProducts
    };
}
