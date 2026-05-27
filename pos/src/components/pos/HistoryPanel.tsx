import React from 'react';
import { format } from 'date-fns';
import { Search, Clock, User, Receipt, History, ArrowUpDown, SortAsc, SortDesc } from 'lucide-react';
import { Sale } from '../../types';

interface HistoryPanelProps {
    recentSales: Sale[] | undefined;
    historySearchQuery: string;
    setHistorySearchQuery: (query: string) => void;
    setReceiptSale: (sale: Sale) => void;
    historySortOrder: 'asc' | 'desc';
    setHistorySortOrder: (order: 'asc' | 'desc') => void;
}

export function HistoryPanel({ 
    recentSales, 
    historySearchQuery, 
    setHistorySearchQuery, 
    setReceiptSale,
    historySortOrder,
    setHistorySortOrder
}: HistoryPanelProps) {
    return (
        <div className="flex-1 overflow-y-auto bg-white">
            <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10 flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        placeholder="Search by Name or ID..."
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => setHistorySortOrder(historySortOrder === 'asc' ? 'desc' : 'asc')}
                    className="p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center"
                    title={historySortOrder === 'asc' ? "Sort Descending" : "Sort Ascending"}
                >
                    {historySortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                </button>
            </div>
            <div className="divide-y divide-slate-100">
                {recentSales && recentSales.length > 0 ? (
                    recentSales.map((sale) => (
                        <div key={sale.id} className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100">
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-bold text-slate-800">₦{(sale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{sale.paymentMethod}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-slate-500">
                                <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'MMM dd, HH:mm')}</div>
                                <div className="flex items-center gap-1"><User className="w-3 h-3" /> {sale.customerName}</div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-50 flex justify-end">
                                <button
                                    onClick={() => setReceiptSale(sale)}
                                    className="text-xs text-emerald-600 flex items-center gap-1 hover:underline"
                                >
                                    <Receipt className="w-3 h-3" /> Receipt
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                        <History className="w-8 h-8 opacity-20" />
                        <p>No recent sales.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
