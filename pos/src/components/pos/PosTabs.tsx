import React from 'react';
import { ShoppingCart, PauseCircle, History, X } from 'lucide-react';

interface PosTabsProps {
    activeTab: 'cart' | 'held' | 'history';
    setActiveTab: (tab: 'cart' | 'held' | 'history') => void;
    heldSalesCount: number;
    setMobileView: (view: 'catalog' | 'checkout') => void;
}

export function PosTabs({ activeTab, setActiveTab, heldSalesCount, setMobileView }: PosTabsProps) {
    return (
        <div className="flex border-b border-slate-200 bg-slate-50 lg:rounded-t-xl overflow-hidden">
            <button
                onClick={() => setActiveTab('cart')}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'cart'
                    ? 'bg-white text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
            >
                <ShoppingCart className="w-4 h-4" /> Sale
            </button>
            <button
                onClick={() => setActiveTab('held')}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${activeTab === 'held'
                    ? 'bg-white text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
            >
                <PauseCircle className="w-4 h-4" /> Held
                {heldSalesCount > 0 && (
                    <span className="ml-1 bg-amber-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
                        {heldSalesCount}
                    </span>
                )}
            </button>
            <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'history'
                    ? 'bg-white text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
            >
                <History className="w-4 h-4" /> History
            </button>
            <div className="lg:hidden flex items-center px-2">
                <button onClick={() => setMobileView('catalog')} className="p-2"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
        </div>
    );
}
