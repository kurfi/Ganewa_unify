import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface InventoryTabProps {
    inventoryAnalysis: {
        lowStockProducts: any[];
        expiringBatches: any[];
    };
}

export function InventoryTab({ inventoryAnalysis }: InventoryTabProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-red-50 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <h3 className="font-bold text-red-900">Low Stock Alerts</h3>
                </div>
                <div className="p-4 overflow-y-auto max-h-[500px]">
                    {inventoryAnalysis.lowStockProducts.length === 0 ? (
                        <p className="text-slate-500 text-center py-4">All stock levels are healthy.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500">
                                        <th className="pb-2">Product</th>
                                        <th className="pb-2 text-center">Status</th>
                                        <th className="pb-2 text-right">Current Stock</th>
                                        <th className="pb-2 text-right">Min Stock</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {inventoryAnalysis.lowStockProducts.map(p => (
                                        <tr key={p.id}>
                                            <td className="py-3 font-medium text-slate-800">{p.name}</td>
                                            <td className="py-3 text-center">
                                                {p.currentStock <= 0 ? (
                                                    <span className="px-2.5 py-0.5 inline-flex text-[10px] md:text-xs leading-5 font-bold rounded-full bg-red-100 text-red-800 uppercase tracking-wider">
                                                        Out of Stock
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 inline-flex text-[10px] md:text-xs leading-5 font-bold rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
                                                        Low Stock
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`py-3 text-right font-bold ${p.currentStock <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{p.currentStock}</td>
                                            <td className="py-3 text-right text-slate-500">{p.minStockLevel}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
