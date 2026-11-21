import React, { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Clock, X, Banknote, Building2, CreditCard } from 'lucide-react';
import { PaymentMethod } from '../../types';

interface ExpenseHistoryProps {
    expenses: any[] | undefined;
    loading?: boolean;
    hasMore?: boolean;
    loadMore?: () => void;
    loadingMore?: boolean;
    toggleStatus: (id: string, status: 'PAID' | 'PENDING', targetMethod?: PaymentMethod) => Promise<void>;
}

export function ExpenseHistory({ expenses, loading, hasMore, loadMore, loadingMore, toggleStatus }: ExpenseHistoryProps) {
    const [selectedExpense, setSelectedExpense] = useState<any | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
    // BUG 3 FIX: track which PAID expense the user wants to revert so we can show a confirmation
    const [revertExpense, setRevertExpense] = useState<any | null>(null);

    const handleStatusClick = (ex: any) => {
        if (ex.status === 'PENDING') {
            // PENDING → PAID: show payment-method picker
            setSelectedExpense(ex);
            setPaymentMethod(PaymentMethod.CASH);
        } else {
            // PAID → PENDING: BUG 3 FIX — show a confirmation modal instead of immediately writing
            setRevertExpense(ex);
        }
    };

    const handleConfirmRevert = async () => {
        if (!revertExpense) return;
        await toggleStatus(revertExpense.id!, 'PAID');
        setRevertExpense(null);
    };

    const handleConfirmPayment = async () => {
        if (!selectedExpense) return;
        await toggleStatus(selectedExpense.id!, 'PENDING', paymentMethod);
        setSelectedExpense(null);
    };

    return (
        <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <h2 className="text-base md:text-lg font-bold p-3 md:p-4 border-b border-slate-200 bg-slate-50 text-slate-800">Expense History</h2>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                            <tr>
                                <th className="p-4 whitespace-nowrap">Date</th>
                                <th className="p-4 whitespace-nowrap">Category</th>
                                <th className="p-4 w-full">Note</th>
                                <th className="p-4 whitespace-nowrap">Status</th>
                                <th className="p-4 text-right whitespace-nowrap">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* BUG 4 FIX: show empty state on desktop when list is empty */}
                            {(!expenses || expenses.length === 0) && !loading && (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-slate-400 text-sm italic">
                                        No expense history found.
                                    </td>
                                </tr>
                            )}
                            {expenses?.map(ex => (
                                <tr key={ex.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 text-sm text-slate-600 whitespace-nowrap">{format(ex.date, 'MMM dd, yyyy')}</td>
                                    <td className="p-4 font-medium text-slate-800 whitespace-nowrap">{ex.category}</td>
                                    <td className="p-4 text-slate-500 text-sm">{ex.note || '-'}</td>
                                    <td className="p-4 whitespace-nowrap">
                                        <button
                                            onClick={() => handleStatusClick(ex)}
                                            className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${ex.status === 'PAID'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                }`}
                                        >
                                            {ex.status === 'PAID' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                                            {ex.status}
                                        </button>
                                        {ex.status === 'PAID' && (
                                            <span className="mt-1 block text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium uppercase text-center">
                                                {ex.paymentMethod === PaymentMethod.TRANSFER ? 'Transfer'
                                                    : ex.paymentMethod === PaymentMethod.CARD ? 'POS'
                                                        : 'Cash'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right font-bold text-slate-900 text-sm whitespace-nowrap">₦{ex.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-slate-100">
                    {expenses?.map(ex => (
                        <div key={ex.id} className="p-4 hover:bg-slate-50 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <p className="font-bold text-slate-800">{ex.category}</p>
                                    <p className="text-[10px] text-slate-500">{format(ex.date, 'MMM dd, yyyy')}</p>
                                </div>
                                <p className="font-bold text-indigo-600 text-sm">₦{ex.amount.toLocaleString()}</p>
                            </div>
                            {ex.note && <p className="text-xs text-slate-500 mb-3 italic">"{ex.note}"</p>}
                            <div className="flex justify-end items-center gap-2">
                                <button
                                    onClick={() => handleStatusClick(ex)}
                                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${ex.status === 'PAID'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}
                                >
                                    {ex.status === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                    {ex.status}
                                </button>
                                {ex.status === 'PAID' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium uppercase">
                                        {ex.paymentMethod === PaymentMethod.TRANSFER ? 'Transfer'
                                            : ex.paymentMethod === PaymentMethod.CARD ? 'POS'
                                                : 'Cash'}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    {(!expenses || expenses.length === 0) && !loading && (
                        <div className="p-8 text-center text-slate-400 text-sm italic">
                            No expense history found.
                        </div>
                    )}
                </div>

                {loading && (
                    <div className="py-8 text-center text-slate-500">
                        Loading expenses...
                    </div>
                )}

                {hasMore && (
                    <div className="flex justify-center p-6 bg-slate-50 border-t border-slate-100">
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg shadow-sm hover:bg-slate-50 disabled:opacity-50"
                        >
                            {loadingMore ? 'Loading...' : 'Load More'}
                        </button>
                    </div>
                )}
            </div>

            {/* BUG 3 FIX: Confirmation modal for PAID → PENDING revert */}
            {revertExpense && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Mark as Unpaid?</h3>
                            <button
                                onClick={() => setRevertExpense(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-6">
                            This will revert <strong className="text-slate-800">{revertExpense.category}</strong> (₦{revertExpense.amount?.toLocaleString()}) back to <span className="text-amber-600 font-bold">PENDING</span>. The payment method will be cleared. Are you sure?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setRevertExpense(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmRevert}
                                className="px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
                            >
                                Yes, Mark Unpaid
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Method Modal when marking PENDING expense as PAID */}
            {selectedExpense && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Mark Expense as Paid</h3>
                            <button
                                onClick={() => setSelectedExpense(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-slate-600 mb-4">
                            Select payment method used for <strong className="text-slate-800">{selectedExpense.category}</strong> (₦{selectedExpense.amount?.toLocaleString()}):
                        </p>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <button
                                type="button"
                                onClick={() => setPaymentMethod(PaymentMethod.CASH)}
                                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                                    paymentMethod === PaymentMethod.CASH
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                }`}
                            >
                                <Banknote className="w-5 h-5" />
                                <span className="text-xs">Cash</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setPaymentMethod(PaymentMethod.TRANSFER)}
                                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                                    paymentMethod === PaymentMethod.TRANSFER
                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                }`}
                            >
                                <Building2 className="w-5 h-5" />
                                <span className="text-xs">Transfer</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setPaymentMethod(PaymentMethod.CARD)}
                                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                                    paymentMethod === PaymentMethod.CARD
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                }`}
                            >
                                <CreditCard className="w-5 h-5" />
                                <span className="text-xs">POS / Card</span>
                            </button>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedExpense(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmPayment}
                                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
                            >
                                Confirm Paid
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
