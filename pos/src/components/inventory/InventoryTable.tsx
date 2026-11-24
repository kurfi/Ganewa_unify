import React from 'react';
import { AlertTriangle, Edit, Trash2, Tag } from 'lucide-react';
import { Product } from '../../types';
import { useActiveCategories } from '../../hooks/useActiveCategories';

interface InventoryTableProps {
    products: Product[] | undefined;
    handleOpenModal: (product?: Product) => void;
    handleDelete: (product: Product) => void;
    handleOpenLabelModal?: (product: Product) => void;
}

export function InventoryTable({ products, handleOpenModal, handleDelete, handleOpenLabelModal }: InventoryTableProps) {
    const { categories } = useActiveCategories();
    const categoryNameMap = React.useMemo(() => {
        const m = new Map<string, string>();
        categories.forEach(c => { if (c.id) m.set(c.id, c.name); });
        return m;
    }, [categories]);
    return (
        <table className="hidden md:table w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-[27%]">Product</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-[13%]">Category</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[9%]">Cost</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[10%] whitespace-nowrap">Wholesale</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[10%] whitespace-nowrap">Sell Price</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-[8%]">Stock</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[9%]">Value</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right w-[14%]"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {products?.map(product => (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="p-4">
                            <div className="font-bold text-slate-800 truncate" title={product.name}>{product.name}</div>
                            {product.barcode && (
                                <div className="text-[11px] text-slate-400 font-mono">Barcode: {product.barcode}</div>
                            )}
                        </td>
                        <td className="p-4 text-sm text-slate-600 whitespace-nowrap">
                            {(product.categoryId && categoryNameMap.get(product.categoryId)) || product.category || '—'}
                        </td>
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
                            <div className="flex justify-end items-center gap-1.5 transition-opacity">
                                {/* Print Labels button — opens modal with custom quantity (50, 78, 100, etc.) */}
                                <button
                                    onClick={() => handleOpenLabelModal?.(product)}
                                    className="px-2 py-1 bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-lg text-xs font-semibold border border-slate-200 hover:border-emerald-300 transition-colors flex items-center gap-1 shadow-xs"
                                    title="Print barcode labels (e.g. 50, 78, 100)"
                                >
                                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Labels</span>
                                </button>

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
