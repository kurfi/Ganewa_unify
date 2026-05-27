import React from 'react';
import { FileText, Search } from 'lucide-react';
import { format } from 'date-fns';

interface SalesTabProps {
    salesSearchQuery: string;
    setSalesSearchQuery: (query: string) => void;
    filteredSales: any[];
    loading: boolean;
}

export function SalesTab({ salesSearchQuery, setSalesSearchQuery, filteredSales, loading }: SalesTabProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <h2 className="font-semibold text-slate-800">Detailed Sales Log</h2>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search sales..."
                        value={salesSearchQuery}
                        onChange={(e) => setSalesSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                </div>
            </div>
            <div className="overflow-x-auto">
                {/* Desktop Table */}
                <table className="hidden md:table w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="p-4 font-medium">Date</th>
                            <th className="p-4 font-medium">Customer</th>
                            <th className="p-4 font-medium">Payment</th>
                            <th className="p-4 font-medium">Items</th>
                            <th className="p-4 font-medium text-right">Profit</th>
                            <th className="p-4 font-medium text-right">Discount</th>
                            <th className="p-4 font-medium text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredSales.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-slate-400">
                                    {loading ? "Loading..." : "No sales found matching your criteria."}
                                </td>
                            </tr>
                        ) : (
                            filteredSales.map((sale) => {
                                const saleCost = (sale.items || []).reduce((itemSum: number, item: any) => {
                                    return itemSum + (item.quantity * (item.costPrice || 0));
                                }, 0);
                                const saleProfit = sale.finalAmount - saleCost;

                                return (
                                    <tr key={sale.id} className="hover:bg-slate-50">
                                        <td className="p-4">
                                            <div className="font-medium text-slate-900">{format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'MMM dd, yyyy')}</div>
                                            <div className="text-xs text-slate-500">{format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'HH:mm')}</div>
                                        </td>
                                        <td className="p-4 text-slate-700">{sale.customerName || 'Walk-in'}</td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-600 border border-slate-200">
                                                {sale.paymentMethod}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-600">
                                            {(sale.items?.length || 0)} items
                                        </td>
                                        <td className={`p-4 text-right font-medium ${saleProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            ₦{(saleProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-4 text-right text-orange-500">
                                            {(sale.discount || 0) > 0 ? `-₦${(sale.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                        <td className="p-4 text-right font-bold text-slate-900">
                                            ₦{(sale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>

                {/* Mobile View */}
                <div className="md:hidden divide-y divide-slate-100 bg-slate-50/30">
                    {filteredSales.map((sale) => {
                        const saleCost = (sale.items || []).reduce((itemSum: number, item: any) => {
                            return itemSum + (item.quantity * (item.costPrice || 0));
                        }, 0);
                        const saleProfit = sale.finalAmount - saleCost;

                        return (
                            <div key={sale.id} className="p-4 space-y-3 bg-white mb-2 shadow-sm border-b border-slate-100">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-black text-slate-800 text-[10px] uppercase tracking-tight">{format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'MMM dd, HH:mm')}</p>
                                        <p className="text-xs font-bold text-slate-500">{sale.customerName || 'Walk-in Customer'}</p>
                                    </div>
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                                        {sale.paymentMethod}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-50">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Items</span>
                                        <span className="text-xs font-bold text-slate-700">{(sale.items?.length || 0)}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Profit</span>
                                        <span className={`text-xs font-bold ${saleProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>₦{(saleProfit || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest text-slate-900">Total</span>
                                        <span className="text-xs font-bold text-slate-900">₦{(sale.finalAmount || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
