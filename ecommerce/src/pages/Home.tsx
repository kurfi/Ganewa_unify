import React, { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import type { Product } from '../types';

import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import FeaturedProducts from '../components/FeaturedProducts';
import ProductCard from '../components/ProductCard';
import Footer from '../components/Footer';

const getCategoryMetadata = (cat: string) => {
    const raw = cat ? cat.trim() : '';
    const map: Record<string, { label: string; emoji: string }> = {
        'All': { label: 'All Products', emoji: '✨' },
        'General': { label: 'Provisions', emoji: '📦' },
        'Grains, Noodles & Staples': { label: 'Grains & Staples', emoji: '🌾' },
        'Beverages (Drinks & Water)': { label: 'Drinks & Water', emoji: '🥤' },
        'Other/Miscellineous': { label: 'Miscellaneous', emoji: '🔮' },
        'Household & Insect Control': { label: 'Household Care', emoji: '🧹' },
        'Uncategorized': { label: 'Others', emoji: '🏷️' },
        'Seasonings, Condiments & Oil': { label: 'Cooking & Oils', emoji: '🍳' },
        'Milk & Dairy Products': { label: 'Dairy & Milk', emoji: '🥛' },
        'BISCUIT': { label: 'Snacks & Biscuits', emoji: '🍪' },
        'Hot Drinks (Tea, Coffee & Cocoa)': { label: 'Hot Drinks', emoji: '☕' },
        'FLOUR': { label: 'Baking & Flour', emoji: '🧁' },
        'VASELINE': { label: 'Vaseline Care', emoji: '🧴' },
        'STELLA': { label: 'Stella Cosmetics', emoji: '💄' },
        'Personal Care (Hair, Skin & Oral)': { label: 'Personal Care', emoji: '🧴' },
        'Soap & Detergent': { label: 'Soap & Detergent', emoji: '🧼' }
    };

    if (map[raw]) return map[raw];
    const formatted = raw.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    return { label: formatted, emoji: '🏷️' };
};

export default function Home() {
    const [products, setProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        let q = query(
            collection(db, 'products'),
            where('quantity', '>', 0)
        );

        if (activeCategory !== 'All') {
            q = query(q, where('category', '==', activeCategory));
        }

        // Add a limit to prevent massive reads
        q = query(q, limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const prods: Product[] = [];
            snapshot.forEach((doc) => {
                prods.push({ id: doc.id, ...doc.data() } as Product);
            });
            setProducts(prods);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching products:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeCategory]);

    const categories = ['All', 'General', 'Grains, Noodles & Staples', 'Beverages (Drinks & Water)', 'Other/Miscellineous', 'Household & Insect Control', 'Seasonings, Condiments & Oil', 'Milk & Dairy Products', 'BISCUIT', 'Hot Drinks (Tea, Coffee & Cocoa)', 'FLOUR', 'VASELINE', 'STELLA', 'Personal Care (Hair, Skin & Oral)', 'Soap & Detergent'];
    const featuredProducts = products.slice(0, 4);

    const filteredProducts = products.filter(p => {
        const name = (p.name || '').toLowerCase();
        const category = (p.category || '').toLowerCase();
        const query = searchQuery.toLowerCase().trim();

        if (!query) return true;

        // Expanded synonym list for smarter matches
        const synonymMap: Record<string, string[]> = {
            'drink': ['beverages', 'drinks', 'water', 'juice', 'soda', 'coke', 'pepsi', 'fanta', 'bottle'],
            'beverage': ['beverages', 'drinks', 'water', 'juice', 'soda'],
            'water': ['beverages', 'drinks', 'water'],
            'rice': ['grains', 'noodles', 'staples', 'food', 'spaghetti', 'semovita', 'pasta'],
            'spaghetti': ['grains', 'noodles', 'staples', 'pasta'],
            'noodle': ['grains', 'noodles', 'staples', 'indomie'],
            'staples': ['grains', 'noodles', 'staples'],
            'maggi': ['seasonings', 'condiments', 'oil', 'knorr', 'salt', 'pepper', 'spices'],
            'oil': ['seasonings', 'condiments', 'oil', 'veg oil', 'cooking oil'],
            'seasoning': ['seasonings', 'condiments', 'oil'],
            'milk': ['milk', 'dairy', 'butter', 'cheese', 'peak', 'lano', 'dano'],
            'dairy': ['milk', 'dairy', 'butter', 'cheese'],
            'biscuit': ['biscuit', 'snacks', 'cookies', 'biscuits'],
            'tea': ['hot drinks', 'coffee', 'cocoa', 'milo', 'bournvita', 'lipton'],
            'coffee': ['hot drinks', 'coffee', 'cocoa'],
            'flour': ['flour', 'baking'],
            'soap': ['soap', 'detergent', 'wash', 'cleaning', 'omo', 'klin'],
            'detergent': ['soap', 'detergent', 'wash', 'omo', 'klin'],
            'shampoo': ['personal care', 'hair', 'skin', 'oral', 'vaseline'],
            'lotion': ['personal care', 'hair', 'skin', 'oral', 'vaseline', 'stella'],
            'cream': ['personal care', 'hair', 'skin', 'oral', 'vaseline', 'stella']
        };

        // Standard substring checks
        let matchesSearch = name.includes(query) || category.includes(query);

        // Smart synonym expander checks
        if (!matchesSearch) {
            for (const [keyword, terms] of Object.entries(synonymMap)) {
                if (query.includes(keyword) || keyword.includes(query)) {
                    const matchesTerm = terms.some(term => name.includes(term) || category.includes(term));
                    if (matchesTerm) {
                        matchesSearch = true;
                        break;
                    }
                }
            }
        }

        return matchesSearch;
    });

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-slate-900 selection:bg-emerald-100 flex flex-col">
            {/* Top Banner */}
            <div className="bg-slate-900 text-white py-2 px-4 text-center text-[11px] font-black tracking-widest uppercase z-50 relative">
                🚀 Free delivery for orders over ₦20,000 in Kurfi Central!
            </div>

            <Navbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

            <Hero />

            {/* Filters Bar */}
            <section className="px-2 sm:px-4 md:px-12 py-4 relative sm:sticky sm:top-[80px] z-40 glass-nav border-b border-slate-100/80">
                <div className="flex flex-wrap gap-2 py-1 max-w-7xl mx-auto">
                    {categories.map(cat => {
                        const { label, emoji } = getCategoryMetadata(cat);
                        const isActive = activeCategory === cat;
                        return (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 border active:scale-95 duration-200 ${
                                    isActive
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-100 scale-105'
                                        : 'bg-white text-slate-600 hover:text-slate-900 border-slate-100 hover:border-slate-300'
                                }`}
                            >
                                <span className="text-sm">{emoji}</span>
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Main Catalog */}
            <main id="catalog" className="px-2 sm:px-4 md:px-12 py-6 sm:py-12 md:py-24 max-w-7xl mx-auto flex-1 w-full">
                <div className="text-center mb-6 sm:mb-10 md:mb-16">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="h-px w-8 bg-emerald-600"></div>
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Marketplace</span>
                        <div className="h-px w-8 bg-emerald-600"></div>
                    </div>
                    <h2 className="text-3xl md:text-5xl font-black text-slate-950">Store Catalog.</h2>
                    <span className="text-slate-400 text-sm font-medium">Displaying {filteredProducts.length} items</span>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-32">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
                    </div>
                ) : filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3">
                        {filteredProducts.map(product => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-32 bg-white rounded-[50px] border border-slate-100 shadow-sm flex flex-col items-center">
                        <div className="bg-slate-50 p-10 rounded-full mb-8">
                            <Package className="w-20 h-20 text-slate-200" />
                        </div>
                        <h3 className="text-3xl font-black text-slate-950 mb-3">Item not found.</h3>
                        <p className="text-slate-500 max-w-sm font-medium">We couldn't find matches for your current choice. Try another category or search term.</p>
                        <button
                            onClick={() => { setSearchQuery(''); setActiveCategory('All') }}
                            className="mt-10 font-black text-emerald-600 uppercase text-xs tracking-[0.3em] hover:text-emerald-700 transition-colors"
                        >
                            Clear all filters
                        </button>
                    </div>
                )}
            </main>

            <FeaturedProducts products={featuredProducts} />

            <Footer />
        </div>
    );
}
