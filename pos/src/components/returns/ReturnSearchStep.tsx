import React from 'react';
import { Search, Calendar, User, Receipt, CreditCard } from 'lucide-react';
import { Sale } from '../../types';
import { format } from 'date-fns';

interface ReturnSearchStepProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    handleSearchSale: () => void;
    searchResults: Sale[];
    handleSelectSale: (sale: Sale) => void;
}

export function ReturnSearchStep({
    searchQuery,
    setSearchQuery,
    handleSearchSale,
    searchResults,
    handleSelectSale
}: ReturnSearchStepProps) {
    return (
        <div className="space-y-4 md:space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base md:text-lg font-semibold text-slate-700 mb-3 md:mb-4">Find Original Sale</h2>
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                            placeholder="Sale ID, Name, or Invoice #"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') handleSearchSale();
                            }}
                        />
                    </div>
                    <button
                        onClick={handleSearchSale}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                        <Search className="w-4 h-4" /> Search
                    </button>
                </div>
                <p className="mt-3 md:mt-4 text-[10px] md:text-sm text-slate-500">Search by ID, customer name, or invoice number to begin.</p>
            </div>

            {searchResults.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-sm font-semibold text-slate-700">Multiple Sales Found</h3>
                        <p className="text-xs text-slate-500">Please select the correct sale to process a return.</p>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                        {searchResults.map((sale) => (
                            <button
                                key={sale.id}
                                onClick={() => handleSelectSale(sale)}
                                className="w-full p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors text-left"
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Receipt className="w-4 h-4 text-slate-400" />
                                        <span className="font-medium text-slate-900">Sale #{sale.invoiceNo || sale.id?.slice(0, 8)}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                            sale.paymentMethod === 'CREDIT' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                        }`}>
                                            {sale.paymentMethod}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {format(new Date(sale.date), 'MMM dd, yyyy HH:mm')}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <User className="w-3.5 h-3.5" />
                                            {sale.customerName || 'Walk-in Customer'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className="text-lg font-bold text-slate-900">₦{(sale.finalAmount || 0).toLocaleString()}</span>
                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">{sale.items.length} items</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
