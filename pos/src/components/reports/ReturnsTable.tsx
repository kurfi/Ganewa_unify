import React from 'react';
import { format } from 'date-fns';
import { CheckCircle, XCircle } from 'lucide-react';
import { Return, ReturnedItem } from '../../types';

interface ReturnsTableProps {
    returns: (Return & { returnedItems: ReturnedItem[] })[];
}

export function ReturnsTable({ returns }: ReturnsTableProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-slate-200">
                <h2 className="text-base md:text-lg font-semibold text-slate-700">Returns History</h2>
            </div>
            <div className="overflow-x-auto">
                {/* Desktop Table View */}
                <table className="hidden md:table min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Return ID</th>
                            <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Original Sale</th>
                            <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Customer</th>
                            <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Reason</th>
                            <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Refund</th>
                            <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Amount</th>
                            <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Items</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {returns.length > 0 ? (
                            returns.map(ret => (
                                <tr key={ret.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 whitespace-nowrap font-medium text-slate-400 text-[10px]">#{ret.id}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">{format(ret.returnDate, 'MMM dd, yyyy HH:mm')}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-slate-400">#{ret.saleId}</td>
                                    <td className="px-4 py-2 whitespace-nowrap font-medium">{ret.customerName || 'Walk-in'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-slate-500">{ret.reason}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-[10px] uppercase font-bold text-slate-400">{ret.paymentMethod}</td>
                                    <td className="px-4 py-2 whitespace-nowrap font-bold text-emerald-600">₦{(ret.totalRefundAmount || 0).toLocaleString()}</td>
                                    <td className="px-4 py-2">
                                        <div className="max-w-[200px] truncate space-y-1">
                                            {ret.returnedItems?.map((item, index) => (
                                                <div key={index} className="flex items-center gap-1 text-[10px]">
                                                    {item.restockStatus === 'restocked' ? (
                                                        <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                                                    ) : (
                                                        <XCircle className="w-2.5 h-2.5 text-red-500" />
                                                    )}
                                                    {item.productName} ({item.quantity})
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No returns found matching your criteria.</td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-slate-100">
                    {returns.map(ret => (
                        <div key={ret.id} className="p-4 bg-white space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Return #{ret.id.slice(-6)}</p>
                                    <p className="font-bold text-slate-800 text-sm">{ret.customerName || 'Walk-in Customer'}</p>
                                    <p className="text-[10px] text-slate-400">{format(ret.returnDate, 'MMM dd, yyyy')}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-emerald-600">₦{(ret.totalRefundAmount || 0).toLocaleString()}</p>
                                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{ret.paymentMethod}</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-lg p-2 space-y-1">
                                <p className="text-[8px] text-slate-400 font-bold uppercase mb-1">Items Returned</p>
                                {ret.returnedItems?.map((item, index) => (
                                    <div key={index} className="flex items-center justify-between text-[10px]">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            {item.restockStatus === 'restocked' ? (
                                                <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                                            ) : (
                                                <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                                            )}
                                            <span className="truncate text-slate-700">{item.productName}</span>
                                        </div>
                                        <span className="font-bold text-slate-500 shrink-0">x{item.quantity}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-center pt-1">
                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{ret.reason}</span>
                                <span className="text-[8px] text-slate-400">Sale #{ret.saleId.slice(-6)}</span>
                            </div>
                        </div>
                    ))}
                    {returns.length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No returns recorded.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
