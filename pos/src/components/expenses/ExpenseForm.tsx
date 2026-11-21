import React, { useEffect, useState } from 'react';
import { PRODUCT_CATEGORIES } from '../../constants/productCategories';
import { PaymentMethod } from '../../types';
import { computeBalances } from '../../utils/computeBalances';

interface ExpenseFormProps {
    amount: string;
    setAmount: (val: string) => void;
    category: string;
    setCategory: (val: string) => void;
    note: string;
    setNote: (val: string) => void;
    status: 'PAID' | 'PENDING';
    setStatus: (val: 'PAID' | 'PENDING') => void;
    paymentMethod: PaymentMethod;
    setPaymentMethod: (val: PaymentMethod) => void;
    addExpense: (e: React.FormEvent) => Promise<void>;
    /** Increment this after a successful submission to force a balance re-fetch (BUG 2 fix) */
    refreshKey?: number;
}

export function ExpenseForm({ amount, setAmount, category, setCategory, note, setNote, status, setStatus, paymentMethod, setPaymentMethod, addExpense, refreshKey }: ExpenseFormProps) {
    const [cashAtHand, setCashAtHand] = useState<number | null>(null);
    const [moneyInBank, setMoneyInBank] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // BUG 2 FIX: Re-fetch the live balance whenever the payment method changes (Cash vs Bank)
    // or whenever the parent signals that a new expense was just submitted (via refreshKey).
    useEffect(() => {
        computeBalances()
            .then(b => { setCashAtHand(b.cashAtHand); setMoneyInBank(b.moneyInBank); })
            .catch(() => { });
    }, [paymentMethod, refreshKey]);

    const BANK_METHODS = [PaymentMethod.TRANSFER, PaymentMethod.CARD];
    const availableBalance = BANK_METHODS.includes(paymentMethod) ? moneyInBank : cashAtHand;
    const balanceLabel = BANK_METHODS.includes(paymentMethod) ? 'Bank balance' : 'Cash at hand';
    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await addExpense(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="lg:col-span-1">
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base md:text-lg font-bold mb-3 md:mb-4 text-slate-800">Record Expense</h2>
                <form onSubmit={handleFormSubmit} className="space-y-3 md:space-y-4">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-600 mb-1">Category</label>
                        <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-white">
                            <option value="" disabled>Select a category</option>
                            {PRODUCT_CATEGORIES
                                .filter(cat => ![
                                    "Beverages (Drinks & Water)",
                                    "Milk & Dairy Products",
                                    "Hot Drinks (Tea, Coffee & Cocoa)",
                                    "Grains, Noodles & Staples",
                                    "Seasonings, Condiments & Oil",
                                    "Snacks, Biscuits & Confectionery",
                                    "Soap & Detergent",
                                    "Personal Care (Hair, Skin & Oral)",
                                    "Baby Products & Hygiene",
                                    "Household & Insect Control",
                                    "Eggs & Poultry",
                                    "Baking Supplies",
                                    "Stationery"
                                ].includes(cat))
                                .map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            {/* BUG 5 FIX: explicit value= so these behave consistently */}
                            <option value="Rent">Rent</option>
                            <option value="Utilities">Utilities</option>
                            <option value="Salaries">Salaries</option>
                            <option value="Maintenance">Maintenance</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-600 mb-1">Amount</label>
                        <input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-600 mb-1">Status</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="status"
                                    checked={status === 'PAID'}
                                    onChange={() => setStatus('PAID')}
                                    className="text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-xs md:text-sm text-slate-700">Paid</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="status"
                                    checked={status === 'PENDING'}
                                    onChange={() => setStatus('PENDING')}
                                    className="text-red-600 focus:ring-red-500"
                                />
                                <span className="text-xs md:text-sm text-slate-700">Pending</span>
                            </label>
                        </div>
                    </div>
                    {status === 'PAID' && (
                        <div>
                            <label className="block text-xs md:text-sm font-medium text-slate-600 mb-1">
                                Paid From
                            </label>
                            <div className="flex gap-2">
                                {[
                                    { value: PaymentMethod.CASH, label: 'Cash' },
                                    { value: PaymentMethod.TRANSFER, label: 'Transfer' },
                                    { value: PaymentMethod.CARD, label: 'POS / Card' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setPaymentMethod(opt.value)}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${paymentMethod === opt.value
                                                ? 'bg-emerald-600 text-white border-emerald-600'
                                                : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            {availableBalance !== null && (
                                <p className={`text-[10px] mt-1.5 ${availableBalance <= 0 ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                    {balanceLabel}: ₦{availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            )}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-600 mb-1">Note</label>
                        <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full p-2 border rounded-lg text-sm" rows={2}></textarea>
                    </div>
                    <button disabled={isSubmitting} className={`w-full py-2 rounded-lg font-medium text-white text-sm disabled:opacity-50 ${status === 'PAID' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                        {isSubmitting ? 'Recording...' : (status === 'PAID' ? 'Record Payment' : 'Record Unpaid Expense')}
                    </button>
                </form>
            </div>
        </div>
    );
}
