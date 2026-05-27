import React from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { Product } from '../../types';

interface InventoryMobileListProps {
    products: Product[] | undefined;
    handleOpenModal: (product?: Product) => void;
    handleDelete: (product: Product) => void;
}

export function InventoryMobileList({ products, handleOpenModal, handleDelete }: InventoryMobileListProps) {
    return (
        <div className="md:hidden grid grid-cols-1 gap-4 p-4 bg-slate-50/50">
            {products?.map(product => (
                <div key={product.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-slate-800 uppercase tracking-tight leading-tight">{product.name}</h3>
                        </div>
                        <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${product.quantity <= product.minStockLevel ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {product.quantity} in stock
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-b border-slate-100 py-3">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Cost</span>
                            <span className="text-xs font-bold text-slate-700">₦{(product.buyPrice || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Wholesale</span>
                            <span className="text-xs font-bold text-blue-600">₦{(product.wholesalePrice || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Retail</span>
                            <span className="text-xs font-bold text-emerald-600">₦{(product.sellPrice || 0).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">{product.category}</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleOpenModal(product)}
                                className="p-2 bg-blue-50 text-blue-600 rounded-lg font-bold flex items-center gap-1.5"
                            >
                                <Edit className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                                onClick={() => handleDelete(product)}
                                className="p-2 bg-red-50 text-red-600 rounded-lg font-bold flex items-center gap-1.5"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
