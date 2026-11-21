import React from 'react';
import { Package, Plus } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { getCloudinaryThumbnail } from '../utils/cloudinary';

interface ProductCardProps {
    product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
    const { addToCart, cart } = useCart();
    const cartItem = cart.find(item => item.id === product.id);
    const cartQty = cartItem?.quantity || 0;
    const isInCart = cartQty > 0;
    const isAtMax = cartQty >= (product.quantity || 0);

    return (
        <div
            className={`group relative ${isAtMax ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={() => { if (!isAtMax) addToCart(product.id!, product.quantity || 0); }}
        >
            <div className={`premium-card rounded-lg p-1.5 sm:p-2 flex flex-col h-full hover:border-emerald-500/50 group-active:scale-95 transition-all ${isAtMax ? 'opacity-60' : ''}`}>
                <div className="relative aspect-square rounded-lg bg-slate-50 mb-2 overflow-hidden flex items-center justify-center group-hover:bg-emerald-50/30 transition-colors">
                    {product.photo ? (
                        <img
                            src={getCloudinaryThumbnail(product.photo, 400, 400)}
                            alt={product.name}
                            className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-700"
                        />
                    ) : (
                        <Package className="w-8 h-8 text-slate-200 group-hover:text-emerald-100 transition-colors" />
                    )}

                    <span className="absolute top-2 left-2 px-2 py-1 bg-white/90 backdrop-blur-md rounded-lg text-[8px] font-black uppercase text-slate-900 shadow-sm tracking-widest">
                        {product.category}
                    </span>

                    {isAtMax ? (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-orange-500 text-white rounded-md text-[7px] font-black uppercase tracking-widest shadow-lg animate-in fade-in zoom-in duration-300">
                            Max
                        </div>
                    ) : isInCart ? (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-500 text-white rounded-md text-[7px] font-black uppercase tracking-widest shadow-lg animate-in fade-in zoom-in duration-300">
                            Added
                        </div>
                    ) : null}
                </div>

                <h3 className="font-bold text-xs sm:text-[13px] text-slate-900 mb-0.5 leading-tight group-hover:text-emerald-600 transition-colors truncate">{product.name}</h3>
                {product.quantity < 5 && <span className="text-[8px] font-bold text-red-500 uppercase tracking-wider">Low stock</span>}

                <div className="mt-auto pt-1">
                    <span className="text-sm sm:text-base font-black text-slate-950">₦{(product.sellPrice || 0).toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}
