import React from 'react';
import { RotateCcw, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '../../contexts/ToastContext';
import { validateNumericField } from '../../utils/validation';
import { Sale, SaleItem, ReturnReason } from '../../types';

interface ReturnItemsStepProps {
    originalSale: Sale;
    returnableItems: (SaleItem & { returnedQuantity: number; restockStatus: 'restocked' | 'damaged'; reason: ReturnReason | string })[];
    handleReturnAllItems: () => void;
    handleReturnAllOfThisItem: (productId: string) => void;
    handleQuantityChange: (productId: string, quantity: number, originalItem: SaleItem) => void;
    handleRestockStatusChange: (productId: string, status: 'restocked' | 'damaged') => void;
    startNewReturn: () => void;
    setStep: (step: number) => void;
}

export function ReturnItemsStep({
    originalSale, returnableItems, handleReturnAllItems, handleReturnAllOfThisItem,
    handleQuantityChange, handleRestockStatusChange, startNewReturn, setStep
}: ReturnItemsStepProps) {
    const { showToast } = useToast();

    const handleQuantityInputChange = (productId: string, value: string, originalItem: SaleItem) => {
        const quantity = parseInt(value) || 0;

        if (!validateNumericField(quantity, 'Return quantity', 0, showToast)) {
            return;
        }

        const saleItem = originalSale.items.find(i => i.productId === productId);
        const alreadyReturned = saleItem?.returnedQuantity || 0;
        const maxAvailableToReturn = Math.max(0, (saleItem?.quantity || 0) - alreadyReturned);

        if (quantity > maxAvailableToReturn) {
            showToast(`Cannot return more than available (${maxAvailableToReturn})`, 'error');
            return;
        }

        handleQuantityChange(productId, quantity, originalItem);
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-base md:text-lg font-semibold text-slate-700 mb-3 md:mb-4">Select Items for Return</h2>

            {/* Sale Info Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6 text-xs md:text-sm text-slate-700 bg-slate-50 p-3 md:p-4 rounded-lg">
                <div>
                    <p><strong>Sale ID:</strong> #{originalSale.id}</p>
                    <p><strong>Date:</strong> {format(originalSale.date, 'MMM dd, yyyy')}</p>
                </div>
                <div>
                    <p className="truncate"><strong>Customer:</strong> {originalSale.customerName || 'Walk-in'}</p>
                    <p><strong>Method:</strong> {originalSale.paymentMethod}</p>
                </div>
                <div className="sm:text-right">
                    <p className="text-base md:text-lg font-bold text-indigo-600"><strong>Total:</strong> ₦{(originalSale.finalAmount || 0).toLocaleString()}</p>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={handleReturnAllItems}
                    className="flex-1 md:flex-none px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 text-xs font-bold uppercase"
                >
                    <RotateCcw className="w-3.5 h-3.5" /> Return All
                </button>
            </div>

            {/* Returnable Items Table */}
            <div className="overflow-x-auto overflow-y-hidden mb-4 md:mb-6">
                <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm text-slate-800">
                    <thead className="bg-slate-50 hidden md:table-header-group">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">Product</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">Max</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">Price</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">Qty</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">Refund</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 text-slate-800">
                        {returnableItems.map((item) => {
                            const originalSoldItem = originalSale.items.find(saleItem => saleItem.productId === item.productId);
                            const alreadyReturned = originalSoldItem?.returnedQuantity || 0;
                            const maxReturnable = Math.max(0, item.quantity - alreadyReturned);
                            const displayName = item.productName || (item as any).name || 'Unknown Product';
                            return (
                                <React.Fragment key={item.productId}>
                                    {/* Desktop Row */}
                                    <tr className="hidden md:table-row hover:bg-slate-50/75">
                                        <td className="px-3 py-2 text-slate-800 font-medium">
                                            <span className="font-semibold text-slate-800 block text-xs md:text-sm" title={displayName}>
                                                {displayName}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-medium">{maxReturnable}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-medium">₦{(item.price || 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <input
                                                type="number"
                                                min="0"
                                                max={maxReturnable}
                                                value={item.returnedQuantity}
                                                onChange={(e) =>
                                                    handleQuantityInputChange(
                                                        item.productId,
                                                        e.target.value,
                                                        originalSoldItem || item
                                                    )
                                                }
                                                className="w-16 border border-slate-300 rounded-md p-1 text-center text-slate-900 bg-white"
                                            />
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <select
                                                value={item.restockStatus}
                                                onChange={(e) =>
                                                    handleRestockStatusChange(
                                                        item.productId,
                                                        e.target.value as 'restocked' | 'damaged'
                                                    )
                                                }
                                                className="border border-slate-300 rounded-md p-1 bg-white text-slate-900"
                                            >
                                                <option value="restocked">Restock</option>
                                                <option value="damaged">Damaged</option>
                                            </select>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap font-bold text-indigo-600">
                                            ₦{(item.returnedQuantity * (item.price || 0)).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <button
                                                onClick={() => handleReturnAllOfThisItem(item.productId)}
                                                className="text-[10px] font-bold text-blue-600 hover:underline uppercase"
                                                disabled={maxReturnable <= 0}
                                            >
                                                Max
                                            </button>
                                        </td>
                                    </tr>

                                    {/* Mobile Card */}
                                    <tr className="md:hidden">
                                        <td colSpan={7} className="px-0 py-3">
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                                                <div className="flex justify-between items-start gap-2">
                                                    <span className="font-bold text-slate-800 text-sm">{displayName}</span>
                                                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded shrink-0">
                                                        ₦{(item.price || 0).toLocaleString()}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[9px] uppercase text-slate-500 font-bold">Return Qty</label>
                                                        <div className="flex items-center gap-1.5 mt-1">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={maxReturnable}
                                                                value={item.returnedQuantity}
                                                                onChange={(e) =>
                                                                    handleQuantityInputChange(
                                                                        item.productId,
                                                                        e.target.value,
                                                                        originalSoldItem || item
                                                                    )
                                                                }
                                                                className="w-full border border-slate-300 rounded-md p-1.5 text-center bg-white text-sm"
                                                            />
                                                            <button
                                                                onClick={() => handleReturnAllOfThisItem(item.productId)}
                                                                className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-2 rounded font-bold uppercase whitespace-nowrap"
                                                                disabled={maxReturnable <= 0}
                                                            >
                                                                Max
                                                            </button>
                                                        </div>
                                                        <p className="text-[9px] text-slate-400 mt-1">Max: {maxReturnable} avail.</p>
                                                    </div>

                                                    <div>
                                                        <label className="text-[9px] uppercase text-slate-500 font-bold">Status</label>
                                                        <select
                                                            value={item.restockStatus}
                                                            onChange={(e) =>
                                                                handleRestockStatusChange(
                                                                    item.productId,
                                                                    e.target.value as 'restocked' | 'damaged'
                                                                )
                                                            }
                                                            className="w-full mt-1 border border-slate-300 rounded-md p-1.5 bg-white text-xs"
                                                        >
                                                            <option value="restocked">Restock</option>
                                                            <option value="damaged">Damaged</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                                    <span className="text-[10px] text-slate-500 italic">Refund Subtotal:</span>
                                                    <span className="font-bold text-indigo-600 text-sm">₦{(item.returnedQuantity * (item.price || 0)).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-between gap-3 mt-4 md:mt-6">
                <button
                    onClick={startNewReturn}
                    className="flex-1 md:flex-none px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                >
                    Cancel
                </button>
                <button
                    onClick={() => setStep(3)}
                    disabled={returnableItems.every((item) => item.returnedQuantity === 0)}
                    className="flex-1 md:flex-none px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm font-bold"
                >
                    Next <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
