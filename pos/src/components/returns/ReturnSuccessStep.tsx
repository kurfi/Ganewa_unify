import React, { RefObject } from 'react';
import { CheckCircle, Download, Image as ImageIcon, RotateCcw, Printer } from 'lucide-react';
import ReturnReceiptDisplay from '../ReturnReceiptDisplay';
import { Sale, SaleItem, PaymentMethod, ReturnReason, Customer, User } from '../../types';
import { printThermalReturnReceipt } from '../../services/printerService';

interface ReturnSuccessStepProps {
    originalSale: Sale;
    totalRefundAmount: number;
    returnableItems: (SaleItem & { returnedQuantity: number; restockStatus: 'restocked' | 'damaged'; reason: ReturnReason | string })[];
    returnReason: ReturnReason | string;
    refundMethod: PaymentMethod;
    customer: Customer | null;
    currentUser: User | null;
    returnId: string | null;
    receiptRef: RefObject<HTMLDivElement>;
    handleDownloadReturnPdf: () => void;
    handleDownloadReturnImage: () => void;
    startNewReturn: () => void;
}

export function ReturnSuccessStep({
    originalSale, totalRefundAmount, returnableItems, returnReason,
    refundMethod, customer, currentUser, returnId, receiptRef,
    handleDownloadReturnPdf, handleDownloadReturnImage, startNewReturn
}: ReturnSuccessStepProps) {
    const handlePrintThermal = async () => {
        await printThermalReturnReceipt({
            originalSale,
            returnItems: returnableItems,
            totalRefundAmount,
            returnReason,
            refundMethod,
            customer,
            cashierUsername: currentUser?.username || 'N/A',
            returnDate: new Date(),
            returnId
        });
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 text-center">
            <CheckCircle className="w-12 h-12 md:w-16 md:h-16 text-emerald-500 mx-auto mb-3 md:mb-4" />
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-1 md:mb-2">Return Processed!</h2>
            <p className="text-sm md:text-base text-slate-600 mb-4 md:mb-6">Refund of ₦{totalRefundAmount.toLocaleString()} completed successfully.</p>

            <div className="mb-6 flex justify-center">
                <ReturnReceiptDisplay
                    ref={receiptRef}
                    originalSale={originalSale}
                    returnItems={returnableItems}
                    totalRefundAmount={totalRefundAmount}
                    returnReason={returnReason}
                    refundMethod={refundMethod}
                    customer={customer}
                    cashierUsername={currentUser?.username || 'N/A'}
                    returnDate={new Date()}
                    returnId={returnId}
                />
            </div>

            <div className="flex flex-wrap justify-center gap-2 md:gap-3 mt-6">
                <button
                    onClick={handlePrintThermal}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-xs md:text-sm font-bold"
                >
                    <Printer className="w-3.5 h-3.5 md:w-4 md:h-4" /> Thermal Print
                </button>
                <button
                    onClick={handleDownloadReturnPdf}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs md:text-sm"
                >
                    <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Save PDF
                </button>
                <button
                    onClick={handleDownloadReturnImage}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs md:text-sm"
                >
                    <ImageIcon className="w-3.5 h-3.5 md:w-4 md:h-4" /> Save Image
                </button>
            </div>

            <button
                onClick={startNewReturn}
                className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 mx-auto text-base md:text-lg font-semibold mt-6"
            >
                <RotateCcw className="w-5 h-5" /> Start New Return
            </button>
        </div>
    );
}
