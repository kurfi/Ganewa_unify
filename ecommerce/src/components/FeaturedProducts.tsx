import React from 'react';
import { Package, ChevronRight } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../contexts/CartContext';

interface FeaturedProductsProps {
    products: Product[];
}

export default function FeaturedProducts({ products }: FeaturedProductsProps) {
    const { addToCart, cart } = useCart();
    if (!products || products.length === 0) return null;

    return (
        <section id="specials" className="py-24 px-4 md:px-12 bg-slate-950 text-white relative overflow-hidden">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
                <div className="lg:w-1/2">
                    <h2 className="text-3xl md:text-5xl font-black mb-6 leading-tight">Featured <br /> Selection.</h2>
                    <p className="text-slate-400 mb-10 text-lg">Curated essentials chosen by our team this week. High quality, best value.</p>
                    <button className="group flex items-center gap-3 text-emerald-400 font-black uppercase text-sm tracking-widest">
                        View all specials <ChevronRight className="group-hover:translate-x-2 transition-transform" />
                    </button>
                </div>
                <div className="lg:w-12/12 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {products.map(p => {
                        const cartItem = cart.find(item => item.id === p.id);
                        const cartQty = cartItem?.quantity || 0;
                        const isAtMax = cartQty >= (p.quantity || 0);
                        const isInCart = cartQty > 0;

                        return (
                            <div
                                key={p.id}
                                onClick={() => { if (!isAtMax) addToCart(p.id!, p.quantity || 0); }}
                                className={`bg-white/5 backdrop-blur-sm border border-white/10 p-3 rounded-2xl hover:bg-white/10 transition-colors group flex flex-col items-center text-center active:scale-95 relative ${isAtMax ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                            >
                                {isAtMax ? (
                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-orange-500 text-white rounded-md text-[7px] font-black uppercase tracking-widest shadow-lg z-10">
                                        Max
                                    </div>
                                ) : isInCart ? (
                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-500 text-white rounded-md text-[7px] font-black uppercase tracking-widest shadow-lg z-10">
                                        In Cart
                                    </div>
                                ) : null}
                                <div className="w-full aspect-square bg-white/5 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
                                    {p.photo ? (
                                        <img src={p.photo} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    ) : (
                                        <Package className="w-6 h-6 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                                    )}
                                </div>
                                <h4 className="font-bold text-[13px] truncate w-full mb-0.5 text-slate-100">{p.name}</h4>
                                <p className="text-emerald-400 font-black text-sm italic">₦{(p.sellPrice || 0).toLocaleString()}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Decorative Gradients */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-600/20 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2"></div>
        </section>
    );
}
