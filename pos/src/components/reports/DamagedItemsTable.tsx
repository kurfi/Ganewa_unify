import React from 'react';
import { format } from 'date-fns';
import { ReturnedItem, Return, User } from '../../types';

interface DamagedItemsTableProps {
    items: ReturnedItem[];
    returns: Return[] | undefined;
    users: User[] | undefined;
}

export function DamagedItemsTable({ items, returns, users }: DamagedItemsTableProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-slate-200">
                <h2 className="text-base md:text-lg font-semibold text-slate-700">Damaged Items History</h2>
            </div>
            <div className="overflow-x-auto">
                {/* Desktop Table View */}
                <table className="hidden md:table min-w-full divide-y divide-slate-200 text-sm text-slate-800">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-slate-600 uppercase tracking-wider text-xs">Return ID</th>
                            <th className="px-4 py-2 text-left text-slate-600 uppercase tracking-wider text-xs">Product</th>
                            <th className="px-4 py-2 text-left text-slate-600 uppercase tracking-wider text-xs">Qty Damaged</th>
                            <th className="px-4 py-2 text-left text-slate-600 uppercase tracking-wider text-xs">Value Lost</th>
                            <th className="px-4 py-2 text-left text-slate-600 uppercase tracking-wider text-xs">Date</th>
                            <th className="px-4 py-2 text-left text-slate-600 uppercase tracking-wider text-xs">Staff</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 text-slate-800">
                        {items.length > 0 ? (
                            items.map(item => {
                                const associatedReturn = returns?.find(ret => ret.id === item.returnId);
                                const returnDate = associatedReturn ? format(associatedReturn.returnDate, 'MMM dd, yyyy HH:mm') : 'N/A';
                                const staffName = users?.find(u => u.id === associatedReturn?.staffId)?.username || 'N/A';
                                const itemName = item.productName || (item as any).name || 'Unknown Product';
                                return (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 whitespace-nowrap font-medium text-slate-500 text-xs">#{item.returnId}</td>
                                        <td className="px-4 py-2 text-slate-800 font-medium text-sm">
                                            <span className="font-semibold text-slate-800 block" title={itemName}>{itemName}</span>
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-slate-700 font-medium text-xs">{item.quantity}</td>
                                        <td className="px-4 py-2 whitespace-nowrap font-bold text-red-600 text-sm">₦{item.valueLost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-slate-700 text-xs">{returnDate}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-slate-600 text-xs">{staffName}</td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={6} className="px-4 py-4 text-center text-slate-500">No damaged items found matching your criteria.</td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-slate-100">
                    {items.map(item => {
                        const associatedReturn = returns?.find(ret => ret.id === item.returnId);
                        const returnDate = associatedReturn ? format(associatedReturn.returnDate, 'MMM dd, yyyy') : 'N/A';
                        const staffName = users?.find(u => u.id === associatedReturn?.staffId)?.username || 'N/A';
                        return (
                            <div key={item.id} className="p-4 bg-white space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Return #{item.returnId}</p>
                                        <p className="font-black text-slate-800 text-xs uppercase">{item.productName}</p>
                                    </div>
                                    <span className="text-sm font-black text-red-500">₦{item.valueLost?.toLocaleString() || '0'}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-50">
                                    <div>
                                        <span className="text-[8px] text-slate-400 font-bold uppercase block">Qty</span>
                                        <span className="text-xs font-bold text-slate-700">{item.quantity}</span>
                                    </div>
                                    <div>
                                        <span className="text-[8px] text-slate-400 font-bold uppercase block">Date</span>
                                        <span className="text-xs font-bold text-slate-700">{returnDate}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[8px] text-slate-400 font-bold uppercase block">Staff</span>
                                        <span className="text-xs font-bold text-slate-700">{staffName}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {items.length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No damaged items recorded.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
