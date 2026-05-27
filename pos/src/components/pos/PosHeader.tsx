import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface PosHeaderProps {
    cartItemCount: number;
    isWholesaleMode: boolean;
    setIsWholesaleMode: (isWholesaleMode: boolean) => void;
    setMobileView: (view: 'catalog' | 'checkout') => void;
}

export function PosHeader({ cartItemCount, isWholesaleMode, setIsWholesaleMode, setMobileView }: PosHeaderProps) {
    return (
        <div className="flex justify-between items-center px-4 md:px-0 no-print">
            <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Point of Sale</h1>
            <div className="flex items-center gap-2 md:gap-4">
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 mr-2 shadow-sm">
                    <button
                        onClick={() => setIsWholesaleMode(false)}
                        className={`px-3 md:px-4 py-1 md:py-1.5 text-[10px] md:text-sm font-bold rounded-md transition-all ${!isWholesaleMode ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        RETAIL
                    </button>
                    <button
                        onClick={() => setIsWholesaleMode(true)}
                        className={`px-3 md:px-4 py-1 md:py-1.5 text-[10px] md:text-sm font-bold rounded-md transition-all ${isWholesaleMode ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        WHOLESALE
                    </button>
                </div>
                <button
                    onClick={() => setMobileView('checkout')}
                    className="lg:hidden relative p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors"
                >
                    <ShoppingCart className="w-5 h-5 md:w-6 md:h-6" />
                    {cartItemCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded-full border-2 border-white">
                            {cartItemCount}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}
