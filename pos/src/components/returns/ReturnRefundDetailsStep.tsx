import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaymentMethod, ReturnReason } from '../../types';

interface ReturnRefundDetailsStepProps {
    returnReason: ReturnReason | string;
    refundMethod: PaymentMethod;
    totalRefundAmount: number;
    setReturnReason: (reason: ReturnReason | string) => void;
    setRefundMethod: (method: PaymentMethod) => void;
    setStep: (step: number) => void;
}

export function ReturnRefundDetailsStep({
    returnReason, refundMethod, totalRefundAmount,
    setReturnReason, setRefundMethod, setStep
}: ReturnRefundDetailsStepProps) {
    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-base md:text-lg font-semibold text-slate-700 mb-4 md:mb-6">Refund Details</h2>

            <div className="space-y-4 md:space-y-6">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="returnReason" className="text-xs md:text-sm font-medium text-slate-700">Reason for Return:</label>
                    <select
                        id="returnReason"
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value as ReturnReason)}
                        className="w-full md:max-w-md border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                    >
                        {Object.values(ReturnReason).map((reason) => (
                            <option key={reason} value={reason}>{reason}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor="refundMethod" className="text-xs md:text-sm font-medium text-slate-700">Refund Method:</label>
                    <select
                        id="refundMethod"
                        value={refundMethod}
                        onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                        className="w-full md:max-w-md border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                    >
                        <option value={PaymentMethod.CASH}>Cash</option>
                        <option value={PaymentMethod.STORE_CREDIT}>Store Credit</option>
                        <option value={PaymentMethod.CARD}>POS Reversal / Card</option>
                        <option value={PaymentMethod.TRANSFER}>Bank Transfer</option>
                    </select>
                </div>
            </div>

            <div className="flex justify-between items-center mt-6 md:mt-8 p-4 md:p-6 bg-indigo-50 rounded-xl border border-indigo-100">
                <h3 className="text-sm md:text-xl font-bold text-indigo-700 uppercase tracking-wide">Total Refund:</h3>
                <span className="text-2xl md:text-4xl font-black text-indigo-800">₦{totalRefundAmount.toLocaleString()}</span>
            </div>

            <div className="flex justify-between gap-3 mt-6 md:mt-8">
                <button
                    onClick={() => setStep(2)}
                    className="flex-1 md:flex-none px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-slate-200"
                >
                    <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                    onClick={() => setStep(4)}
                    disabled={!returnReason || totalRefundAmount === 0}
                    className="flex-1 md:flex-none px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm font-bold"
                >
                    Next <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
