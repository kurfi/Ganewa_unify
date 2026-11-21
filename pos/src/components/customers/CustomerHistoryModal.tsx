import React, { useState, useEffect } from 'react';
import { X, Printer, Receipt } from 'lucide-react';
import { fetchCustomerHistory, CustomerHistoryResult } from '../../services/customerSalesService';
import { Customer, Sale, CustomerPayment, PaymentMethod } from '../../types';
import { format } from 'date-fns';
import { printThermalReceipt } from '../../services/printerService';
import { useToast } from '../../contexts/ToastContext';

interface CustomerHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
}

export function CustomerHistoryModal({ isOpen, onClose, customer }: CustomerHistoryModalProps) {
    const { showToast } = useToast();
    const [activeHistoryTab, setActiveHistoryTab] = useState<'purchases' | 'repayments'>('purchases');
    const [customerSales, setCustomerSales] = useState<Sale[]>([]);
    const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [aggregates, setAggregates] = useState<CustomerHistoryResult['aggregates'] | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !customer?.id) return;

        let cancelled = false;
        setIsLoading(true);
        setCustomerSales([]);
        setCustomerPayments([]);
        setAggregates(null);
        setActiveHistoryTab('purchases');
        setSelectedSale(null);

        fetchCustomerHistory(customer.id)
            .then(result => {
                if (cancelled) return;
                // Dates arrive as ISO strings from the Cloud Function — parse them back
                const parsedSales = result.sales.map(s => ({
                    ...s,
                    date: s.date ? new Date(s.date as any) : new Date(),
                })) as Sale[];
                const parsedPayments = result.payments.map(p => ({
                    ...p,
                    date: p.date ? new Date(p.date as any) : new Date(),
                })) as CustomerPayment[];
                setCustomerSales(parsedSales);
                setCustomerPayments(parsedPayments);
                setAggregates(result.aggregates);
            })
            .catch(err => {
                console.error('[CustomerHistoryModal] Failed to load history:', err);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [isOpen, customer]);

    if (!isOpen || !customer) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{customer.name}</h2>
                        <p className="text-sm text-slate-500">Customer History</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex border-b border-slate-100">
                    <button
                        onClick={() => setActiveHistoryTab('purchases')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeHistoryTab === 'purchases' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                    >
                        Purchases
                    </button>
                    <button
                        onClick={() => setActiveHistoryTab('repayments')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeHistoryTab === 'repayments' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                    >
                        Debt Repayments
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {activeHistoryTab === 'purchases' ? (
                        <div className="overflow-x-auto">
                            {/* Desktop Table View */}
                            <table className="hidden md:table w-full text-left text-sm">
                                <thead className="text-slate-500 border-b border-slate-100">
                                    <tr>
                                        <th className="pb-3 font-medium">Date</th>
                                        <th className="pb-3 font-medium">Ref ID</th>
                                        <th className="pb-3 font-medium">Items</th>
                                        <th className="pb-3 font-medium text-right">Amount</th>
                                        <th className="pb-3 font-medium text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {customerSales.map(sale => (
                                        <tr 
                                            key={sale.id}
                                            onClick={() => setSelectedSale(sale)}
                                            className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                            title="Click to view receipt"
                                        >
                                            <td className="py-3 text-slate-600">
                                                {format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'MMM dd, yyyy')}
                                            </td>
                                            <td className="py-3 text-slate-400 font-mono">
                                                #{sale.invoiceNo || sale.id?.slice(0, 8)}
                                            </td>
                                            <td className="py-3 text-slate-600">{sale.items?.length || 0} items</td>
                                            <td className="py-3 text-right font-bold text-slate-800">
                                                ₦{(sale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-3 text-center">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setSelectedSale(sale); }}
                                                    className="px-2.5 py-1 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1 transition-colors"
                                                >
                                                    <Receipt className="w-3.5 h-3.5" /> View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {customerSales.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-slate-400">No purchase history found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Mobile Card View */}
                            <div className="md:hidden divide-y divide-slate-100">
                                {customerSales.map(sale => (
                                    <div 
                                        key={sale.id} 
                                        onClick={() => setSelectedSale(sale)}
                                        className="py-3 space-y-2 hover:bg-slate-50 cursor-pointer transition-colors rounded-lg px-2"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-slate-800 text-xs">
                                                    Purchase #{sale.invoiceNo || sale.id?.slice(0, 6)}
                                                </p>
                                                <p className="text-[10px] text-slate-400">
                                                    {format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'MMM dd, yyyy')}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-bold text-slate-900 text-sm block">
                                                    ₦{(sale.finalAmount || 0).toLocaleString()}
                                                </span>
                                                <span className="text-[10px] text-emerald-600 font-medium hover:underline inline-flex items-center justify-end gap-0.5 mt-0.5">
                                                    <Receipt className="w-3 h-3" /> View Receipt
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-500 italic">{sale.items?.length || 0} items purchased</p>
                                    </div>
                                ))}
                                {customerSales.length === 0 && (
                                    <div className="py-8 text-center text-slate-400 text-xs italic">
                                        No purchase history found.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            {/* Desktop Table View */}
                            <table className="hidden md:table w-full text-left text-sm">
                                <thead className="text-slate-500 border-b border-slate-100">
                                    <tr>
                                        <th className="pb-3 font-medium">Date</th>
                                        <th className="pb-3 font-medium">Method</th>
                                        <th className="pb-3 font-medium">Note</th>
                                        <th className="pb-3 font-medium text-right">Amount Repaid</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {customerPayments.map(payment => (
                                        <tr key={payment.id}>
                                            <td className="py-3 text-slate-600">{format((payment.date as any)?.toDate?.() ?? new Date(payment.date), 'MMM dd, yyyy')}</td>
                                            <td className="py-3 text-slate-600">
                                                <span className="px-2 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600">{payment.paymentMethod}</span>
                                            </td>
                                            <td className="py-3 text-slate-500 italic">{payment.note || '-'}</td>
                                            <td className="py-3 text-right font-bold text-emerald-600">
                                                ₦{(payment.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                    {customerPayments.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-slate-400">No repayment history found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Mobile Card View */}
                            <div className="md:hidden divide-y divide-slate-100">
                                {customerPayments.map(payment => (
                                    <div key={payment.id} className="py-3 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-slate-800 text-xs uppercase">{payment.paymentMethod}</p>
                                                <p className="text-[10px] text-slate-400">{format((payment.date as any)?.toDate?.() ?? new Date(payment.date), 'MMM dd, yyyy')}</p>
                                            </div>
                                            <span className="font-bold text-emerald-600 text-sm">₦{(payment.amount || 0).toLocaleString()}</span>
                                        </div>
                                        {payment.note && <p className="text-[10px] text-slate-500 italic">"{payment.note}"</p>}
                                    </div>
                                ))}
                                {customerPayments.length === 0 && (
                                    <div className="py-8 text-center text-slate-400 text-xs italic">
                                        No repayment history found.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center">
                    {isLoading ? (
                        <div className="w-full text-center text-slate-400 text-sm py-1">Loading history…</div>
                    ) : activeHistoryTab === 'purchases' ? (
                        <>
                            <div className="text-slate-500 text-sm">
                                Showing {customerSales.length}
                                {aggregates && aggregates.salesCount > customerSales.length
                                    ? ` of ${aggregates.salesCount}` : ''} purchase{aggregates?.salesCount !== 1 ? 's' : ''}
                            </div>
                            <div className="text-slate-800 font-bold">
                                Total Spent: ₦{(aggregates?.totalSpent ?? customerSales.reduce((a, s) => a + (s.finalAmount || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-slate-500 text-sm">
                                Showing {customerPayments.length}
                                {aggregates && aggregates.paymentsCount > customerPayments.length
                                    ? ` of ${aggregates.paymentsCount}` : ''} repayment{aggregates?.paymentsCount !== 1 ? 's' : ''}
                            </div>
                            <div className="text-slate-800 font-bold">
                                Total Repaid: ₦{(aggregates?.totalRepaid ?? customerPayments.reduce((a, p) => a + (p.amount || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Selected Sale Receipt Sub-Modal */}
            {selectedSale && (
                <div 
                    className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-2 md:p-4 overflow-y-auto"
                    id="printable-receipt"
                >
                    <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-md my-4 overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-150">
                        {/* Header / Actions (Hidden during print) */}
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-900 text-white no-print">
                            <div className="flex items-center gap-2">
                                <Receipt className="w-5 h-5 text-emerald-400" />
                                <div>
                                    <h3 className="font-bold text-sm text-white">Sale Receipt</h3>
                                    <p className="text-[11px] text-slate-300 font-mono">
                                        {selectedSale.invoiceNo || `#${selectedSale.id?.slice(0, 8)}`}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedSale(null)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Printable Content */}
                        <div className="p-4 md:p-6 bg-slate-50 overflow-y-auto max-h-[70vh]">
                            <div id="receipt-content" className="bg-white p-4 border border-slate-200 font-mono text-slate-800 text-xs leading-tight rounded-lg shadow-xs">
                                {/* Store Title */}
                                <div className="text-center mb-4">
                                    <h1 className="text-base font-bold mb-1 text-slate-900">
                                        Ganewa Shopping Mall Kurfi
                                    </h1>
                                    <p className="text-[10px] text-slate-600 uppercase">
                                        Tashan Ladan, Mamman Na'antu Street
                                    </p>
                                    <p className="text-[10px] text-slate-600">
                                        GSM: 08031328041, 09121886883
                                    </p>
                                </div>

                                {/* Meta details */}
                                <div className="mb-3 pb-2 border-b border-dashed border-slate-300 space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Date:</span>
                                        <span>
                                            {format(
                                                (selectedSale.date as any)?.toDate?.() ?? new Date(selectedSale.date),
                                                "dd/MM/yyyy HH:mm"
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Inv No:</span>
                                        <span className="font-bold">
                                            {selectedSale.invoiceNo || `INV-${selectedSale.id?.slice(0, 6).toUpperCase()}`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Customer:</span>
                                        <span className="uppercase font-bold">{selectedSale.customerName || customer.name}</span>
                                    </div>
                                    {selectedSale.cashier && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Cashier:</span>
                                            <span>{selectedSale.cashier}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Items table */}
                                <div className="border-y border-dashed border-slate-300 py-1.5 mb-3">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="border-b border-dashed border-slate-300 text-slate-600">
                                                <th className="py-1 text-left font-bold pr-1">#</th>
                                                <th className="py-1 text-left font-bold px-1">Item</th>
                                                <th className="py-1 text-center font-bold px-1">Qty</th>
                                                <th className="py-1 text-right font-bold pl-1">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(selectedSale.items || []).map((item, i) => (
                                                <tr key={i}>
                                                    <td className="py-1.5 pr-1 align-top text-slate-500">{i + 1}</td>
                                                    <td className="py-1.5 px-1 align-top uppercase font-medium">{item.productName}</td>
                                                    <td className="py-1.5 px-1 text-center align-top">{item.quantity}</td>
                                                    <td className="py-1.5 pl-1 text-right align-top font-bold">
                                                        {(item.total || (item.price * item.quantity) || 0).toLocaleString(undefined, {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Totals */}
                                <div className="space-y-1.5 mb-3">
                                    {(selectedSale.discount || 0) > 0 && (
                                        <>
                                            <div className="flex justify-between text-slate-600">
                                                <span>Subtotal:</span>
                                                <span>
                                                    ₦{(selectedSale.totalAmount || 0).toLocaleString(undefined, {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-slate-600">
                                                <span>Discount:</span>
                                                <span>
                                                    -₦{(selectedSale.discount || 0).toLocaleString(undefined, {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    <div className="flex justify-between items-center py-1 font-bold border-t border-slate-200 text-sm">
                                        <span>TOTAL:</span>
                                        <span className="text-base text-slate-900">
                                            ₦{(selectedSale.finalAmount || 0).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-[11px] text-slate-600 pt-1">
                                        <span>Payment Method:</span>
                                        <span className="font-bold uppercase text-slate-800">
                                            {selectedSale.paymentMethod === PaymentMethod.MULTIPAY 
                                                ? selectedSale.paymentMethods?.map(m => m.method).join(' + ')
                                                : selectedSale.paymentMethod}
                                        </span>
                                    </div>
                                </div>

                                {/* Debt Info if present */}
                                {selectedSale.debtInfo && (
                                    <div className="mt-3 pt-2 border-t border-dashed border-slate-300 text-[11px] space-y-1">
                                        <div className="text-center font-bold text-orange-700 uppercase mb-1">
                                            Credit Account Details
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Previous Debt:</span>
                                            <span>₦{(selectedSale.debtInfo.previousDebt || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">This Sale Debt:</span>
                                            <span className="font-bold">+₦{(selectedSale.debtInfo.thisSaleDebt || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                                            <span>New Debt:</span>
                                            <span className="text-orange-700">₦{(selectedSale.debtInfo.newDebt || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="text-center text-slate-400 text-[10px] italic mt-4 pt-2 border-t border-slate-100">
                                    Thank you for your business!
                                </div>
                            </div>
                        </div>

                        {/* Footer Buttons (Hidden during print) */}
                        <div className="p-3 bg-white border-t border-slate-200 flex justify-end gap-2 no-print">
                            <button
                                onClick={() => setSelectedSale(null)}
                                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={async () => {
                                    if (!selectedSale) return;
                                    const saleToPrint = selectedSale;
                                    const res = await printThermalReceipt(saleToPrint, saleToPrint.debtInfo, { paperSize: "80mm" });
                                    if (res.direct) {
                                        showToast("Receipt printed directly to thermal printer.", "success");
                                    }
                                    setSelectedSale(null);
                                }}
                                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 flex items-center gap-1.5 transition-colors shadow-sm"
                            >
                                <Printer className="w-3.5 h-3.5" /> Thermal Print
                            </button>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

