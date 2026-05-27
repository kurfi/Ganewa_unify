import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { db } from '../../db/db';
import { Customer, Sale, CustomerPayment } from '../../types';
import { format } from 'date-fns';

interface CustomerHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
}

export function CustomerHistoryModal({ isOpen, onClose, customer }: CustomerHistoryModalProps) {
    const [activeHistoryTab, setActiveHistoryTab] = useState<'purchases' | 'repayments'>('purchases');
    const [customerSales, setCustomerSales] = useState<Sale[]>([]);
    const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);

    useEffect(() => {
        const fetchHistory = async () => {
            if (isOpen && customer?.id) {
                const sales = await db.sales.where('customerId').equals(customer.id).sortBy('date').then(res => res.reverse());
                const payments = await db.customerPayments.where('customerId').equals(customer.id).sortBy('date').then(res => res.reverse());
                setCustomerSales(sales);
                setCustomerPayments(payments);
                setActiveHistoryTab('purchases');
            }
        };
        fetchHistory();
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
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {customerSales.map(sale => (
                                        <tr key={sale.id}>
                                            <td className="py-3 text-slate-600">{format(sale.date, 'MMM dd, yyyy')}</td>
                                            <td className="py-3 text-slate-400">#{sale.id}</td>
                                            <td className="py-3 text-slate-600">{sale.items.length} items</td>
                                            <td className="py-3 text-right font-bold text-slate-800">
                                                ₦{(sale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                    {customerSales.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-slate-400">No purchase history found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Mobile Card View */}
                            <div className="md:hidden divide-y divide-slate-100">
                                {customerSales.map(sale => (
                                    <div key={sale.id} className="py-3 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-slate-800 text-xs">Purchase #{sale.id.slice(-6)}</p>
                                                <p className="text-[10px] text-slate-400">{format(sale.date, 'MMM dd, yyyy')}</p>
                                            </div>
                                            <span className="font-bold text-slate-900 text-sm">₦{(sale.finalAmount || 0).toLocaleString()}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 italic">{sale.items.length} items purchased</p>
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
                                            <td className="py-3 text-slate-600">{format(payment.date, 'MMM dd, yyyy')}</td>
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
                                                <p className="text-[10px] text-slate-400">{format(payment.date, 'MMM dd, yyyy')}</p>
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
                    {activeHistoryTab === 'purchases' ? (
                        <>
                            <div className="text-slate-500 text-sm">Total Purchases: {customerSales.length}</div>
                            <div className="text-slate-800 font-bold">
                                Total Spent: ₦{customerSales.reduce((acc, s) => acc + (s.finalAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-slate-500 text-sm">Total Repayments: {customerPayments.length}</div>
                            <div className="text-slate-800 font-bold">
                                Total Repaid: ₦{customerPayments.reduce((acc, p) => acc + (p.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
