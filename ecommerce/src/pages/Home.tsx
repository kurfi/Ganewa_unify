import React, { useState, useEffect } from 'react';
import { Package, Search, X, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import type { Product } from '../types';

import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import FeaturedProducts from '../components/FeaturedProducts';
import ProductCard from '../components/ProductCard';
import Footer from '../components/Footer';
import { useCart } from '../contexts/CartContext';

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
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [loading, setLoading] = useState(true);
    const [visibleCount, setVisibleCount] = useState(24);
    const { totalItems } = useCart();

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true);
            const CACHE_KEY = 'ecommerce_catalog_cache_v1';
            const TTL_MS = 5 * 60 * 1000; // 5-minute short-TTL cache

            try {
                // 1. Try reading valid cache from sessionStorage
                try {
                    const raw = sessionStorage.getItem(CACHE_KEY);
                    if (raw) {
                        const cached = JSON.parse(raw);
                        if (cached && typeof cached.timestamp === 'number' && Array.isArray(cached.products)) {
                            const isFresh = Date.now() - cached.timestamp < TTL_MS;
                            if (isFresh && cached.products.length > 0) {
                                setAllProducts(cached.products);
                                setLoading(false);
                                return;
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Failed to read sessionStorage products cache:", e);
                }

                // 2. Cache miss or expired: fetch fresh catalog from Firestore
                const q = query(
                    collection(db, 'products'),
                    where('deleted', '==', false)
                );

                const snapshot = await getDocs(q);
                const prods: Product[] = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data()
                } as Product));
                
                setAllProducts(prods);

                // 3. Cache the fetched result in sessionStorage
                try {
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        products: prods
                    }));
                } catch (e) {
                    console.warn("Failed to write products to sessionStorage:", e);
                }
            } catch (error) {
                console.error("Error fetching products:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    useEffect(() => {
        setVisibleCount(24);
    }, [activeCategory, searchQuery]);

    const categories = ['All', 'General', 'Grains, Noodles & Staples', 'Beverages (Drinks & Water)', 'Other/Miscellineous', 'Household & Insect Control', 'Seasonings, Condiments & Oil', 'Milk & Dairy Products', 'BISCUIT', 'Hot Drinks (Tea, Coffee & Cocoa)', 'FLOUR', 'VASELINE', 'STELLA', 'Personal Care (Hair, Skin & Oral)', 'Soap & Detergent'];
    
    // Select featured products (explicitly admin-tagged as featured, with fallback to well-stocked products with photos)
    const featuredProducts = (() => {
        const tagged = allProducts.filter((p: any) => p.featured === true || p.isFeatured === true);
        if (tagged.length >= 4) {
            return tagged.slice(0, 4);
        }
        const fallback = allProducts
            .filter((p: any) => p.featured !== true && p.isFeatured !== true && p.photo && p.quantity > 0)
            .sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
        return [...tagged, ...fallback].slice(0, 4);
    })();

    const filteredProducts = allProducts.filter(p => {
        // Only show products that are in stock (quantity > 0).
        // We do this locally instead of via a Firestore inequality filter because
        // `where('quantity', '>', 0)` silently drops docs where quantity is missing,
        // null, or a non-number — coercing to 0 here is safe and inclusive.
        const qty = typeof p.quantity === 'number' && isFinite(p.quantity) ? p.quantity : 0;
        if (qty <= 0) return false;

        // Filter by selected category
        if (activeCategory !== 'All' && p.category !== activeCategory) {
            return false;
        }

        const name = (p.name || '').toLowerCase();
        const category = (p.category || '').toLowerCase();
        // NOTE: `id` is intentionally excluded — matching against an internal Firestore
        // document ID has no legitimate search value and causes false positives when a
        // search term happens to substring-match a random auto-generated doc ID.
        const queryText = searchQuery.toLowerCase().trim();

        if (!queryText) return true;

        // Synonym map for smarter semantic matching.
        // Keys AND synonym values are whole words / short phrases — lookup is done
        // via whole-word token comparison (not substring), so "cream" only triggers the
        // 'cream' entry and does NOT accidentally expand via partial key matches.
        const synonymMap: Record<string, string[]> = {
            'drink':     ['beverages', 'drinks', 'water', 'juice', 'soda', 'coke', 'pepsi', 'fanta', 'bottle'],
            'beverage':  ['beverages', 'drinks', 'water', 'juice', 'soda'],
            'water':     ['beverages', 'drinks', 'water'],
            'rice':      ['grains', 'noodles', 'staples', 'food', 'spaghetti', 'semovita', 'pasta'],
            'spaghetti': ['grains', 'noodles', 'staples', 'pasta'],
            'noodle':    ['grains', 'noodles', 'staples', 'indomie'],
            'staples':   ['grains', 'noodles', 'staples'],
            'maggi':     ['seasonings', 'condiments', 'oil', 'knorr', 'salt', 'pepper', 'spices'],
            'oil':       ['seasonings', 'condiments', 'oil', 'veg oil', 'cooking oil'],
            'seasoning': ['seasonings', 'condiments', 'oil'],
            'milk':      ['milk', 'dairy', 'butter', 'cheese', 'peak', 'lano', 'dano'],
            'dairy':     ['milk', 'dairy', 'butter', 'cheese'],
            'biscuit':   ['biscuit', 'snacks', 'cookies', 'biscuits'],
            'tea':       ['hot drinks', 'coffee', 'cocoa', 'milo', 'bournvita', 'lipton'],
            'coffee':    ['hot drinks', 'coffee', 'cocoa'],
            'flour':     ['flour', 'baking'],
            'soap':      ['soap', 'detergent', 'wash', 'cleaning', 'omo', 'klin'],
            'detergent': ['soap', 'detergent', 'wash', 'omo', 'klin'],
            'shampoo':   ['personal care', 'hair', 'skin', 'oral', 'vaseline'],
            'lotion':    ['personal care', 'hair', 'skin', 'oral', 'vaseline'],
            'cream':     ['personal care', 'hair', 'skin', 'oral', 'vaseline'],
        };

        // Split the user's query into individual word tokens
        const queryWords = queryText.split(/\s+/).filter(Boolean);
        let matchesAllWords = true;

        for (const word of queryWords) {
            // Expand the search word through the synonym map using EXACT token matching:
            // only expand if the search word equals a synonym key exactly.
            // This prevents "cream" from also triggering "lotion" (whose key is a different
            // word) and prevents partial matches like "oil" matching "boil" or "foil".
            let termsToCheck = [word];
            if (synonymMap[word]) {
                termsToCheck = [...termsToCheck, ...synonymMap[word]];
            }

            // Check if the product's name or category contains any of the expanded terms.
            // We do a simple substring check within name/category (intentional — a product
            // named "Indomie Noodles" should still match the term "noodle").
            // We do NOT match against the doc ID.
            const wordMatches = termsToCheck.some(term =>
                name.includes(term) || category.includes(term)
            );

            if (!wordMatches) {
                matchesAllWords = false;
                break;
            }
        }

        return matchesAllWords;
    });

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-slate-900 selection:bg-emerald-100 flex flex-col">
            {/* Top Banner */}
            <div className="bg-slate-900 text-white py-2 px-4 text-center text-[11px] font-black tracking-widest uppercase z-50 relative">
                🚀 Free delivery for orders over ₦20,000 in Kurfi Central!
            </div>

            <Navbar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                categories={categories}
                getCategoryMetadata={getCategoryMetadata}
            />

            {/* Filters Bar (Desktop only) */}
            <section className="hidden sm:block px-2 sm:px-4 md:px-12 py-4 relative sm:sticky sm:top-[80px] z-40 glass-nav border-b border-slate-100/80">
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

                    {/* Mobile Only Search Bar (covers at least 2/3 of screen width horizontally) */}
                    <div className="sm:hidden mt-6 flex justify-center w-full">
                        <div className="flex gap-2 w-10/12 max-w-md">
                            <div className="relative flex-1 group font-medium text-left">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search items..."
                                    className="w-full pl-12 pr-10 py-3 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all outline-none text-sm"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button 
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <button
                                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0"
                            >
                                <Search className="w-3.5 h-3.5" />
                                Search
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-32">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
                    </div>
                ) : filteredProducts.length > 0 ? (
                    <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3">
                        {filteredProducts.slice(0, visibleCount).map(product => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                    {filteredProducts.length > visibleCount && (
                        <div className="flex justify-center mt-10">
                            <button
                                onClick={() => setVisibleCount(prev => prev + 24)}
                                className="px-8 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-xl shadow-slate-200 active:scale-95"
                            >
                                Load More ({filteredProducts.length - visibleCount} remaining)
                            </button>
                        </div>
                    )}
                    </>
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

            <Hero />

            <FeaturedProducts products={featuredProducts} />

            <Footer />

            {/* Mobile Floating Cart FAB — fixed bottom-right, hidden on sm+ (desktop uses navbar cart) */}
            <Link
                to="/cart"
                className="sm:hidden fixed bottom-6 right-5 z-50 flex items-center gap-2.5 bg-slate-900 text-white pl-5 pr-4 py-3.5 rounded-full shadow-2xl shadow-slate-900/30 active:scale-95 transition-all duration-200 group"
                aria-label="View cart"
            >
                <span className="text-[13px] font-black uppercase tracking-wider">Cart</span>
                <div className="relative">
                    <ShoppingCart className="w-6 h-6" />
                    {totalItems > 0 && (
                        <span
                            className="absolute -top-2.5 -right-2.5 bg-emerald-500 text-white text-[10px] font-black min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full border-2 border-slate-900 animate-in zoom-in duration-200"
                        >
                            {totalItems > 99 ? '99+' : totalItems}
                        </span>
                    )}
                </div>
            </Link>
        </div>
    );
}
