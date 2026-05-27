import React, { useState } from 'react';
import { X } from 'lucide-react';
import { db, logAudit } from '../../db/db';
import { Customer, PaymentMethod } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { validateNumericField } from '../../utils/validation';

interface RepayDebtModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
}

export function RepayDebtModal({ isOpen, onClose, customer }: RepayDebtModalProps) {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [repayForm, setRepayForm] = useState({
        amount: '',
        method: PaymentMethod.CASH,
        note: ''
    });

    if (!isOpen || !customer) return null;

    const handleRepayDebt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customer.id || !repayForm.amount) return;

        const amount = parseFloat(repayForm.amount);
        if (!validateNumericField(amount, 'Amount', 1, showToast)) return;

        if (amount > customer.currentDebt) {
            showToast(`Amount cannot exceed current debt (₦${customer.currentDebt.toLocaleString()})`, 'error');
            return;
        }

        try {
            await db.transaction('rw', [db.customers, db.customerPayments, db.auditLogs], async () => {
                const freshCustomer = await db.customers.get(customer.id!);
                if (!freshCustomer) throw new Error("Customer not found");

                await db.customerPayments.add({
                    customerId: freshCustomer.id!,
                    date: new Date(),
                    amount: amount,
                    paymentMethod: repayForm.method as PaymentMethod,
                    note: repayForm.note
                });

                const newDebt = (freshCustomer.currentDebt || 0) - amount;
                await db.customers.update(freshCustomer.id!, {
                    currentDebt: newDebt < 0 ? 0 : newDebt,
                    updated_at: new Date().toISOString()
                });

                await logAudit(
                    'REPAY_DEBT',
                    `Repaid ₦${amount} for customer ${freshCustomer.name} via ${repayForm.method}`,
                    currentUser?.username || 'Unknown'
                );
            });

            showToast("Repayment recorded successfully!", 'success');
            onClose();
        } catch (error) {
            console.error("Repayment failed", error);
            showToast("Failed to record repayment.", 'error');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">Repay Debt</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="mb-4 md:mb-6 bg-red-50 border border-red-100 p-3 md:p-4 rounded-lg">
                    <p className="text-[10px] md:text-sm text-red-600 uppercase font-bold tracking-wider mb-1">Outstanding Debt</p>
                    <p className="text-xl md:text-2xl font-black text-red-700">₦{customer.currentDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <form onSubmit={handleRepayDebt} className="space-y-3 md:space-y-4">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Amount (₦)</label>
                        <input
                            type="number"
                            required
                            min="1"
                            max={customer.currentDebt}
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            placeholder="0.00"
                            value={repayForm.amount}
                            onChange={e => setRepayForm({ ...repayForm, amount: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                        <select
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                            value={repayForm.method}
                            onChange={e => setRepayForm({ ...repayForm, method: e.target.value as PaymentMethod })}
                        >
                            <option value={PaymentMethod.CASH}>Cash</option>
                            <option value={PaymentMethod.TRANSFER}>Transfer</option>
                            <option value={PaymentMethod.CARD}>POS / Card</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
                        <input
                            type="text"
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            placeholder="e.g. Partial payment"
                            value={repayForm.note}
                            onChange={e => setRepayForm({ ...repayForm, note: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-xs md:text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs md:text-sm font-bold">Confirm Payment</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
