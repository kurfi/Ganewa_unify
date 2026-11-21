import React, { useState } from 'react';
import { X } from 'lucide-react';
import { db } from '../../firebase/config';
import { logAudit, normalizeFirestoreDates } from '../../firebase/firestoreHelpers';
import { runTransaction, doc } from 'firebase/firestore';
import { Customer, PaymentMethod } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { validateNumericField } from '../../utils/validation';
import { v4 as uuidv4 } from 'uuid';
import { emitDashboardRefresh } from '../../utils/dashboardRefreshSignal';

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
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen || !customer) return null;

    const handleRepayDebt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customer.id || !repayForm.amount || isSubmitting) return;

        const amount = parseFloat(repayForm.amount);
        if (!validateNumericField(amount, 'Amount', 1, showToast)) return;

        if (amount > customer.currentDebt) {
            showToast(`Amount cannot exceed current debt (₦${customer.currentDebt.toLocaleString()})`, 'error');
            return;
        }

        setIsSubmitting(true);

        let updatedCustomer: Customer | null = null;
        try {
            const paymentId = uuidv4();
            const now = new Date();
            const nowIso = now.toISOString();

            await runTransaction(db, async (tx) => {
                const customerRef = doc(db, 'customers', customer.id!);
                const custSnap = await tx.get(customerRef);
                if (!custSnap.exists()) throw new Error("Customer not found in database");

                const freshCustomer = normalizeFirestoreDates<Customer>(custSnap.data());
                const newDebt = Math.max(0, (freshCustomer.currentDebt || 0) - amount);

                // 1. Create customerPayment doc
                const paymentRef = doc(db, 'customerPayments', paymentId);
                tx.set(paymentRef, {
                    id: paymentId,
                    customerId: freshCustomer.id!,
                    customerName: freshCustomer.name || '',
                    date: now,
                    amount: amount,
                    paymentMethod: repayForm.method as PaymentMethod,
                    note: repayForm.note || '',
                    created_at: nowIso,
                    updated_at: nowIso,
                    deleted: false
                });

                // 2. Update customer debt
                tx.update(customerRef, {
                    currentDebt: newDebt,
                    updated_at: nowIso
                });

                updatedCustomer = {
                    ...freshCustomer,
                    currentDebt: newDebt
                };
            });

            emitDashboardRefresh();

            await logAudit(
                'REPAY_DEBT',
                `Repaid ₦${amount} for customer ${customer.name} via ${repayForm.method}`,
                currentUser?.username || 'Unknown'
            );

            showToast("Repayment recorded successfully!", 'success');
            onClose();
            setRepayForm({ amount: '', method: PaymentMethod.CASH, note: '' });

            if (updatedCustomer) {
                import('../../utils/creditInfoSync')
                    .then(({ syncCreditInfoToShopUser }) => syncCreditInfoToShopUser(updatedCustomer!))
                    .catch(err => console.warn('Credit sync failed (non-critical):', err));
            }
        } catch (error) {
            console.error("Repayment failed", error);
            showToast("Failed to record repayment.", 'error');
        } finally {
            setIsSubmitting(false);
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
                            className={`w-full border p-2 rounded-lg focus:ring-2 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400 ${
                                parseFloat(repayForm.amount) > customer.currentDebt
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-slate-300 focus:ring-emerald-500'
                            }`}
                            placeholder="0.00"
                            value={repayForm.amount}
                            onChange={e => setRepayForm({ ...repayForm, amount: e.target.value })}
                        />
                        {parseFloat(repayForm.amount) > customer.currentDebt && (
                            <p className="text-red-500 text-xs mt-1">Amount cannot exceed current debt (₦{customer.currentDebt.toLocaleString()})</p>
                        )}
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
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-xs md:text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isSubmitting || parseFloat(repayForm.amount) > customer.currentDebt} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs md:text-sm font-bold disabled:opacity-50">
                            {isSubmitting ? 'Processing...' : 'Confirm Payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
