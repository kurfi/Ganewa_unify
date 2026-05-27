import React, { useState, useEffect } from 'react';
import { X, Loader2, Banknote, CreditCard, Smartphone, Layers, Plus, FileText, Receipt, Info } from 'lucide-react';
import { PaymentMethod, Customer } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import { validateNumericField } from '../../utils/validation';

interface PaymentModalProps {
    isPaymentModalOpen: boolean;
    setIsPaymentModalOpen: (isOpen: boolean) => void;
    isMultipayOpen: boolean;
    setIsMultipayOpen: (isOpen: boolean) => void;
    multipayEntries: { method: PaymentMethod; amount: string }[];
    setMultipayEntries: (entries: { method: PaymentMethod; amount: string }[]) => void;
    calculateTotal: () => number;
    discount: number;
    selectedCustomer: Customer | null;
    isProcessing: boolean;
    handleCheckout: (method: PaymentMethod, multipayEntries?: { method: PaymentMethod; amount: string }[], amountPaid?: number) => void;
    isAdmin: boolean;
}

export function PaymentModal({
    isPaymentModalOpen, setIsPaymentModalOpen, isMultipayOpen, setIsMultipayOpen,
    multipayEntries, setMultipayEntries, calculateTotal, discount, selectedCustomer,
    isProcessing, handleCheckout, isAdmin
}: PaymentModalProps) {
    const { showToast } = useToast();
    const [amountPaidStr, setAmountPaidStr] = useState<string>('');

    const totalDue = Math.max(0, calculateTotal() - discount);

    useEffect(() => {
        if (isPaymentModalOpen) {
            setAmountPaidStr(totalDue.toString());
        }
    }, [isPaymentModalOpen, totalDue]);

    if (!isPaymentModalOpen) return null;

    const amountPaid = parseFloat(amountPaidStr) || 0;
    const debtRemainder = Math.max(0, totalDue - amountPaid);
    const isPartial = debtRemainder > 0.01;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 md:p-4 no-print">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-4 md:p-6 overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-4 md:mb-6">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900">Complete Payment</h2>
                    <button onClick={() => { setIsPaymentModalOpen(false); setIsMultipayOpen(false); setMultipayEntries([]); }} className="p-2 hover:bg-slate-100 rounded-full">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="text-center mb-6 bg-slate-50 p-4 rounded-xl">
                    <p className="text-slate-500 text-[10px] md:text-sm uppercase tracking-wide mb-1">Total Payable</p>
                    <p className="text-2xl md:text-4xl font-extrabold text-emerald-600">₦{totalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    {discount > 0 && (
                        <p className="text-xs md:text-sm text-slate-400 mt-1 line-through">₦{calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    )}
                </div>

                {!isMultipayOpen && (
                    <div className="mb-6 p-4 border border-slate-200 rounded-xl bg-white shadow-sm">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Amount Paid (NGN)</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.01"
                                value={amountPaidStr}
                                onChange={(e) => setAmountPaidStr(e.target.value)}
                                disabled={!selectedCustomer || isProcessing}
                                className={`w-full p-3 pl-10 text-lg font-bold rounded-lg border outline-none transition-all ${
                                    (!selectedCustomer) ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' : 'border-emerald-200 focus:ring-2 focus:ring-emerald-500 text-slate-800'
                                }`}
                                placeholder="0.00"
                            />
                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        </div>
                        
                        {!selectedCustomer ? (
                            <p className="text-[10px] md:text-xs text-orange-500 mt-2 flex items-center gap-1 font-medium">
                                <Info className="w-3 h-3" /> Select a customer to enable partial payments
                            </p>
                        ) : isPartial ? (
                            <div className="mt-2 p-2 bg-orange-50 rounded-lg border border-orange-100 animate-pulse">
                                <p className="text-[10px] md:text-xs text-orange-700 flex items-center gap-1 font-bold italic">
                                    <Info className="w-3 h-3" /> Remaining ₦{debtRemainder.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will be added to debt
                                </p>
                            </div>
                        ) : (
                            <p className="text-[10px] md:text-xs text-emerald-600 mt-2 flex items-center gap-1 font-medium">
                                <Info className="w-3 h-3" /> Full payment selected
                            </p>
                        )}
                    </div>
                )}

                {!isMultipayOpen ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
                        <button
                            onClick={() => handleCheckout(PaymentMethod.CASH, [], amountPaid)}
                            disabled={isProcessing}
                            className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="p-2 md:p-3 bg-emerald-100 text-emerald-600 rounded-full group-hover:bg-emerald-200">
                                {isProcessing ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Banknote className="w-5 h-5 md:w-6 md:h-6" />}
                            </div>
                            <span className="font-bold text-slate-700 group-hover:text-emerald-700 text-sm md:text-base">Cash</span>
                        </button>
                        <button
                            onClick={() => handleCheckout(PaymentMethod.CARD, [], amountPaid)}
                            disabled={isProcessing}
                            className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="p-2 md:p-3 bg-blue-100 text-blue-600 rounded-full group-hover:bg-blue-200">
                                {isProcessing ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <CreditCard className="w-5 h-5 md:w-6 md:h-6" />}
                            </div>
                            <span className="font-bold text-slate-700 group-hover:text-blue-700 text-sm md:text-base">POS / Card</span>
                        </button>
                        <button
                            onClick={() => handleCheckout(PaymentMethod.TRANSFER, [], amountPaid)}
                            disabled={isProcessing}
                            className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-purple-50 hover:border-purple-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="p-2 md:p-3 bg-purple-100 text-purple-600 rounded-full group-hover:bg-purple-200">
                                {isProcessing ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Smartphone className="w-5 h-5 md:w-6 md:h-6" />}
                            </div>
                            <span className="font-bold text-slate-700 group-hover:text-purple-700 text-sm md:text-base">Transfer</span>
                        </button>
                        <button
                            onClick={() => setIsMultipayOpen(true)}
                            disabled={isProcessing}
                            className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-fuchsia-50 hover:border-fuchsia-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="p-2 md:p-3 bg-fuchsia-100 text-fuchsia-600 rounded-full group-hover:bg-fuchsia-200"><Layers className="w-5 h-5 md:w-6 md:h-6" /></div>
                            <span className="font-bold text-slate-700 group-hover:text-fuchsia-700 text-sm md:text-base">Multipay</span>
                        </button>
                        <button
                            onClick={() => handleCheckout(PaymentMethod.CREDIT)}
                            disabled={!selectedCustomer || isProcessing}
                            className={`group p-4 md:p-6 border border-slate-200 rounded-xl transition-all flex flex-col items-center gap-2 md:gap-3 ${!selectedCustomer || isProcessing ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-orange-50 hover:border-orange-500 hover:shadow-md cursor-pointer'}`}
                        >
                            <div className={`p-2 md:p-3 rounded-full ${!selectedCustomer || isProcessing ? 'bg-slate-200 text-slate-400' : 'bg-orange-100 text-orange-600 group-hover:bg-orange-200'}`}>
                                {isProcessing ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <FileText className="w-5 h-5 md:w-6 md:h-6" />}
                            </div>
                            <span className={`font-bold text-sm md:text-base ${!selectedCustomer ? 'text-slate-400' : 'text-slate-700 group-hover:text-orange-700'}`}>Debt / Credit</span>
                            {!selectedCustomer && <span className="text-[9px] md:text-[10px] text-red-400 -mt-1 md:-mt-2">(Select Customer)</span>}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const amountStr = (form.elements.namedItem('amount') as HTMLInputElement).value;
                            const amountNum = parseFloat(amountStr);
                            const method = (form.elements.namedItem('method') as HTMLSelectElement).value as PaymentMethod;

                            if (!validateNumericField(amountNum, 'Amount', 0.01, showToast)) return;

                            const alreadyPaid = multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0);
                            const remaining = totalDue - alreadyPaid;

                            if (amountNum > remaining + 0.01) {
                                showToast(`Amount cannot exceed remaining balance (₦${remaining.toLocaleString()})`, 'error');
                                return;
                            }

                            setMultipayEntries([...multipayEntries, { method, amount: amountStr }]);
                            form.reset();
                        }}>
                            <div className="flex flex-col md:flex-row gap-2">
                                <select name="method" className="flex-1 p-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                                    <option value={PaymentMethod.CASH}>Cash</option>
                                    <option value={PaymentMethod.CARD}>POS / Card</option>
                                    <option value={PaymentMethod.TRANSFER}>Transfer</option>
                                </select>
                                <div className="flex flex-1 gap-2">
                                    <input name="amount" type="number" step="0.01" placeholder="Amount" className="flex-1 p-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-full" />
                                    <button type="submit" className="p-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 shrink-0"><Plus className="w-5 h-5" /></button>
                                </div>
                            </div>
                        </form>
                        <div className="space-y-2">
                            {multipayEntries?.map((entry, index) => (
                                <div key={index} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100">
                                    <span className="text-xs md:text-sm font-medium">{entry.method}: <span className="text-emerald-600">₦{parseFloat(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                                    <button onClick={() => setMultipayEntries(multipayEntries.filter((_, i) => i !== index))} className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"><X className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                        <div className="pt-4 border-t border-slate-200 space-y-2 text-[10px] md:text-sm uppercase font-bold tracking-wider">
                            <div className="flex justify-between text-slate-500">
                                <span>Total Paid:</span>
                                <span className="text-slate-900 font-black">₦{multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Remaining:</span>
                                <span className={`font-black ${(totalDue - multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0)) > 0.01 ? 'text-red-600' : 'text-emerald-600'}`}>₦{(totalDue - multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {selectedCustomer && (totalDue - multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0)) > 0.01 && (
                             <div className="p-2 bg-orange-50 rounded-lg border border-orange-100">
                                <p className="text-[10px] md:text-[11px] text-orange-700 flex items-center gap-1 font-bold italic">
                                    <Info className="w-3 h-3" /> Balance will be added to customer debt
                                </p>
                            </div>
                        )}

                        <button
                            onClick={() => handleCheckout(PaymentMethod.MULTIPAY, multipayEntries)}
                            disabled={isProcessing || (() => {
                                const totalPaid = multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0);
                                if (selectedCustomer) {
                                    // Allow confirmation if totalPaid <= totalDue and multipayEntries not empty
                                    return multipayEntries.length === 0 || totalPaid > totalDue + 0.01;
                                }
                                // For walk-in, must be exact
                                return multipayEntries.length === 0 || Math.abs(totalPaid - totalDue) > 0.01;
                            })()}
                            className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                        >
                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Receipt className="w-5 h-5" />}
                            Confirm Payment
                        </button>
                    </div>
                )}

                <button onClick={() => { setIsPaymentModalOpen(false); setIsMultipayOpen(false); setMultipayEntries([]); }} className="w-full py-3 text-slate-500 font-medium hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">Cancel Transaction</button>
            </div>
        </div>
    );
}
