import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { db } from '../../firebase/config';
import { logAudit, normalizeFirestoreDates } from '../../firebase/firestoreHelpers';
import { runTransaction, doc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Supplier, PaymentMethod } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { validateNumericField } from '../../utils/validation';
import { computeBalances } from '../../utils/computeBalances';
import { roundTo2 } from '../../utils/math';
import { v4 as uuidv4 } from 'uuid';
import { emitDashboardRefresh } from '../../utils/dashboardRefreshSignal';

interface SettleSupplierDebtModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
}

export function SettleSupplierDebtModal({ isOpen, onClose, supplier }: SettleSupplierDebtModalProps) {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [settleForm, setSettleForm] = useState({
        amount: '',
        method: PaymentMethod.CASH,
        note: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [balances, setBalances] = useState<{ cashAtHand: number; moneyInBank: number } | null>(null);

    useEffect(() => {
        if (isOpen) {
            computeBalances().then(setBalances).catch(console.error);
        }
    }, [isOpen]);

    const BANK_METHODS = [PaymentMethod.TRANSFER, PaymentMethod.CARD];

    if (!isOpen || !supplier) return null;

    const handleSettleDebt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supplier.id || !settleForm.amount || isSubmitting) return;

        const amount = parseFloat(settleForm.amount);
        if (!validateNumericField(amount, 'Amount', 1, showToast)) return;

        if (amount > (supplier.balance || 0)) {
            showToast(`Amount cannot exceed current balance (₦${(supplier.balance || 0).toLocaleString()})`, 'error');
            return;
        }

        setIsSubmitting(true);

        try {
            const { cashAtHand, moneyInBank } = await computeBalances();
            const availableBalance = BANK_METHODS.includes(settleForm.method as PaymentMethod) ? moneyInBank : cashAtHand;
            const balanceLabel = BANK_METHODS.includes(settleForm.method as PaymentMethod) ? 'bank balance' : 'cash at hand';

            if (amount > availableBalance) {
                const shortfall = roundTo2(amount - availableBalance);
                showToast(
                    `Insufficient ${balanceLabel}. Available: ₦${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — Shortfall: ₦${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    'error'
                );
                setIsSubmitting(false);
                return;
            }
        } catch (err) {
            console.warn('Balance check failed before supplier payment:', err);
        }

        try {
            const paymentId = uuidv4();
            const now = new Date();
            const nowIso = now.toISOString();

            // Fetch all PENDING/PARTIAL purchases for this supplier (outside transaction – read-only)
            const purchasesQuery = query(
                collection(db, 'purchases'),
                where('supplierId', '==', supplier.id!),
                where('deleted', '==', false),
                where('status', 'in', ['PENDING', 'PARTIAL']),
                orderBy('date', 'asc')
            );
            const purchasesSnap = await getDocs(purchasesQuery);
            const unpaidPurchases = purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            await runTransaction(db, async (tx) => {
                const supplierRef = doc(db, 'suppliers', supplier.id!);
                const supSnap = await tx.get(supplierRef);
                if (!supSnap.exists()) throw new Error("Supplier not found in database");

                const freshSupplier = normalizeFirestoreDates<Supplier>(supSnap.data());
                const newBalance = Math.max(0, (freshSupplier.balance || 0) - amount);

                const paymentRef = doc(db, 'supplierPayments', paymentId);
                tx.set(paymentRef, {
                    id: paymentId,
                    supplierId: supplier.id!,
                    supplierName: supplier.companyName,
                    date: now,
                    amount,
                    paymentMethod: settleForm.method as PaymentMethod,
                    note: settleForm.note || '',
                    created_at: nowIso,
                    updated_at: nowIso,
                    deleted: false
                });

                tx.update(supplierRef, {
                    balance: newBalance,
                    nameLower: (freshSupplier.companyName || '').toLowerCase(),
                    updated_at: nowIso
                });

                // Distribute the payment across unpaid purchases (oldest first)
                let remaining = amount;
                for (const purchase of unpaidPurchases) {
                    if (remaining <= 0) break;

                    const purchaseTotal: number = purchase.totalAmount || 0;
                    const alreadyPaid: number = purchase.paidAmount || 0;
                    const outstanding: number = roundTo2(purchaseTotal - alreadyPaid);

                    if (outstanding <= 0) continue;

                    const applying = roundTo2(Math.min(remaining, outstanding));
                    const newPaidAmount = roundTo2(alreadyPaid + applying);
                    const newPurchaseBalance = roundTo2(Math.max(0, purchaseTotal - newPaidAmount));
                    const newStatus = newPurchaseBalance <= 0 ? 'PAID' : (newPaidAmount > 0 ? 'PARTIAL' : 'PENDING');

                    tx.update(doc(db, 'purchases', purchase.id), {
                        paidAmount: newPaidAmount,
                        balance: newPurchaseBalance,
                        status: newStatus,
                        updated_at: nowIso
                    });

                    remaining = roundTo2(remaining - applying);
                }
            });

            emitDashboardRefresh();

            showToast(`₦${amount.toLocaleString()} paid to ${supplier.companyName}`, 'success');
            logAudit('SUPPLIER_PAYMENT', `Paid ₦${amount} to ${supplier.companyName} via ${settleForm.method}`, currentUser?.username || 'Unknown');
            
            onClose();
            setSettleForm({
                amount: '',
                method: PaymentMethod.CASH,
                note: ''
            });
        } catch (error) {
            console.error("Settlement failed", error);
            showToast("Failed to record payment.", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const paymentMethods = [
        { id: PaymentMethod.CASH, label: 'Cash', color: 'bg-emerald-600' },
        { id: PaymentMethod.TRANSFER, label: 'Transfer', color: 'bg-indigo-600' },
        { id: PaymentMethod.CARD, label: 'Card', color: 'bg-blue-600' }
    ];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">Settle Supplier Debt</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="mb-4 md:mb-6 bg-emerald-50 border border-emerald-100 p-3 md:p-4 rounded-lg">
                    <p className="text-[10px] md:text-sm text-emerald-600 uppercase font-bold tracking-wider mb-1">Outstanding Balance</p>
                    <p className="text-xl md:text-2xl font-black text-emerald-700">₦{(supplier.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <form onSubmit={handleSettleDebt} className="space-y-4 md:space-y-6">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Amount to Pay (₦)</label>
                        <input
                            type="number"
                            required
                            min="1"
                            step="0.01"
                            max={supplier.balance}
                            className={`w-full border p-3 rounded-xl focus:ring-2 outline-none text-base font-bold ${
                                parseFloat(settleForm.amount) > (supplier.balance || 0)
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-slate-300 focus:ring-emerald-500'
                            }`}
                            placeholder="0.00"
                            value={settleForm.amount}
                            onChange={e => setSettleForm({ ...settleForm, amount: e.target.value })}
                        />
                        {parseFloat(settleForm.amount) > (supplier.balance || 0) && (
                            <p className="text-red-500 text-xs mt-1">Amount cannot exceed current balance (₦{(supplier.balance || 0).toLocaleString()})</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-2">Payment Method</label>
                        <div className="grid grid-cols-3 gap-2">
                            {paymentMethods.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setSettleForm({ ...settleForm, method: m.id })}
                                    className={`py-3 px-2 rounded-xl text-[10px] md:text-xs font-bold transition-all border-2 ${
                                        settleForm.method === m.id
                                            ? `${m.color} text-white border-transparent shadow-lg scale-105`
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        {balances && (
                            <div className="text-[10px] text-slate-500 mt-2 space-y-0.5 px-1">
                                <p>Cash at hand: <span className={balances.cashAtHand < 0 ? 'text-red-500 font-bold' : 'text-slate-700 font-medium'}>₦{balances.cashAtHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                                <p>Money in bank: <span className={balances.moneyInBank < 0 ? 'text-red-500 font-bold' : 'text-slate-700 font-medium'}>₦{balances.moneyInBank.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
                        <input
                            type="text"
                            className="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                            placeholder="e.g. Partial payment for invoice"
                            value={settleForm.note}
                            onChange={e => setSettleForm({ ...settleForm, note: e.target.value })}
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            disabled={isSubmitting}
                            className="flex-1 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting || parseFloat(settleForm.amount) > (supplier.balance || 0)}
                            className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Processing...' : 'Confirm Payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
