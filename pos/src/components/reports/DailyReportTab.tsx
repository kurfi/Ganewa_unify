import React, { useState, useMemo } from 'react';
import { 
    Calendar, TrendingUp, CreditCard, Wallet, Printer, FileText, 
    ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight,
    ShoppingBag, RefreshCw, Building2, Truck, RotateCcw,
    DollarSign, CheckCircle2, UserCheck, ShieldCheck
} from 'lucide-react';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { savePdf } from '../../services/pdfService';
import { useToast } from '../../contexts/ToastContext';
import { Sale, Expense, Return, CustomerPayment, SupplierPayment, Purchase, PaymentMethod } from '../../types';

interface DailyReportTabProps {
    selectedDate: string;
    onDateChange: (date: string) => void;
    sales: Sale[];
    expenses: Expense[];
    returns: Return[];
    customerPayments: CustomerPayment[];
    supplierPayments: SupplierPayment[];
    purchases: Purchase[];
    loading: boolean;
    totalRevenue: number;
    totalExpenses: number;
    totalRefunds: number;
    totalDiscounts: number;
    totalDebtPaid: number;
    totalSupplierDebtSettled: number;
    totalPurchasesPaid: number;
    salesByPayment: Array<{ name: string; value: number }>;
}

export const DailyReportTab: React.FC<DailyReportTabProps> = ({
    selectedDate,
    onDateChange,
    sales,
    expenses,
    returns,
    customerPayments,
    supplierPayments,
    purchases,
    loading,
    totalRevenue,
    totalExpenses,
    totalRefunds,
    totalDiscounts,
    totalDebtPaid,
    totalSupplierDebtSettled,
    totalPurchasesPaid,
    salesByPayment
}) => {
    const { showToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSubTab, setActiveSubTab] = useState<'summary' | 'sales' | 'expenses' | 'debt_collected' | 'supplier_debt_paid' | 'purchases' | 'refunds'>('summary');

    // 1. Paid expenses filter
    const paidExpenses = useMemo(() => {
        return expenses.filter(e => e.status === 'PAID');
    }, [expenses]);

    const pendingExpenses = useMemo(() => {
        return expenses.filter(e => e.status === 'PENDING');
    }, [expenses]);

    // 2. Compute day-level totals locally from raw arrays (DO NOT rely on server-aggregated props
    //    which may be stale or cover a different date range than the single day selected here)

    // Total sales revenue for this day
    const daySalesRevenue = useMemo(() => {
        return sales.reduce((sum, s) => sum + Number(s.finalAmount || 0), 0);
    }, [sales]);

    // Total PAID expenses for this day
    const dayExpensesPaid = useMemo(() => {
        return paidExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    }, [paidExpenses]);

    // Total refunds for this day
    const dayRefunds = useMemo(() => {
        return returns.reduce((sum, r) => sum + Number(r.totalRefundAmount || 0), 0);
    }, [returns]);

    // Purchases total paid for today
    // ─────────────────────────────────────────────────────────────────────────
    // ROOT-CAUSE FIX: Double-counting in outflows.
    //
    // NewPurchaseModal creates a `purchases` doc (with paidAmount) AND a
    // `supplierPayments` doc (with purchaseId) for the exact same money.
    // The old code summed BOTH dayPurchasesPaid (from purchases.paidAmount)
    // AND daySupplierDebtSettled (all supplierPayments), double-counting every
    // purchase payment.
    //
    // Correct model:
    //   A. SP records that reference a purchase (purchaseId set, or note
    //      contains "purchase") = the purchase payment.  Count these as
    //      "Purchases Paid" and NOT in "Supplier Debt Settled".
    //   B. SP records with no purchase reference = pure old-debt settlement.
    //      Count these as "Supplier Debt Settled".
    //   C. Legacy purchases (pre-SP system) whose paidAmount has NO matching
    //      SP record → add their paidAmount to "Purchases Paid" to avoid
    //      under-counting.
    // ─────────────────────────────────────────────────────────────────────────

    // Set of purchase IDs already covered by a supplier-payment record
    const spCoveredPurchaseIds = useMemo(() => {
        const ids = new Set<string>();
        supplierPayments.forEach(sp => { if (sp.purchaseId) ids.add(sp.purchaseId); });
        return ids;
    }, [supplierPayments]);

    // A. SP records linked to a specific purchase (purchase payment via SP)
    const dayPurchaseSP = useMemo(() => {
        return supplierPayments
            .filter(sp => sp.purchaseId || (sp.note || '').toLowerCase().includes('purchase'))
            .reduce((sum, sp) => sum + Number(sp.amount || 0), 0);
    }, [supplierPayments]);

    // B. Pure debt settlements — SP records with no purchase link
    const daySupplierDebtSettled = useMemo(() => {
        return supplierPayments
            .filter(sp => !sp.purchaseId && !(sp.note || '').toLowerCase().includes('purchase'))
            .reduce((sum, sp) => sum + Number(sp.amount || 0), 0);
    }, [supplierPayments]);

    // C. Legacy: purchase paidAmounts for purchases that have no SP record yet
    const dayLegacyPurchasePaid = useMemo(() => {
        return purchases
            .filter(p => p.id && !spCoveredPurchaseIds.has(p.id))
            .reduce((sum, p) => {
                const paid = p.paidAmount !== undefined
                    ? p.paidAmount
                    : (p.status === 'PAID' ? p.totalAmount : 0);
                return sum + Number(paid || 0);
            }, 0);
    }, [purchases, spCoveredPurchaseIds]);

    // Total purchases paid = purchase-linked SPs + legacy paidAmounts
    const dayPurchasesPaid = useMemo(() => {
        return dayPurchaseSP + dayLegacyPurchasePaid;
    }, [dayPurchaseSP, dayLegacyPurchasePaid]);

    const dayPurchasesTotal = useMemo(() => {
        return purchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);
    }, [purchases]);

    // 3. Customer debt settled to me (debt collected)
    const dayCustomerDebtSettled = useMemo(() => {
        return customerPayments.reduce((sum, cp) => sum + Number(cp.amount || 0), 0);
    }, [customerPayments]);

    // 5. Total Inflows & Outflows — use locally-computed day figures only
    const totalInflow = useMemo(() => {
        return daySalesRevenue + dayCustomerDebtSettled;
    }, [daySalesRevenue, dayCustomerDebtSettled]);

    // Outflow = Expenses + Refunds + Supplier Debt Settled + Purchases Paid
    //   (no double-counting: dayPurchasesPaid and daySupplierDebtSettled are
    //    now mutually exclusive subsets of supplierPayments + legacy purchases)
    const totalOutflow = useMemo(() => {
        return dayExpensesPaid + dayRefunds + daySupplierDebtSettled + dayPurchasesPaid;
    }, [dayExpensesPaid, dayRefunds, daySupplierDebtSettled, dayPurchasesPaid]);

    // 6. Remaining Balance for the Day:
    // Remaining Balance = (Total Sales + Debt Settled to Me) - (Expenses + Refunds + Debt I Settled + Purchases Paid)
    const remainingBalance = useMemo(() => {
        return totalInflow - totalOutflow;
    }, [totalInflow, totalOutflow]);


    // 7. Payment Methods Breakdown for Sales
    const paymentBreakdown = useMemo(() => {
        const breakdown: Record<string, number> = {
            CASH: 0,
            TRANSFER: 0,
            CARD: 0,
            CREDIT: 0
        };

        sales.forEach(sale => {
            if (sale.paymentMethod === PaymentMethod.MULTIPAY && Array.isArray(sale.paymentMethods)) {
                sale.paymentMethods.forEach(pm => {
                    const method = (pm.method || 'CASH').toUpperCase();
                    breakdown[method] = (breakdown[method] || 0) + Number(pm.amount || 0);
                });
            } else {
                const method = (sale.paymentMethod || 'CASH').toUpperCase();
                breakdown[method] = (breakdown[method] || 0) + Number(sale.finalAmount || 0);
            }
        });

        return breakdown;
    }, [sales]);

    // 8. Physical Cash In Hand (Register Cash) calculation
    const cashInflow = useMemo(() => {
        const cashSales = paymentBreakdown['CASH'] || 0;
        const cashDebtSettledToMe = customerPayments
            .filter(cp => !cp.paymentMethod || cp.paymentMethod === PaymentMethod.CASH)
            .reduce((sum, cp) => sum + Number(cp.amount || 0), 0);
        return cashSales + cashDebtSettledToMe;
    }, [paymentBreakdown, customerPayments]);

    const cashOutflow = useMemo(() => {
        const cashExp = paidExpenses
            .filter(e => !e.paymentMethod || e.paymentMethod === 'CASH')
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const cashRef = returns
            .filter(r => !r.paymentMethod || r.paymentMethod === 'CASH')
            .reduce((sum, r) => sum + Number(r.totalRefundAmount || 0), 0);
        const cashSuppDebt = supplierPayments
            .filter(sp => !sp.paymentMethod || sp.paymentMethod === PaymentMethod.CASH)
            .reduce((sum, sp) => sum + Number(sp.amount || 0), 0);
        return cashExp + cashRef + cashSuppDebt;
    }, [paidExpenses, returns, supplierPayments]);

    const cashInHandToday = useMemo(() => {
        return cashInflow - cashOutflow;
    }, [cashInflow, cashOutflow]);

    // 9. Digital / Bank Flow
    const digitalInflow = useMemo(() => {
        const bankSales = (paymentBreakdown['TRANSFER'] || 0) + (paymentBreakdown['CARD'] || 0);
        const bankDebtSettledToMe = customerPayments
            .filter(cp => cp.paymentMethod === PaymentMethod.TRANSFER || cp.paymentMethod === PaymentMethod.CARD)
            .reduce((sum, cp) => sum + Number(cp.amount || 0), 0);
        return bankSales + bankDebtSettledToMe;
    }, [paymentBreakdown, customerPayments]);

    const digitalOutflow = useMemo(() => {
        const bankExp = paidExpenses
            .filter(e => e.paymentMethod === 'TRANSFER' || e.paymentMethod === 'CARD')
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const bankRef = returns
            .filter(r => r.paymentMethod === 'TRANSFER' || r.paymentMethod === 'CARD')
            .reduce((sum, r) => sum + Number(r.totalRefundAmount || 0), 0);
        const bankSuppDebt = supplierPayments
            .filter(sp => sp.paymentMethod === PaymentMethod.TRANSFER || sp.paymentMethod === PaymentMethod.CARD)
            .reduce((sum, sp) => sum + Number(sp.amount || 0), 0);
        return bankExp + bankRef + bankSuppDebt;
    }, [paidExpenses, returns, supplierPayments]);

    // Navigation handlers
    const handlePrevDay = () => {
        try {
            const current = parseISO(selectedDate);
            onDateChange(format(subDays(current, 1), 'yyyy-MM-dd'));
        } catch {
            onDateChange(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
        }
    };

    const handleNextDay = () => {
        try {
            const current = parseISO(selectedDate);
            onDateChange(format(addDays(current, 1), 'yyyy-MM-dd'));
        } catch {
            onDateChange(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
        }
    };

    const handleToday = () => {
        onDateChange(format(new Date(), 'yyyy-MM-dd'));
    };

    const handleYesterday = () => {
        onDateChange(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    };

    // Filtered lists for search query
    const filteredSales = useMemo(() => {
        if (!searchQuery.trim()) return sales;
        const q = searchQuery.toLowerCase();
        return sales.filter(s => 
            (s.customerName || '').toLowerCase().includes(q) ||
            (s.id || '').toString().toLowerCase().includes(q) ||
            (s.invoiceNumber || '').toLowerCase().includes(q)
        );
    }, [sales, searchQuery]);

    const filteredExpenses = useMemo(() => {
        if (!searchQuery.trim()) return paidExpenses;
        const q = searchQuery.toLowerCase();
        return paidExpenses.filter(e => 
            (e.note || '').toLowerCase().includes(q) ||
            (e.category || '').toLowerCase().includes(q)
        );
    }, [paidExpenses, searchQuery]);

    const filteredCustomerPayments = useMemo(() => {
        if (!searchQuery.trim()) return customerPayments;
        const q = searchQuery.toLowerCase();
        return customerPayments.filter(cp => 
            (cp.customerName || (cp as any).customer?.name || '').toLowerCase().includes(q) ||
            (cp.note || '').toLowerCase().includes(q)
        );
    }, [customerPayments, searchQuery]);

    const filteredSupplierPayments = useMemo(() => {
        if (!searchQuery.trim()) return supplierPayments;
        const q = searchQuery.toLowerCase();
        return supplierPayments.filter(sp => 
            (sp.supplierName || '').toLowerCase().includes(q) ||
            (sp.note || '').toLowerCase().includes(q)
        );
    }, [supplierPayments, searchQuery]);

    const filteredPurchases = useMemo(() => {
        if (!searchQuery.trim()) return purchases;
        const q = searchQuery.toLowerCase();
        return purchases.filter(p => 
            (p.supplierName || '').toLowerCase().includes(q) ||
            (p.invoiceNo || '').toLowerCase().includes(q)
        );
    }, [purchases, searchQuery]);

    // Comprehensive PDF Generation in English
    const generateDailyPDF = async () => {
        const doc = new jsPDF();
        const formattedDate = format(parseISO(selectedDate), 'EEEE, MMMM dd, yyyy');

        // Header Title
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text("GANEWA SHOPPING MALL KURFI", 14, 18);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text("DAILY FINANCIAL & BUSINESS REPORT", 14, 25);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Report Date: ${formattedDate} (${selectedDate})`, 14, 32);

        // Financial Summary Table
        autoTable(doc, {
            startY: 38,
            head: [['Financial Flow Category', 'Amount (NGN)']],
            body: [
                ['Total Sales Revenue', `N${daySalesRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Customer Debt Settled to Me (Debt Collected)', `N${dayCustomerDebtSettled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['TOTAL INFLOWS', `N${totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Operating Expenses Paid', `N${dayExpensesPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Customer Refunds Issued', `N${dayRefunds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Purchases Paid (Restocking)', `N${dayPurchasesPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Supplier Debt Settled (Old Debt Only)', `N${daySupplierDebtSettled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['TOTAL OUTFLOWS', `N${totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['NET REMAINING BALANCE FOR THE DAY', `N${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Physical Cash in Hand (Estimated Register Cash)', `N${cashInHandToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],

            ],
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42] },
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index === 1) {
                    const rowText = data.row.cells[0].text[0];
                    if (rowText.includes('TOTAL INFLOWS') || rowText.includes('NET REMAINING')) {
                        data.cell.styles.textColor = [16, 185, 129];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (rowText.includes('TOTAL OUTFLOWS')) {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        let yPos = (doc as any).lastAutoTable.finalY + 10;

        // Sales Payment Method Breakdown Table
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Sales Payment Breakdown", 14, yPos);
        yPos += 4;

        autoTable(doc, {
            startY: yPos,
            head: [['Payment Method', 'Amount (NGN)']],
            body: [
                ['Cash', `N${(paymentBreakdown['CASH'] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Bank Transfer', `N${(paymentBreakdown['TRANSFER'] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Debit/POS Card', `N${(paymentBreakdown['CARD'] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ['Credit / Store Debt', `N${(paymentBreakdown['CREDIT'] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
            ],
            theme: 'striped',
            headStyles: { fillColor: [71, 85, 105] },
            styles: { fontSize: 9 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;

        // Itemized Expenses
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Operating Expenses (${paidExpenses.length} items)`, 14, yPos);
        yPos += 4;

        autoTable(doc, {
            startY: yPos,
            head: [['Time', 'Category', 'Description / Note', 'Amount (NGN)']],
            body: paidExpenses.length === 0 ? [['-', '-', 'No expenses recorded for this date.', 'N0.00']] : paidExpenses.map(e => [
                format((e.date as any)?.toDate?.() ?? new Date(e.date), 'HH:mm'),
                e.category || 'General',
                e.note || '-',
                `N${Number(e.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ]),
            theme: 'striped',
            headStyles: { fillColor: [220, 38, 38] },
            styles: { fontSize: 8 }
        });

        const fileName = `Daily_Report_${selectedDate}.pdf`;
        try {
            await savePdf(doc, fileName, 'reports');
            showToast('Daily PDF report generated successfully!', 'success');
        } catch (err) {
            console.error('PDF generation error:', err);
            showToast('Failed to generate PDF report.', 'error');
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const isCurrentDay = isToday(parseISO(selectedDate));

    return (
        <div className="space-y-6">
            {/* Top Date Navigation Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                        onClick={handlePrevDay}
                        title="Previous Day"
                        className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Prev Day</span>
                    </button>

                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex-1 md:flex-none">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => onDateChange(e.target.value)}
                            className="bg-transparent text-slate-800 font-bold text-sm outline-none cursor-pointer"
                        />
                    </div>

                    <button
                        onClick={handleNextDay}
                        title="Next Day"
                        className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                    >
                        <span className="hidden sm:inline">Next Day</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Quick Presets & Export Actions */}
                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <button
                        onClick={handleToday}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isCurrentDay 
                                ? 'bg-emerald-600 text-white shadow-sm' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Today
                    </button>
                    <button
                        onClick={handleYesterday}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                    >
                        Yesterday
                    </button>
                    <button
                        onClick={generateDailyPDF}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        <span>PDF Report</span>
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                    </button>
                </div>
            </div>

            {/* MAIN EXECUTIVE DASHBOARD: REMAINING BALANCE & TOTALS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. TOTAL INFLOWS (Sales + Customer Debt Settled to Me) */}
                <div className="bg-gradient-to-br from-emerald-50 to-white p-5 rounded-2xl border-2 border-emerald-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <span className="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider mb-1">
                                Money In (Inflows)
                            </span>
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Daily Inflows</h2>
                        </div>
                        <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="mt-2">
                        <h3 className="text-2xl lg:text-3xl font-black text-emerald-700">
                            ₦{totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                            Sales: ₦{daySalesRevenue.toLocaleString()} + Debt Settled: ₦{dayCustomerDebtSettled.toLocaleString()}
                        </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-emerald-100 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
                            <span className="text-slate-500 font-medium block">Total Sales:</span>
                            <span className="font-bold text-slate-800">₦{daySalesRevenue.toLocaleString()}</span>
                            <span className="text-[10px] text-slate-400 block font-mono">({sales.length} sales)</span>
                        </div>
                        <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
                            <span className="text-slate-500 font-medium block">Debt Settled to Me:</span>
                            <span className="font-bold text-emerald-700">₦{dayCustomerDebtSettled.toLocaleString()}</span>
                            <span className="text-[10px] text-slate-400 block font-mono">({customerPayments.length} payments)</span>
                        </div>
                    </div>
                </div>

                {/* 2. TOTAL OUTFLOWS (Expenses + Refunds + Supplier Debt Settled + Purchases) */}
                <div className="bg-gradient-to-br from-rose-50 to-white p-5 rounded-2xl border-2 border-rose-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <span className="inline-block bg-rose-100 text-rose-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider mb-1">
                                Money Out (Outflows)
                            </span>
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Daily Outflows</h2>
                        </div>
                        <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-sm">
                            <CreditCard className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="mt-2">
                        <h3 className="text-2xl lg:text-3xl font-black text-rose-600">
                            ₦{totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                            Expenses + Purchases Paid + Old Debt Settled + Refunds
                        </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-rose-100 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                            <span className="text-slate-500 font-medium block">Operating Expenses:</span>
                            <span className="font-bold text-slate-800">₦{dayExpensesPaid.toLocaleString()}</span>
                        </div>
                        <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                            <span className="text-slate-500 font-medium block">Purchases Paid (Restocking):</span>
                            <span className="font-bold text-slate-800">₦{dayPurchasesPaid.toLocaleString()}</span>
                        </div>
                        <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                            <span className="text-slate-500 font-medium block">Old Supplier Debt Settled:</span>
                            <span className="font-bold text-slate-800">₦{daySupplierDebtSettled.toLocaleString()}</span>
                        </div>
                        <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                            <span className="text-slate-500 font-medium block">Refunds Issued:</span>
                            <span className="font-bold text-rose-700">₦{dayRefunds.toLocaleString()}</span>
                        </div>
                    </div>

                </div>

                {/* 3. NET REMAINING BALANCE FOR THE DAY */}
                <div className={`p-5 rounded-2xl border-2 shadow-sm relative overflow-hidden ${
                    remainingBalance >= 0 
                        ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200' 
                        : 'bg-gradient-to-br from-red-50 to-white border-red-300'
                }`}>
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider mb-1 ${
                                remainingBalance >= 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-red-100 text-red-800'
                            }`}>
                                Remaining Balance
                            </span>
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Cash Flow For The Day</h2>
                        </div>
                        <div className={`p-2.5 rounded-xl shadow-sm text-white ${remainingBalance >= 0 ? 'bg-indigo-600' : 'bg-red-600'}`}>
                            <Wallet className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="mt-2">
                        <h3 className={`text-2xl lg:text-3xl font-black ${remainingBalance >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                            ₦{remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">
                            Inflows (₦{totalInflow.toLocaleString()}) − Outflows (₦{totalOutflow.toLocaleString()})
                        </p>
                    </div>

                    {/* Breakdown of Cash vs Digital remaining */}
                    <div className="mt-4 pt-3 border-t border-indigo-100 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Cash In Hand:</span>
                            <span className={`font-black text-xs ${cashInHandToday >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                ₦{cashInHandToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Bank / Digital Flow:</span>
                            <span className={`font-black text-xs ${(digitalInflow - digitalOutflow) >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                                ₦{(digitalInflow - digitalOutflow).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* DETAILED LOGS & TRANSACTIONS BREAKDOWN */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Navigation Sub-Tabs Header */}
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
                    <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
                        <button
                            onClick={() => setActiveSubTab('summary')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                activeSubTab === 'summary' 
                                    ? 'bg-slate-900 text-white' 
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            Summary
                        </button>
                        <button
                            onClick={() => setActiveSubTab('sales')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                activeSubTab === 'sales' 
                                    ? 'bg-emerald-600 text-white' 
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                        >
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Sales ({sales.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveSubTab('expenses')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                activeSubTab === 'expenses' 
                                    ? 'bg-rose-600 text-white' 
                                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                        >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Expenses ({paidExpenses.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveSubTab('debt_collected')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                activeSubTab === 'debt_collected' 
                                    ? 'bg-teal-600 text-white' 
                                    : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                            }`}
                        >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Debt Settled to Me ({customerPayments.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveSubTab('supplier_debt_paid')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                activeSubTab === 'supplier_debt_paid' 
                                    ? 'bg-amber-600 text-white' 
                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            }`}
                        >
                            <Building2 className="w-3.5 h-3.5" />
                            <span>Debt I Settled ({supplierPayments.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveSubTab('purchases')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                activeSubTab === 'purchases' 
                                    ? 'bg-indigo-600 text-white' 
                                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }`}
                        >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Purchases ({purchases.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveSubTab('refunds')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                activeSubTab === 'refunds' 
                                    ? 'bg-purple-600 text-white' 
                                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                            }`}
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Refunds ({returns.length})</span>
                        </button>
                    </div>

                    <div className="w-full md:w-64">
                        <input
                            type="text"
                            placeholder="Filter records..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                        <span className="text-xs font-medium">Loading report records...</span>
                    </div>
                ) : (
                    <div>
                        {/* 1. OVERALL SUMMARY VIEW */}
                        {activeSubTab === 'summary' && (
                            <div className="p-6 space-y-6">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Comprehensive Daily Activity Breakdown
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Left: INFLOWS SUMMARY */}
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                                        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                                            <span className="font-bold text-emerald-700 text-sm flex items-center gap-1.5">
                                                <ArrowUpRight className="w-4 h-4" /> Total Inflows (Money In)
                                            </span>
                                            <span className="font-black text-emerald-700 text-base">
                                                ₦{totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        <div className="space-y-2 text-xs">
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-slate-600">Total Sales Revenue:</span>
                                                <span className="font-bold text-slate-800">₦{daySalesRevenue.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 pl-4 text-slate-500">
                                                <span>• Cash Sales:</span>
                                                <span className="font-medium">₦{(paymentBreakdown['CASH'] || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 pl-4 text-slate-500">
                                                <span>• Bank Transfer Sales:</span>
                                                <span className="font-medium">₦{(paymentBreakdown['TRANSFER'] || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 pl-4 text-slate-500">
                                                <span>• POS / Card Sales:</span>
                                                <span className="font-medium">₦{(paymentBreakdown['CARD'] || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 pl-4 text-slate-500">
                                                <span>• Credit Purchases (Debt Incurred by Customers):</span>
                                                <span className="font-medium">₦{(paymentBreakdown['CREDIT'] || 0).toLocaleString()}</span>
                                            </div>

                                            <div className="flex justify-between items-center py-1 pt-2 border-t border-slate-200">
                                                <span className="text-slate-600 font-semibold">Customer Debt Settled to Me:</span>
                                                <span className="font-bold text-emerald-700">₦{dayCustomerDebtSettled.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: OUTFLOWS SUMMARY */}
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                                        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                                            <span className="font-bold text-rose-700 text-sm flex items-center gap-1.5">
                                                <ArrowDownRight className="w-4 h-4" /> Total Outflows (Money Out)
                                            </span>
                                            <span className="font-black text-rose-700 text-base">
                                                ₦{totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        <div className="space-y-2 text-xs">
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-slate-600">Operating Expenses Paid:</span>
                                                <span className="font-bold text-slate-800">₦{dayExpensesPaid.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-slate-600">Supplier Debt Settled by Me:</span>
                                                <span className="font-bold text-slate-800">₦{daySupplierDebtSettled.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-slate-600">Purchases Paid (Restocking):</span>
                                                <span className="font-bold text-slate-800">₦{dayPurchasesPaid.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-slate-600">Customer Refunds:</span>
                                                <span className="font-bold text-rose-700">₦{dayRefunds.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. SALES LOG TABLE */}
                        {activeSubTab === 'sales' && (
                            <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="p-3 font-semibold">Time</th>
                                            <th className="p-3 font-semibold">Invoice #</th>
                                            <th className="p-3 font-semibold">Customer</th>
                                            <th className="p-3 font-semibold">Payment Method</th>
                                            <th className="p-3 font-semibold">Items</th>
                                            <th className="p-3 font-semibold text-right">Amount (NGN)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredSales.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-8 text-center text-slate-400">
                                                    No sales recorded for this date.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSales.map((sale) => (
                                                <tr key={sale.id} className="hover:bg-slate-50">
                                                    <td className="p-3 text-slate-500 font-mono">
                                                        {format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'HH:mm')}
                                                    </td>
                                                    <td className="p-3 font-mono font-medium text-slate-600">
                                                        #{sale.invoiceNumber || (sale.id ? sale.id.substring(0, 8) : '')}
                                                    </td>
                                                    <td className="p-3 font-bold text-slate-800">
                                                        {sale.customerName || 'Walk-in Customer'}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                                            {sale.paymentMethod}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-slate-500">
                                                        {sale.items?.length || 0} items
                                                    </td>
                                                    <td className="p-3 text-right font-black text-emerald-600">
                                                        ₦{(sale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 3. EXPENSES LOG TABLE */}
                        {activeSubTab === 'expenses' && (
                            <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="p-3 font-semibold">Time</th>
                                            <th className="p-3 font-semibold">Category</th>
                                            <th className="p-3 font-semibold">Description / Note</th>
                                            <th className="p-3 font-semibold">Payment Method</th>
                                            <th className="p-3 font-semibold text-right">Amount (NGN)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredExpenses.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-slate-400">
                                                    No expenses recorded for this date.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredExpenses.map((expense) => (
                                                <tr key={expense.id} className="hover:bg-slate-50">
                                                    <td className="p-3 text-slate-500 font-mono">
                                                        {format((expense.date as any)?.toDate?.() ?? new Date(expense.date), 'HH:mm')}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                                            {expense.category || 'General'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-slate-700 font-medium">
                                                        {expense.note || '-'}
                                                    </td>
                                                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                                                        {expense.paymentMethod || 'CASH'}
                                                    </td>
                                                    <td className="p-3 text-right font-black text-rose-600">
                                                        ₦{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 4. CUSTOMER DEBT SETTLED TO ME TABLE */}
                        {activeSubTab === 'debt_collected' && (
                            <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="p-3 font-semibold">Time</th>
                                            <th className="p-3 font-semibold">Customer</th>
                                            <th className="p-3 font-semibold">Payment Method</th>
                                            <th className="p-3 font-semibold">Note / Memo</th>
                                            <th className="p-3 font-semibold text-right">Repaid Amount (NGN)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredCustomerPayments.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-slate-400">
                                                    No customer debt settlements recorded for this date.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredCustomerPayments.map((cp) => (
                                                <tr key={cp.id} className="hover:bg-slate-50">
                                                    <td className="p-3 text-slate-500 font-mono">
                                                        {format((cp.date as any)?.toDate?.() ?? new Date(cp.date), 'HH:mm')}
                                                    </td>
                                                    <td className="p-3 font-bold text-slate-800">
                                                        {(cp as any).customerName || (cp as any).customer?.name || 'Customer'}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                                            {cp.paymentMethod || 'CASH'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-slate-600">
                                                        {cp.note || '-'}
                                                    </td>
                                                    <td className="p-3 text-right font-black text-emerald-600">
                                                        ₦{(cp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 5. SUPPLIER DEBT SETTLED BY ME TABLE */}
                        {activeSubTab === 'supplier_debt_paid' && (
                            <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="p-3 font-semibold">Time</th>
                                            <th className="p-3 font-semibold">Supplier</th>
                                            <th className="p-3 font-semibold">Payment Method</th>
                                            <th className="p-3 font-semibold">Note / Memo</th>
                                            <th className="p-3 font-semibold text-right">Settled Amount (NGN)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredSupplierPayments.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-slate-400">
                                                    No supplier debt payments recorded for this date.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSupplierPayments.map((sp) => (
                                                <tr key={sp.id} className="hover:bg-slate-50">
                                                    <td className="p-3 text-slate-500 font-mono">
                                                        {format((sp.date as any)?.toDate?.() ?? new Date(sp.date), 'HH:mm')}
                                                    </td>
                                                    <td className="p-3 font-bold text-slate-800">
                                                        {sp.supplierName || 'Supplier'}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                                            {sp.paymentMethod || 'CASH'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-slate-600">
                                                        {sp.note || '-'}
                                                    </td>
                                                    <td className="p-3 text-right font-black text-rose-600">
                                                        ₦{(sp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 6. PURCHASES (RESTOCKING) TABLE */}
                        {activeSubTab === 'purchases' && (
                            <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="p-3 font-semibold">Time</th>
                                            <th className="p-3 font-semibold">Invoice #</th>
                                            <th className="p-3 font-semibold">Supplier</th>
                                            <th className="p-3 font-semibold">Status</th>
                                            <th className="p-3 font-semibold text-right">Total (NGN)</th>
                                            <th className="p-3 font-semibold text-right">Paid (NGN)</th>
                                            <th className="p-3 font-semibold text-right">Balance Due</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredPurchases.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="p-8 text-center text-slate-400">
                                                    No inventory purchases recorded for this date.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredPurchases.map((purchase) => (
                                                <tr key={purchase.id} className="hover:bg-slate-50">
                                                    <td className="p-3 text-slate-500 font-mono">
                                                        {format((purchase.date as any)?.toDate?.() ?? new Date(purchase.date), 'HH:mm')}
                                                    </td>
                                                    <td className="p-3 font-mono font-medium text-slate-600">
                                                        #{purchase.invoiceNo || (purchase.id ? purchase.id.substring(0, 8) : '')}
                                                    </td>
                                                    <td className="p-3 font-bold text-slate-800">
                                                        {purchase.supplierName}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            purchase.status === 'PAID' 
                                                                ? 'bg-emerald-50 text-emerald-700' 
                                                                : purchase.status === 'PARTIAL' 
                                                                    ? 'bg-amber-50 text-amber-700' 
                                                                    : 'bg-rose-50 text-rose-700'
                                                        }`}>
                                                            {purchase.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right font-medium text-slate-700">
                                                        ₦{(purchase.totalAmount || 0).toLocaleString()}
                                                    </td>
                                                    <td className="p-3 text-right font-black text-rose-600">
                                                        ₦{(purchase.paidAmount !== undefined ? purchase.paidAmount : purchase.totalAmount || 0).toLocaleString()}
                                                    </td>
                                                    <td className="p-3 text-right font-semibold text-amber-600">
                                                        ₦{(purchase.balance || 0).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 7. REFUNDS TABLE */}
                        {activeSubTab === 'refunds' && (
                            <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="p-3 font-semibold">Time</th>
                                            <th className="p-3 font-semibold">Return ID</th>
                                            <th className="p-3 font-semibold">Customer</th>
                                            <th className="p-3 font-semibold">Payment Method</th>
                                            <th className="p-3 font-semibold text-right">Refund Amount (NGN)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {returns.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-slate-400">
                                                    No returns or refunds issued on this date.
                                                </td>
                                            </tr>
                                        ) : (
                                            returns.map((ret) => (
                                                <tr key={ret.id} className="hover:bg-slate-50">
                                                    <td className="p-3 text-slate-500 font-mono">
                                                        {format((ret.returnDate as any)?.toDate?.() ?? new Date(ret.returnDate), 'HH:mm')}
                                                    </td>
                                                    <td className="p-3 font-mono font-medium text-slate-600">
                                                        #{ret.id ? ret.id.substring(0, 8) : ''}
                                                    </td>
                                                    <td className="p-3 font-bold text-slate-800">
                                                        {ret.customerName || 'Customer'}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                                            {ret.paymentMethod || 'CASH'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right font-black text-rose-600">
                                                        ₦{(ret.totalRefundAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
