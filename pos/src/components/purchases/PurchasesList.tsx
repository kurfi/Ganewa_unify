import React from 'react';
import { Calendar, User, Package } from 'lucide-react';
import { format } from 'date-fns';
import { Purchase } from '../../types';

interface PurchasesListProps {
    purchases: Purchase[];
}

export function PurchasesList({ purchases }: PurchasesListProps) {
    if (!purchases || purchases.length === 0) {
        return (
            <div className="flex-1 overflow-y-auto">
                <div className="p-12 text-center text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>No purchase records found</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto">
            {/* Desktop Table View */}
            <table className="hidden md:table w-full text-left border-collapse">
                <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap">Date</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap">Invoice #</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-full">Supplier</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap">Items</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right whitespace-nowrap">Total</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right whitespace-nowrap">Paid</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center whitespace-nowrap">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {purchases.map(purchase => (
                        <tr key={purchase.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-sm text-slate-600 space-y-1 whitespace-nowrap">
                                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {format((purchase.date as any)?.toDate?.() ?? new Date(purchase.date), 'MMM dd, yyyy')}</span>
                            </td>
                            <td className="p-4 text-sm font-medium text-slate-800 whitespace-nowrap">{purchase.invoiceNo}</td>
                            <td className="p-4 text-sm text-slate-600">
                                <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-slate-400" /> {purchase.supplierName}</span>
                            </td>
                            <td className="p-4 text-sm text-slate-600 whitespace-nowrap">{(purchase.items || []).length} items</td>
                            <td className="p-4 text-sm font-bold text-slate-800 text-right whitespace-nowrap">₦{(purchase.totalAmount || 0).toLocaleString()}</td>
                            <td className="p-4 text-sm text-slate-600 text-right whitespace-nowrap">₦{(purchase.paidAmount || 0).toLocaleString()}</td>
                            <td className="p-4 text-center whitespace-nowrap">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${purchase.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                    purchase.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                        'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}>
                                    {purchase.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Mobile Card View */}
            <div className="md:hidden grid grid-cols-1 gap-4 p-4 bg-slate-50/50">
                {purchases.map(purchase => (
                    <div key={purchase.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <h3 className="font-bold text-slate-800 uppercase tracking-tight leading-tight">{purchase.invoiceNo}</h3>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                                    <Calendar className="w-3 h-3" />
                                    {format((purchase.date as any)?.toDate?.() ?? new Date(purchase.date), 'MMM dd, yyyy')}
                                </div>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${purchase.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                purchase.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                    'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>
                                {purchase.status}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 py-2 border-t border-b border-slate-100">
                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                                <User className="w-4 h-4 text-slate-500" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none mb-1">Supplier</p>
                                <p className="text-xs font-bold text-slate-700 truncate">{purchase.supplierName}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Items</span>
                                <span className="text-xs font-bold text-slate-700">{(purchase.items || []).length}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Paid</span>
                                <span className="text-xs font-bold text-slate-600">₦{(purchase.paidAmount || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest text-emerald-600">Total</span>
                                <span className="text-xs font-bold text-emerald-600">₦{(purchase.totalAmount || 0).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
