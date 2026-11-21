import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeFirestoreDates } from '../firebase/firestoreHelpers';
import { Sale, Expense, Product, Return, ReturnedItem, PaymentMethod, CustomerPayment, Supplier, Purchase, SupplierPayment, Customer } from '../types';
import { roundTo2 } from '../utils/math';
import { format, startOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { fetchServerReport, ReportDataResponse } from '../services/reportService';
import { subscribeDashboardRefresh } from '../utils/dashboardRefreshSignal';

// ── 1. Master Data Cache (products, customers, suppliers) ────────────────────
// These collections do NOT depend on date ranges and rarely change.
// Reusing them across date/tab changes prevents hundreds of redundant reads.
interface MasterDataCache {
    products: Product[];
    customers: Customer[];
    suppliers: Supplier[];
    timestamp: number;
}
let masterDataCache: MasterDataCache | null = null;
const MASTER_DATA_TTL = 5 * 60 * 1000; // 5 minutes

// ── 2. Range Report Cache ────────────────────────────────────────────────────
// Caches reports by key: `${startDate}_${endDate}_${saleSource}`
// - Past date ranges are immutable: cached for 10 minutes.
// - Today's date range is live: cached for 60 seconds (like dashboard STATS_TTL_MS).
// - Real-time invalidation: automatically cleared when any transaction occurs.
interface CachedReport {
    serverReport: ReportDataResponse | null;
    sales: Sale[];
    expenses: Expense[];
    returns: Return[];
    customerPayments: CustomerPayment[];
    supplierPayments: SupplierPayment[];
    purchases: Purchase[];
    returnedItems: ReturnedItem[];
    timestamp: number;
}
const reportCache = new Map<string, CachedReport>();
const PAST_RANGE_TTL = 10 * 60 * 1000; // 10 minutes
const TODAY_RANGE_TTL = 60 * 1000;      // 60 seconds

export function useReportsData() {
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
    const [activeTab, setActiveTab] = useState<'daily' | 'overview' | 'sales' | 'inventory' | 'financials' | 'returnAnalytics' | 'returnsLog' | 'damagedItems'>('daily');
    const [salesSearchQuery, setSalesSearchQuery] = useState('');
    const [saleSource, setSaleSource] = useState<'pos' | 'online' | 'all'>('all');

    const [allSales, setAllSales] = useState<Sale[]>([]);
    const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
    const [allReturns, setAllReturns] = useState<Return[]>([]);
    const [allReturnedItems, setAllReturnedItems] = useState<ReturnedItem[]>([]);
    const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
    const [allPurchases, setAllPurchases] = useState<Purchase[]>([]);
    const [allCustomerPayments, setAllCustomerPayments] = useState<CustomerPayment[]>([]);
    const [allSupplierPayments, setAllSupplierPayments] = useState<SupplierPayment[]>([]);
    const [loading, setLoading] = useState(false);

    const isFetchingRef = useRef(false);

    // Derived Date filtering
    const startTime = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        return start.getTime();
    }, [startDate]);

    const endTime = useMemo(() => {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return end.getTime();
    }, [endDate]);

    const [serverReport, setServerReport] = useState<ReportDataResponse | null>(null);

    const fetchReports = useCallback(async (forceRefresh = false) => {
        if (isFetchingRef.current) return;

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const isHistorical = endDate < todayStr;
        const ttl = isHistorical ? PAST_RANGE_TTL : TODAY_RANGE_TTL;
        const cacheKey = `${startDate}_${endDate}_${saleSource}`;

        // Check in-memory report cache (saves 100% of Firestore reads on re-visit)
        if (!forceRefresh) {
            const cached = reportCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < ttl)) {
                setServerReport(cached.serverReport);
                setAllSales(cached.sales);
                setAllExpenses(cached.expenses);
                setAllReturns(cached.returns);
                setAllCustomerPayments(cached.customerPayments);
                setAllSupplierPayments(cached.supplierPayments);
                setAllPurchases(cached.purchases);
                setAllReturnedItems(cached.returnedItems);

                if (masterDataCache && (Date.now() - masterDataCache.timestamp < MASTER_DATA_TTL)) {
                    setAllProducts(masterDataCache.products);
                    setAllCustomers(masterDataCache.customers);
                    setAllSuppliers(masterDataCache.suppliers);
                }
                setLoading(false);
                return;
            }
        }

        isFetchingRef.current = true;
        setLoading(true);

        const startObj = new Date(startTime);
        const endObj = new Date(endTime);
        const startTimestamp = Timestamp.fromDate(startObj);
        const endTimestamp = Timestamp.fromDate(endObj);

        // Robust fetch: never let composite index errors crash data fetching
        const fetchCol = async <T>(colName: string, dateField?: string): Promise<T[]> => {
            try {
                let items: any[] = [];
                if (dateField) {
                    try {
                        const q = query(
                            collection(db, colName),
                            where(dateField, '>=', startTimestamp),
                            where(dateField, '<=', endTimestamp)
                        );
                        const snap = await getDocs(q);
                        items = snap.docs.map(doc => ({
                            ...normalizeFirestoreDates<any>(doc.data()),
                            id: doc.id
                        }));
                    } catch (rangeErr) {
                        console.warn(`[useReportsData] Range query on ${colName}.${dateField} failed, trying full collection fetch:`, rangeErr);
                        items = [];
                    }
                }

                if (!dateField || items.length === 0) {
                    try {
                        const fullSnap = await getDocs(collection(db, colName));
                        items = fullSnap.docs.map(doc => ({
                            ...normalizeFirestoreDates<any>(doc.data()),
                            id: doc.id
                        }));
                    } catch (fullErr) {
                        console.error(`[useReportsData] Full fetch failed for ${colName}:`, fullErr);
                        return [];
                    }
                }

                const activeItems = items.filter(item => !item.deleted);

                if (dateField) {
                    return activeItems.filter(item => {
                        const raw = item[dateField];
                        if (!raw) return false;
                        const t = raw instanceof Date 
                            ? raw.getTime() 
                            : (raw.toDate ? raw.toDate().getTime() : new Date(raw).getTime());
                        return !isNaN(t) && t >= startTime && t <= endTime;
                    }) as T[];
                }

                return activeItems as T[];
            } catch (err) {
                console.error(`[useReportsData] fetchCol unhandled error for ${colName}:`, err);
                return [];
            }
        };

        try {
            // Check master data cache first (reuse products, customers, suppliers)
            let productsData: Product[] = [];
            let customersData: Customer[] = [];
            let suppliersData: Supplier[] = [];

            if (!forceRefresh && masterDataCache && (Date.now() - masterDataCache.timestamp < MASTER_DATA_TTL)) {
                productsData = masterDataCache.products;
                customersData = masterDataCache.customers;
                suppliersData = masterDataCache.suppliers;
            } else {
                [productsData, customersData, suppliersData] = await Promise.all([
                    fetchCol<Product>('products'),
                    fetchCol<Customer>('customers'),
                    fetchCol<Supplier>('suppliers')
                ]);
                masterDataCache = {
                    products: productsData,
                    customers: customersData,
                    suppliers: suppliersData,
                    timestamp: Date.now()
                };
            }

            // Try server-side report first
            let reportData: ReportDataResponse | null = null;
            try {
                reportData = await fetchServerReport(startDate, endDate, saleSource);
                setServerReport(reportData);
                if (reportData?.sales) {
                    setAllSales(reportData.sales);
                }
            } catch (serverErr) {
                console.warn('[useReportsData] Server report failed or unauthorized, using direct Firestore:', serverErr);
                setServerReport(null);
            }

            // Fetch transactional date-specific collections in parallel
            const [
                salesData,
                expensesData,
                returnsData,
                customerPaymentsData,
                supplierPaymentsData,
                purchasesData,
                returnedItemsData
            ] = await Promise.all([
                reportData?.sales && reportData.sales.length > 0 ? Promise.resolve(reportData.sales) : fetchCol<Sale>('sales', 'date'),
                fetchCol<Expense>('expenses', 'date'),
                fetchCol<Return>('returns', 'returnDate'),
                fetchCol<CustomerPayment>('customerPayments', 'date'),
                fetchCol<SupplierPayment>('supplierPayments', 'date'),
                fetchCol<Purchase>('purchases', 'date'),
                fetchCol<ReturnedItem>('returnedItems', 'returnDate')
            ]);

            setAllSales(salesData);
            setAllProducts(productsData);
            setAllCustomers(customersData);
            setAllExpenses(expensesData);
            setAllReturns(returnsData);
            setAllCustomerPayments(customerPaymentsData);
            setAllSupplierPayments(supplierPaymentsData);
            setAllPurchases(purchasesData);
            setAllSuppliers(suppliersData);
            setAllReturnedItems(returnedItemsData);

            // Store in in-memory range cache
            reportCache.set(cacheKey, {
                serverReport: reportData,
                sales: salesData,
                expenses: expensesData,
                returns: returnsData,
                customerPayments: customerPaymentsData,
                supplierPayments: supplierPaymentsData,
                purchases: purchasesData,
                returnedItems: returnedItemsData,
                timestamp: Date.now()
            });

            // Evict oldest entries if cache exceeds 30 ranges
            if (reportCache.size > 30) {
                const oldestKey = reportCache.keys().next().value;
                if (oldestKey) reportCache.delete(oldestKey);
            }
        } catch (err) {
            console.error('[useReportsData] Critical failure in fetchReports:', err);
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    }, [startDate, endDate, startTime, endTime, saleSource]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    // Invalidate today's cache when any new transaction happens in the app
    useEffect(() => {
        const unsubscribe = subscribeDashboardRefresh(() => {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            for (const key of reportCache.keys()) {
                if (key.includes(todayStr)) {
                    reportCache.delete(key);
                }
            }
            masterDataCache = null;
            fetchReports(true);
        });
        return unsubscribe;
    }, [fetchReports]);

    const sales = useMemo(() => {
        return allSales
            .filter(s => {
                const raw = s.date;
                if (!raw) return false;
                const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
                return !isNaN(t) && t >= startTime && t <= endTime;
            })
            .filter(s => {
                if (saleSource === 'pos') return !s.source || s.source === 'pos';
                if (saleSource === 'online') return s.source === 'online';
                return true; // 'all'
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allSales, startTime, endTime, saleSource]);

    const expenses = useMemo(() => {
        return allExpenses
            .filter(e => {
                const raw = e.date;
                if (!raw) return false;
                const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
                return !isNaN(t) && t >= startTime && t <= endTime;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allExpenses, startTime, endTime]);

    const products = allProducts;

    const returns = useMemo(() => {
        return allReturns.filter(r => {
            const raw = r.returnDate;
            if (!raw) return false;
            const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
            return !isNaN(t) && t >= startTime && t <= endTime;
        });
    }, [allReturns, startTime, endTime]);

    const purchases = useMemo(() => {
        return allPurchases.filter(p => {
            const raw = p.date;
            if (!raw) return false;
            const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
            return !isNaN(t) && t >= startTime && t <= endTime;
        });
    }, [allPurchases, startTime, endTime]);

    const customerPayments = useMemo(() => {
        const custMap = new Map(allCustomers.map(c => [c.id, c.name]));
        return allCustomerPayments
            .filter(cp => {
                const raw = cp.date;
                if (!raw) return false;
                const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
                return !isNaN(t) && t >= startTime && t <= endTime;
            })
            .map(cp => ({
                ...cp,
                customerName: cp.customerName || (cp.customerId ? custMap.get(cp.customerId) : undefined) || 'Customer'
            }));
    }, [allCustomerPayments, allCustomers, startTime, endTime]);

    const supplierPayments = useMemo(() => {
        return allSupplierPayments.filter(sp => {
            const raw = sp.date;
            if (!raw) return false;
            const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
            return !isNaN(t) && t >= startTime && t <= endTime;
        });
    }, [allSupplierPayments, startTime, endTime]);

    const totalSupplierDebtSettled = useMemo(() => {
        return roundTo2(supplierPayments.reduce((sum, sp) => sum + (sp.amount || 0), 0));
    }, [supplierPayments]);

    const totalPurchasesPaid = useMemo(() => {
        return roundTo2(purchases.reduce((sum, p) => sum + (p.paidAmount !== undefined ? p.paidAmount : p.totalAmount || 0), 0));
    }, [purchases]);

    const returnedItems = useMemo(() => {
        const returnIds = returns.map(r => r.id);
        return allReturnedItems.filter(item => returnIds.includes(item.returnId));
    }, [allReturnedItems, returns]);

    const suppliers = allSuppliers;

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

    const totalRevenue = serverReport ? serverReport.totalRevenue : roundTo2(sales.reduce((sum, s) => sum + (s.finalAmount || 0), 0));
    const totalDiscounts = serverReport ? serverReport.totalDiscounts : roundTo2(sales.reduce((sum, s) => sum + (s.discount || 0), 0));
    const totalTransactions = serverReport ? serverReport.totalTransactions : sales.length;
    const avgOrderValue = serverReport ? serverReport.avgOrderValue : (totalTransactions > 0 ? roundTo2(totalRevenue / totalTransactions) : 0);
    const totalExpenses = serverReport ? serverReport.totalExpenses : roundTo2(expenses.filter(e => e.status === 'PAID').reduce((sum, e) => sum + (e.amount || 0), 0));
    const totalRefunds = serverReport ? serverReport.totalRefunds : roundTo2(returns.reduce((sum, r) => sum + (r.totalRefundAmount || 0), 0));
    const totalValueLost = serverReport ? serverReport.totalValueLost : roundTo2(returnedItems.reduce((sum, item) => sum + (item.valueLost || 0), 0));
    const totalSupplierDebt = serverReport ? serverReport.totalSupplierDebt : roundTo2(suppliers.reduce((sum, s) => sum + (s.balance || 0), 0));
    const totalPurchases = serverReport ? serverReport.totalPurchases : roundTo2(purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0));
    const totalDebtPaid = serverReport ? serverReport.totalDebtPaid : roundTo2(customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0));

    const totalCOGS = serverReport ? serverReport.totalCOGS : roundTo2(sales.reduce((sum, sale) => {
        const saleCost = (sale.items || []).reduce((itemSum, item) => {
            return itemSum + (item.quantity * (item.costPrice || 0));
        }, 0);
        return sum + saleCost;
    }, 0));

    const grossProfit = serverReport ? serverReport.grossProfit : roundTo2(totalRevenue - totalCOGS);
    const netProfit = serverReport ? serverReport.netProfit : roundTo2(grossProfit - totalExpenses - totalRefunds);

    const filteredSales = useMemo(() => {
        const lowerQuery = (salesSearchQuery || '').toLowerCase();
        return sales.filter(sale =>
            (sale.customerName || '').toLowerCase().includes(lowerQuery) ||
            (sale.id?.toString() || '').includes(lowerQuery)
        );
    }, [sales, salesSearchQuery]);

    const salesByDate = useMemo(() => {
        if (serverReport) return serverReport.salesByDate;
        const grouped: Record<string, number> = {};
        sales.forEach(sale => {
            const dateStr = format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'MMM dd');
            grouped[dateStr] = roundTo2((grouped[dateStr] || 0) + (sale.finalAmount || 0));
        });
        return Object.entries(grouped).map(([date, amount]) => ({ date, amount })).reverse();
    }, [sales, serverReport]);

    const salesByPayment = useMemo(() => {
        if (serverReport) return serverReport.salesByPayment;
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
    }, [sales, serverReport]);

    const inventoryAnalysis = useMemo(() => {
        const lowStockProducts = products
            .filter(p => p.quantity <= p.minStockLevel)
            .map(p => ({
                ...p,
                currentStock: p.quantity
            }))
            .sort((a, b) => {
                if (a.currentStock === 0 && b.currentStock !== 0) return -1;
                if (a.currentStock !== 0 && b.currentStock === 0) return 1;
                return a.currentStock - b.currentStock;
            });
        const expiringBatches: any[] = [];
        return { lowStockProducts, expiringBatches };
    }, [products]);

    const topProducts = useMemo(() => {
        if (serverReport) return serverReport.topProducts;
        const productStats: Record<string, { name: string, qty: number, revenue: number }> = {};
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
    }, [sales, serverReport]);

    return {
        startDate, setStartDate,
        endDate, setEndDate,
        sales, expenses, products, returns, returnedItems,
        loading,
        activePreset, handleSetPreset,
        activeTab, setActiveTab,
        salesSearchQuery, setSalesSearchQuery,
        saleSource, setSaleSource,
        totalRevenue, totalDiscounts, totalTransactions, avgOrderValue,
        totalExpenses, totalRefunds, totalValueLost,
        totalCOGS, grossProfit, netProfit,
        totalSupplierDebt, totalPurchases, totalDebtPaid,
        customerPayments, supplierPayments, purchases,
        totalSupplierDebtSettled, totalPurchasesPaid,
        filteredSales, salesByDate, salesByPayment,
        inventoryAnalysis, topProducts,
        refresh: () => fetchReports(true)
    };
}
