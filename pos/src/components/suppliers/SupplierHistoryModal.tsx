import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, 
    Search, 
    Calendar, 
    Package, 
    CreditCard, 
    ChevronDown, 
    ChevronUp, 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    Building, 
    Wallet,
    Receipt,
    ArrowDownLeft,
    Banknote
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { normalizeFirestoreDates } from '../../firebase/firestoreHelpers';
import { Supplier, Purchase, SupplierPayment, PaymentMethod } from '../../types';
import { format } from 'date-fns';

interface SupplierHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
}

export function SupplierHistoryModal({ isOpen, onClose, supplier }: SupplierHistoryModalProps) {
    const [activeTab, setActiveTab] = useState<'purchases' | 'settlements'>('purchases');
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [payments, setPayments] = useState<SupplierPayment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);

    const safeParseDate = (dateVal: any): Date => {
        if (!dateVal) return new Date();
        if (typeof dateVal?.toDate === 'function') return dateVal.toDate();
        if (dateVal instanceof Date) return dateVal;
        const parsed = new Date(dateVal);
        return isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    useEffect(() => {
        if (!isOpen || !supplier?.id) return;

        let cancelled = false;
        setIsLoading(true);
        setPurchases([]);
        setPayments([]);
        setSearchQuery('');
        setExpandedPurchaseId(null);
        setActiveTab('purchases');

        const loadData = async () => {
            try {
                // Fetch purchases for this supplier
                const purchasesQuery = query(
                    collection(db, 'purchases'),
                    where('supplierId', '==', supplier.id)
                );
                // Fetch supplier payments / settlements
                const paymentsQuery = query(
                    collection(db, 'supplierPayments'),
                    where('supplierId', '==', supplier.id)
                );

                const [purchasesSnap, paymentsSnap] = await Promise.all([
                    getDocs(purchasesQuery),
                    getDocs(paymentsQuery)
                ]);

                if (cancelled) return;

                const loadedPurchases: Purchase[] = [];
                purchasesSnap.forEach(docSnap => {
                    const data = normalizeFirestoreDates<any>(docSnap.data());
                    if (!data.deleted) {
                        loadedPurchases.push({ ...data, id: docSnap.id });
                    }
                });

                const loadedPayments: SupplierPayment[] = [];
                paymentsSnap.forEach(docSnap => {
                    const data = normalizeFirestoreDates<any>(docSnap.data());
                    if (!data.deleted) {
                        loadedPayments.push({ ...data, id: docSnap.id });
                    }
                });

                // Sort descending by date (newest first)
                loadedPurchases.sort((a, b) => safeParseDate(b.date).getTime() - safeParseDate(a.date).getTime());
                loadedPayments.sort((a, b) => safeParseDate(b.date).getTime() - safeParseDate(a.date).getTime());

                setPurchases(loadedPurchases);
                setPayments(loadedPayments);
            } catch (err) {
                console.error('[SupplierHistoryModal] Failed to load history:', err);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        loadData();

        return () => {
            cancelled = true;
        };
    }, [isOpen, supplier]);

    // Summary calculations
    const totals = useMemo(() => {
        const totalPurchased = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const totalPaidOnPurchases = purchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
        const totalSettlementsPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const currentBalance = supplier?.balance || 0;
        return {
            totalPurchased,
            totalPaidOnPurchases,
            totalSettlementsPaid,
            currentBalance
        };
    }, [purchases, payments, supplier]);

    // Filtered data based on search
    const filteredPurchases = useMemo(() => {
        if (!searchQuery.trim()) return purchases;
        const q = searchQuery.toLowerCase();
        return purchases.filter(p => {
            const invoiceMatch = (p.invoiceNo || '').toLowerCase().includes(q);
            const itemMatch = (p.items || []).some(item => (item.productName || '').toLowerCase().includes(q));
            const statusMatch = (p.status || '').toLowerCase().includes(q);
            return invoiceMatch || itemMatch || statusMatch;
        });
    }, [purchases, searchQuery]);

    const filteredPayments = useMemo(() => {
        if (!searchQuery.trim()) return payments;
        const q = searchQuery.toLowerCase();
        return payments.filter(p => {
            const noteMatch = (p.note || '').toLowerCase().includes(q);
            const methodMatch = (p.paymentMethod || '').toLowerCase().includes(q);
            const amountMatch = (p.amount || 0).toString().includes(q);
            return noteMatch || methodMatch || amountMatch;
        });
    }, [payments, searchQuery]);

    if (!isOpen || !supplier) return null;

    const toggleExpandPurchase = (id?: string) => {
        if (!id) return;
        setExpandedPurchaseId(prev => prev === id ? null : id);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="p-4 md:p-6 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                            <Building className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg md:text-xl font-bold text-slate-800">{supplier.companyName}</h2>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                    (supplier.balance || 0) > 0 
                                        ? 'bg-red-100 text-red-700 border border-red-200' 
                                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                }`}>
                                    {(supplier.balance || 0) > 0 ? `Debt: ₦${(supplier.balance || 0).toLocaleString()}` : 'Settled'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Contact: <span className="font-medium text-slate-700">{supplier.contactName}</span>
                                {supplier.phone && <span className="ml-2">• {supplier.phone}</span>}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-full transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* KPI Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 p-4 md:p-6 bg-white border-b border-slate-100">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <Package className="w-3.5 h-3.5 text-slate-400" /> Total Purchases
                        </p>
                        <p className="text-base md:text-xl font-black text-slate-800 mt-1">
                            ₦{totals.totalPurchased.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{purchases.length} invoice(s)</p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Total Settlements
                        </p>
                        <p className="text-base md:text-xl font-black text-emerald-600 mt-1">
                            ₦{totals.totalSettlementsPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{payments.length} payment(s)</p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <Receipt className="w-3.5 h-3.5 text-blue-500" /> Paid on Invoices
                        </p>
                        <p className="text-base md:text-xl font-black text-blue-600 mt-1">
                            ₦{totals.totalPaidOnPurchases.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">At time of purchase</p>
                    </div>

                    <div className={`p-3 rounded-xl border ${
                        totals.currentBalance > 0 
                            ? 'bg-red-50 border-red-200 text-red-700' 
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}>
                        <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider flex items-center gap-1 opacity-80">
                            <Wallet className="w-3.5 h-3.5" /> Current Balance
                        </p>
                        <p className="text-base md:text-xl font-black mt-1">
                            ₦{totals.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] opacity-75 mt-0.5">
                            {totals.currentBalance > 0 ? 'Outstanding debt' : 'Fully settled'}
                        </p>
                    </div>
                </div>

                {/* Tabs & Search Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 px-4 md:px-6 pt-3 pb-2 border-b border-slate-200 bg-white">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('purchases')}
                            className={`py-2 px-4 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 transition-all ${
                                activeTab === 'purchases'
                                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                                    : 'text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            <Package className="w-4 h-4" />
                            Purchases ({purchases.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('settlements')}
                            className={`py-2 px-4 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 transition-all ${
                                activeTab === 'settlements'
                                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                                    : 'text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            <CreditCard className="w-4 h-4" />
                            Settlements & Payments ({payments.length})
                        </button>
                    </div>

                    <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder={activeTab === 'purchases' ? "Search invoice or item..." : "Search note or method..."}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-4 md:p-6 overflow-y-auto flex-1">
                    {isLoading ? (
                        <div className="py-16 text-center text-slate-400">
                            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm font-medium">Loading history...</p>
                        </div>
                    ) : activeTab === 'purchases' ? (
                        /* PURCHASES TAB */
                        filteredPurchases.length === 0 ? (
                            <div className="py-16 text-center text-slate-400">
                                <Package className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p className="text-sm font-medium">
                                    {searchQuery ? 'No purchases match your search' : 'No purchase records found for this supplier'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Desktop Table */}
                                <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                            <tr>
                                                <th className="py-3 px-4">Date</th>
                                                <th className="py-3 px-4">Invoice #</th>
                                                <th className="py-3 px-4">Items Count</th>
                                                <th className="py-3 px-4 text-right">Total Amount</th>
                                                <th className="py-3 px-4 text-right">Paid</th>
                                                <th className="py-3 px-4 text-right">Balance</th>
                                                <th className="py-3 px-4 text-center">Status</th>
                                                <th className="py-3 px-4 text-center">Details</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredPurchases.map(purchase => {
                                                const isExpanded = expandedPurchaseId === purchase.id;
                                                const dateObj = safeParseDate(purchase.date);
                                                return (
                                                    <React.Fragment key={purchase.id}>
                                                        <tr 
                                                            onClick={() => toggleExpandPurchase(purchase.id)}
                                                            className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 font-medium' : ''}`}
                                                        >
                                                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                                                <span className="flex items-center gap-1.5">
                                                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                                    {format(dateObj, 'MMM dd, yyyy')}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                                                                {purchase.invoiceNo}
                                                            </td>
                                                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                                                {(purchase.items || []).length} item(s)
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                                                                ₦{(purchase.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="py-3 px-4 text-right text-emerald-600 font-bold whitespace-nowrap">
                                                                ₦{(purchase.paidAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="py-3 px-4 text-right text-red-600 font-bold whitespace-nowrap">
                                                                ₦{(purchase.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                                                    purchase.status === 'PAID'
                                                                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                                        : purchase.status === 'PARTIAL'
                                                                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                                                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                                                }`}>
                                                                    {purchase.status}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 text-center">
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); toggleExpandPurchase(purchase.id); }}
                                                                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors"
                                                                >
                                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr className="bg-slate-50/50">
                                                                <td colSpan={8} className="p-4 border-t border-slate-200">
                                                                    <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-xs">
                                                                        <h4 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                                                                            <Package className="w-3.5 h-3.5 text-emerald-600" />
                                                                            Purchased Products ({purchase.items?.length || 0})
                                                                        </h4>
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full text-left text-xs">
                                                                                <thead className="text-slate-400 border-b border-slate-100">
                                                                                    <tr>
                                                                                        <th className="pb-1.5">Product Name</th>
                                                                                        <th className="pb-1.5 text-center">Qty</th>
                                                                                        <th className="pb-1.5 text-right">Cost Price</th>
                                                                                        <th className="pb-1.5 text-right">Selling Price</th>
                                                                                        <th className="pb-1.5 text-right">Subtotal</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-slate-50">
                                                                                    {(purchase.items || []).map((item, idx) => (
                                                                                        <tr key={idx} className="hover:bg-slate-50/50">
                                                                                            <td className="py-1.5 font-medium text-slate-700">{item.productName}</td>
                                                                                            <td className="py-1.5 text-center font-bold text-slate-600">{item.quantity}</td>
                                                                                            <td className="py-1.5 text-right text-slate-600">₦{(item.costPrice || 0).toLocaleString()}</td>
                                                                                            <td className="py-1.5 text-right text-slate-600">₦{(item.sellingPrice || 0).toLocaleString()}</td>
                                                                                            <td className="py-1.5 text-right font-bold text-slate-800">₦{(item.total || 0).toLocaleString()}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Cards View */}
                                <div className="md:hidden space-y-3">
                                    {filteredPurchases.map(purchase => {
                                        const isExpanded = expandedPurchaseId === purchase.id;
                                        const dateObj = safeParseDate(purchase.date);
                                        return (
                                            <div 
                                                key={purchase.id} 
                                                className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-mono font-bold text-xs text-slate-800">{purchase.invoiceNo}</p>
                                                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                                            <Calendar className="w-3 h-3 text-slate-400" />
                                                            {format(dateObj, 'MMM dd, yyyy')}
                                                        </p>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                                        purchase.status === 'PAID'
                                                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                            : purchase.status === 'PARTIAL'
                                                                ? 'bg-amber-100 text-amber-700 border-amber-200'
                                                                : 'bg-slate-100 text-slate-600 border-slate-200'
                                                    }`}>
                                                        {purchase.status}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-100 text-xs">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 block font-bold uppercase">Total</span>
                                                        <span className="font-bold text-slate-800">₦{(purchase.totalAmount || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 block font-bold uppercase">Paid</span>
                                                        <span className="font-bold text-emerald-600">₦{(purchase.paidAmount || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 block font-bold uppercase">Balance</span>
                                                        <span className="font-bold text-red-600">₦{(purchase.balance || 0).toLocaleString()}</span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => toggleExpandPurchase(purchase.id)}
                                                    className="w-full py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                                >
                                                    {(purchase.items || []).length} items {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                </button>

                                                {isExpanded && (
                                                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                                        {(purchase.items || []).map((item, idx) => (
                                                            <div key={idx} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded-lg">
                                                                <div>
                                                                    <p className="font-medium text-slate-700">{item.productName}</p>
                                                                    <p className="text-[10px] text-slate-400">{item.quantity} x ₦{(item.costPrice || 0).toLocaleString()}</p>
                                                                </div>
                                                                <span className="font-bold text-slate-800">₦{(item.total || 0).toLocaleString()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    ) : (
                        /* SETTLEMENTS & PAYMENTS TAB */
                        filteredPayments.length === 0 ? (
                            <div className="py-16 text-center text-slate-400">
                                <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p className="text-sm font-medium">
                                    {searchQuery ? 'No payments match your search' : 'No settlement or payment records found for this supplier'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Desktop Table */}
                                <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                            <tr>
                                                <th className="py-3 px-4">Date</th>
                                                <th className="py-3 px-4">Type</th>
                                                <th className="py-3 px-4">Method</th>
                                                <th className="py-3 px-4 text-right">Amount Paid</th>
                                                <th className="py-3 px-4">Note / Reference</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredPayments.map(payment => {
                                                const dateObj = safeParseDate(payment.date);
                                                const isPurchasePayment = !!payment.purchaseId || (payment.note || '').toLowerCase().includes('purchase');
                                                return (
                                                    <tr key={payment.id} className="hover:bg-slate-50/80 transition-colors">
                                                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                                            <span className="flex items-center gap-1.5">
                                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                                {format(dateObj, 'MMM dd, yyyy')}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                                                isPurchasePayment
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            }`}>
                                                                {isPurchasePayment ? 'Invoice Payment' : 'Debt Settlement'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                                                payment.paymentMethod === PaymentMethod.CASH
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : payment.paymentMethod === PaymentMethod.TRANSFER
                                                                        ? 'bg-indigo-100 text-indigo-800'
                                                                        : 'bg-blue-100 text-blue-800'
                                                            }`}>
                                                                {payment.paymentMethod || 'CASH'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-right font-black text-slate-900 text-sm whitespace-nowrap">
                                                            ₦{(payment.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="py-3 px-4 text-slate-600 font-medium">
                                                            {payment.note || <span className="text-slate-400 italic">No notes</span>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Cards View */}
                                <div className="md:hidden space-y-2.5">
                                    {filteredPayments.map(payment => {
                                        const dateObj = safeParseDate(payment.date);
                                        const isPurchasePayment = !!payment.purchaseId || (payment.note || '').toLowerCase().includes('purchase');
                                        return (
                                            <div 
                                                key={payment.id} 
                                                className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                                            isPurchasePayment
                                                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        }`}>
                                                            {isPurchasePayment ? 'Invoice Payment' : 'Debt Settlement'}
                                                        </span>
                                                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                                                            <Calendar className="w-3 h-3 text-slate-400" />
                                                            {format(dateObj, 'MMM dd, yyyy')}
                                                        </p>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                        payment.paymentMethod === PaymentMethod.CASH
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : payment.paymentMethod === PaymentMethod.TRANSFER
                                                                ? 'bg-indigo-100 text-indigo-800'
                                                                : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {payment.paymentMethod || 'CASH'}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-baseline pt-1 border-t border-slate-100">
                                                    <span className="text-xs text-slate-500">Amount Paid</span>
                                                    <span className="text-base font-black text-slate-900">
                                                        ₦{(payment.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>

                                                {payment.note && (
                                                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg font-medium">
                                                        {payment.note}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 md:p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs md:text-sm font-bold rounded-xl transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
