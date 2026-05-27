import React from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Clock } from 'lucide-react';
import { PaymentMethod } from '../../types';

interface ExpenseHistoryProps {
    expenses: any[] | undefined;
    toggleStatus: (id: string, status: 'PAID' | 'PENDING') => Promise<void>;
}

export function ExpenseHistory({ expenses, toggleStatus }: ExpenseHistoryProps) {
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
                            {expenses?.map(ex => (
                                <tr key={ex.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 text-sm text-slate-600 whitespace-nowrap">{format(ex.date, 'MMM dd, yyyy')}</td>
                                    <td className="p-4 font-medium text-slate-800 whitespace-nowrap">{ex.category}</td>
                                    <td className="p-4 text-slate-500 text-sm">{ex.note || '-'}</td>
                                    <td className="p-4 whitespace-nowrap">
                                        <button
                                            onClick={() => toggleStatus(ex.id!, ex.status)}
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
                            <div className="flex justify-end">
                                <button
                                    onClick={() => toggleStatus(ex.id!, ex.status)}
                                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${ex.status === 'PAID'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}
                                >
                                    {ex.status === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                    {ex.status}
                                </button>
                                {ex.status === 'PAID' && (
                                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium uppercase">
                                        {ex.paymentMethod === PaymentMethod.TRANSFER ? 'Transfer'
                                            : ex.paymentMethod === PaymentMethod.CARD ? 'POS'
                                                : 'Cash'}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    {(!expenses || expenses.length === 0) && (
                        <div className="p-8 text-center text-slate-400 text-sm italic">
                            No expense history found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
