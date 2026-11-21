import React from 'react';
import { Layers, Image as ImageIcon } from 'lucide-react';
import { Product } from '../../types';
import { getCloudinaryThumbnail } from '../../services/cloudinary';
import { ImageWithFallback } from '../ImageWithFallback';

interface ProductGridProps {
    products: any[] | undefined;
    isWholesaleMode: boolean;
    addToCart: (product: Product) => void;
}

export function ProductGrid({ products, isWholesaleMode, addToCart }: ProductGridProps) {
    return (
        <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-slate-50">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {products?.map(product => {
                    const isDisabled = product.isOutOfStock;
                    const statusLabel = product.isOutOfStock ? (product.hasExpiredStock ? 'Expired' : 'Out') : null;

                    return (
                        <div
                            key={product.id}
                            onClick={() => !isDisabled && addToCart(product)}
                            className={`bg-white p-3 md:p-4 rounded-xl border shadow-sm transition-all duration-200 group flex flex-col justify-between h-[130px] md:h-44 ${isDisabled
                                ? 'opacity-60 grayscale cursor-not-allowed border-slate-200'
                                : 'hover:shadow-md hover:border-emerald-400 hover:-translate-y-0.5 active:scale-95 cursor-pointer border-slate-200'
                                }`}
                        >
                            {product.photo && (
                                <div className="mb-2 h-16 md:h-20 overflow-hidden rounded-lg bg-slate-100">
                                    <ImageWithFallback
                                        src={getCloudinaryThumbnail(product.photo, 300, 300)}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                        fallback={
                                            <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                                                <ImageIcon className="w-5 h-5 opacity-60" />
                                            </div>
                                        }
                                    />
                                </div>
                            )}
                            <div className="min-w-0">
                                <div className="flex justify-between items-start gap-1">
                                    <h3 className="font-bold text-slate-800 line-clamp-2 text-[11px] md:text-sm leading-tight uppercase tracking-tight">{product.name}</h3>
                                    {statusLabel && (
                                        <span className={`text-[8px] md:text-[9px] px-1 md:px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${product.hasExpiredStock ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
                                            }`}>
                                            {statusLabel}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[9px] md:text-xs text-slate-400 mt-0.5 truncate font-medium">{product.category}</p>
                                <div className="mt-1 md:mt-2 flex items-center gap-1">
                                    <Layers className="w-2.5 h-2.5 md:w-3 md:h-3 text-slate-400" />
                                    <span className={`text-[9px] md:text-xs font-bold ${product.validStock <= product.minStockLevel ? 'text-amber-600' : 'text-slate-500'}`}>
                                        Qty: {product.validStock}
                                    </span>
                                </div>
                            </div>
                            <div className="flex justify-between items-end mt-1">
                                <div className="flex flex-col">
                                    {isWholesaleMode && product.wholesalePrice ? (
                                        <>
                                            <span className="font-black text-blue-600 text-xs md:text-base">₦{(product.wholesalePrice || 0).toLocaleString()}</span>
                                            <span className="text-[9px] text-slate-400 line-through">₦{(product.sellPrice || 0).toLocaleString()}</span>
                                        </>
                                    ) : (
                                        <span className="font-black text-emerald-600 text-xs md:text-base">₦{(product.sellPrice || 0).toLocaleString()}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
