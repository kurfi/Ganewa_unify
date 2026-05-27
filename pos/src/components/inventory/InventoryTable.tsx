import React from 'react';
import { AlertTriangle, Edit, Trash2 } from 'lucide-react';
import { Product } from '../../types';

interface InventoryTableProps {
    products: Product[] | undefined;
    handleOpenModal: (product?: Product) => void;
    handleDelete: (product: Product) => void;
}

export function InventoryTable({ products, handleOpenModal, handleDelete }: InventoryTableProps) {
    return (
        <table className="hidden md:table w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-[30%]">Product</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-[15%]">Category</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[10%]">Cost</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[10%] whitespace-nowrap">Wholesale</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[10%] whitespace-nowrap">Sell Price</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-[10%]">Stock</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[10%]">Value</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[5%]"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {products?.map(product => (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="p-4">
                            <div className="font-bold text-slate-800 truncate" title={product.name}>{product.name}</div>
                        </td>
                        <td className="p-4 text-sm text-slate-600 whitespace-nowrap">{product.category}</td>
                        <td className="p-4 text-sm text-slate-600 text-right whitespace-nowrap">₦{(product.buyPrice || 0).toLocaleString()}</td>
                        <td className="p-4 text-sm text-blue-600 font-medium text-right whitespace-nowrap">₦{(product.wholesalePrice || 0).toLocaleString()}</td>
                        <td className="p-4 text-sm font-bold text-emerald-600 text-right whitespace-nowrap">₦{(product.sellPrice || 0).toLocaleString()}</td>
                        <td className="p-4 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center">
                                <span className={`font-bold ${product.quantity <= product.minStockLevel ? 'text-red-500' : 'text-slate-700'}`}>
                                    {product.quantity}
                                </span>
                                {product.quantity <= product.minStockLevel && (
                                    <span className="text-[10px] text-red-500 font-bold bg-red-100 px-1.5 rounded-full flex items-center gap-1">
                                        <AlertTriangle className="w-2 h-2" /> Low
                                    </span>
                                )}
                            </div>
                        </td>
                        <td className="p-4 text-sm text-slate-600 text-right whitespace-nowrap">₦{(product.quantity * (product.sellPrice || 0)).toLocaleString()}</td>
                        <td className="p-4 text-right whitespace-nowrap">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleOpenModal(product)}
                                    className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
                                    title="Edit"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(product)}
                                    className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
