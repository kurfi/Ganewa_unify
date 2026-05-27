import React from 'react';
import { ShoppingCart, User, PauseCircle, CreditCard } from 'lucide-react';
import { SaleItem, Customer } from '../../types';
import { CustomerSearch } from './CustomerSearch';
import { roundTo2 } from '../../utils/math';

interface CartPanelProps {
    cart: SaleItem[];
    customers: Customer[] | undefined;
    selectedCustomer: Customer | null;
    setSelectedCustomer: (customer: Customer | null) => void;
    updateQuantity: (productId: string, delta: number) => void;
    removeFromCart: (productId: string) => void;
    calculateTotal: () => number;
    discount: number;
    setDiscount: (discount: number) => void;
    handleHoldSale: () => void;
    setIsPaymentModalOpen: (isOpen: boolean) => void;
    isAdmin: boolean;
}

export function CartPanel({
    cart, customers, selectedCustomer, setSelectedCustomer,
    updateQuantity, removeFromCart, calculateTotal, discount, setDiscount,
    handleHoldSale, setIsPaymentModalOpen, isAdmin
}: CartPanelProps) {
    return (
        <>
            <div className="px-4 pt-3 pb-3 border-b border-slate-200 bg-slate-50">
                <CustomerSearch
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    setSelectedCustomer={setSelectedCustomer}
                />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <ShoppingCart className="w-12 h-12 mb-2 opacity-20" />
                        <p className="text-sm md:text-base">Cart is empty</p>
                    </div>
                ) : (
                    cart?.map(item => (
                        <div key={item.productId} className="flex justify-between items-center p-2.5 md:p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="flex-1 min-w-0 pr-2">
                                <h4 className="font-medium text-slate-800 truncate text-xs md:text-sm">{item.productName}</h4>
                                <p className="text-[10px] md:text-xs text-slate-500">₦{item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / unit</p>
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={item.quantity === 0 ? '' : item.quantity}
                                    onChange={(e) => updateQuantity(item.productId, parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-12 md:w-16 px-1 py-1 text-center text-xs md:text-sm font-medium bg-white border border-slate-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                            </div>
                            <div className="ml-2 md:ml-3 text-right min-w-[55px] md:min-w-[60px]">
                                <p className="font-bold text-slate-800 text-xs md:text-sm">₦{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <button onClick={() => removeFromCart(item.productId)} className="text-[10px] md:text-xs text-red-400 hover:text-red-600 mt-0.5 md:mt-1">Remove</button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-4 md:p-6 bg-slate-900 text-white rounded-b-xl mt-auto">
                <div className="flex justify-between mb-2 text-xs md:text-sm text-slate-300">
                    <span>Subtotal</span>
                    <span>₦{calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center mb-4 md:mb-6 text-xs md:text-sm text-slate-300">
                    <span>Discount</span>
                    <input
                        type="number"
                        min="0"
                        max={calculateTotal()}
                        value={discount || ''}
                        onChange={(e) => setDiscount(roundTo2(Math.min(calculateTotal(), Math.max(0, parseFloat(e.target.value) || 0))))}
                        disabled={!isAdmin}
                        title={!isAdmin ? "Only admins can apply discounts" : ""}
                        className={`w-20 md:w-24 px-2 py-1 rounded bg-slate-800 border ${!isAdmin ? 'border-slate-700 opacity-50 cursor-not-allowed' : 'border-slate-700 focus:ring-2 focus:ring-emerald-500'} text-right text-white outline-none`}
                        placeholder="0.00"
                    />
                </div>
                <div className="flex justify-between mb-4 md:mb-6 text-lg md:text-xl font-bold text-white">
                    <span>Total</span>
                    <span>₦{roundTo2(Math.max(0, calculateTotal() - discount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                    <button
                        onClick={handleHoldSale}
                        disabled={cart.length === 0}
                        className="col-span-1 py-2.5 md:py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1 text-xs md:text-sm"
                    >
                        <PauseCircle className="w-4 h-4 md:w-5 md:h-5" />
                        <span className="hidden sm:inline">Hold</span>
                    </button>
                    <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        disabled={cart.length === 0}
                        className="col-span-2 py-2.5 md:py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm md:text-base"
                    >
                        <CreditCard className="w-4 h-4 md:w-5 md:h-5" />
                        Pay Now
                    </button>
                </div>
            </div>
        </>
    );
}
