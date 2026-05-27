import React from 'react';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { Sale, SaleItem, PaymentMethod, ReturnReason } from '../../types';

interface ReturnReviewStepProps {
    originalSale: Sale;
    refundMethod: PaymentMethod;
    returnReason: ReturnReason | string;
    returnableItems: (SaleItem & { returnedQuantity: number; restockStatus: 'restocked' | 'damaged'; reason: ReturnReason | string })[];
    totalRefundAmount: number;
    setStep: (step: number) => void;
    handleProcessReturn: () => void;
}

export function ReturnReviewStep({
    originalSale, refundMethod, returnReason, returnableItems,
    totalRefundAmount, setStep, handleProcessReturn
}: ReturnReviewStepProps) {
    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-base md:text-lg font-semibold text-slate-700 mb-4 md:mb-6">Review & Confirm Return</h2>

            {/* Sale Info Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6 text-xs md:text-sm text-slate-700 border-b border-slate-100 pb-4 md:pb-6">
                <div className="space-y-1">
                    <p><strong>Sale ID:</strong> #{originalSale.id}</p>
                    <p><strong>Date:</strong> {format(originalSale.date, 'MMM dd, yyyy HH:mm')}</p>
                </div>
                <div className="space-y-1">
                    <p className="truncate"><strong>Customer:</strong> {originalSale.customerName || 'Walk-in'}</p>
                    <p><strong>Refund Via:</strong> {refundMethod}</p>
                </div>
                <div className="space-y-1 sm:text-right">
                    <p><strong>Reason:</strong> {returnReason}</p>
                </div>
            </div>

            {/* Items to be Returned */}
            <div className="overflow-x-auto overflow-y-hidden mb-4 md:mb-6">
                <h3 className="font-bold text-xs md:text-sm text-slate-500 uppercase tracking-wider mb-2 md:mb-3">Items to Return</h3>
                <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
                    <thead className="bg-slate-50 hidden md:table-header-group">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Product</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Qty</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider text-right">Refund</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {returnableItems.filter(item => item.returnedQuantity > 0).map((item) => (
                            <React.Fragment key={item.productId}>
                                {/* Desktop Row */}
                                <tr className="hidden md:table-row">
                                    <td className="px-3 py-2 whitespace-nowrap">{item.productName}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.returnedQuantity}</td>
                                    <td className="px-3 py-2 whitespace-nowrap capitalize">{item.restockStatus}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-right font-bold text-indigo-600">
                                        ₦{(item.returnedQuantity * item.price).toLocaleString()}
                                    </td>
                                </tr>

                                {/* Mobile Card */}
                                <tr className="md:hidden">
                                    <td colSpan={4} className="px-0 py-2">
                                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{item.productName}</p>
                                                <p className="text-[10px] text-slate-500">{item.returnedQuantity} units • <span className="capitalize">{item.restockStatus}</span></p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-indigo-600 text-sm">₦{(item.returnedQuantity * item.price).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-between items-center mt-6 md:mt-8 p-4 md:p-6 bg-indigo-50 rounded-xl border border-indigo-100">
                <h3 className="text-sm md:text-xl font-bold text-indigo-700">Final Refund:</h3>
                <span className="text-2xl md:text-4xl font-black text-indigo-800">₦{totalRefundAmount.toLocaleString()}</span>
            </div>

            <div className="flex flex-col md:flex-row justify-between gap-3 mt-6 md:mt-8">
                <button
                    onClick={() => setStep(3)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-slate-200 order-2 md:order-1"
                >
                    <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                    onClick={handleProcessReturn}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-base md:text-lg font-bold order-1 md:order-2 shadow-lg shadow-emerald-200"
                >
                    <RotateCcw className="w-5 h-5" /> Process Return
                </button>
            </div>
        </div>
    );
}
