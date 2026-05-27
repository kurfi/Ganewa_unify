import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ShoppingBag, Search, ShoppingCart, Menu, X,
    User, Package, MapPin, LogOut, ChevronDown, Settings
} from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';

interface NavbarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export default function Navbar({ searchQuery, setSearchQuery }: NavbarProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const { totalItems } = useCart();
    const { user, profile, openAuthModal, logout } = useAuth();
    const navigate = useNavigate();
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        if (val.trim().length > 0) {
            const catalogEl = document.getElementById('catalog');
            if (catalogEl) {
                catalogEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = async () => {
        setIsDropdownOpen(false);
        setIsMenuOpen(false);
        await logout();
        navigate('/');
    };

    const getInitials = () => {
        const name = profile?.displayName || user?.displayName || user?.email || '';
        const parts = name.split(/[\s@]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    };

    const displayName = profile?.displayName || user?.displayName || 'User';

    return (
        <nav className="glass-nav sticky top-0 px-4 py-4 md:px-12 border-b border-slate-100 z-50">
            <div className="max-w-7xl mx-auto flex items-center justify-between w-full relative">
                <Link to="/" className="flex items-center gap-3 group cursor-pointer">
                    <div className="relative w-12 h-12 flex items-center justify-center rounded-full overflow-hidden border-2 border-emerald-500/20 group-hover:scale-110 transition-transform">
                        <img
                            src="/pwa-192x192.png"
                            alt="Ganewa Logo"
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <div>
                        <span className="text-xl font-black block leading-none tracking-tight text-slate-900">GANEWA</span>
                        <span className="text-[10px] font-black text-emerald-600 tracking-[0.2em] uppercase block mt-1">Shopping Mall</span>
                    </div>
                </Link>

                <div className="hidden lg:flex items-center gap-10 text-[13px] font-bold text-slate-500 uppercase tracking-wider">
                    <Link to="/" className="text-slate-900 border-b-2 border-emerald-500 pb-1">Catalog</Link>
                    <a href="#specials" className="hover:text-emerald-600 transition-colors">Specials</a>
                    <a href="#how" className="hover:text-emerald-600 transition-colors">How it works</a>
                    <a href="#support" className="hover:text-emerald-600 transition-colors">Support</a>
                </div>

                <div className="flex items-center gap-3 lg:gap-4">
                    {/* Search */}
                    <div className="relative group hidden sm:block">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search items..."
                            className="pl-12 pr-10 py-3 bg-slate-100 border-none rounded-2xl w-48 lg:w-72 focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all outline-none text-sm font-medium"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
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

                    {/* Cart */}
                    <Link to="/cart" className="relative p-3.5 bg-slate-900 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-slate-200">
                        <ShoppingCart className="w-5 h-5" />
                        {totalItems > 0 && (
                            <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-4 border-[#FDFDFD] ring-1 ring-emerald-100">
                                {totalItems}
                            </span>
                        )}
                    </Link>

                    {/* Auth: Sign In or Avatar */}
                    {user ? (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="hidden md:flex items-center gap-2 px-3 py-2 rounded-2xl hover:bg-slate-50 transition-all cursor-pointer"
                            >
                                {profile?.photoURL ? (
                                    <img src={profile.photoURL} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-100" />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-xs font-black">
                                        {getInitials()}
                                    </div>
                                )}
                                <div className="hidden lg:block text-left">
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block leading-none">Account</span>
                                    <span className="text-sm font-bold text-slate-900 block mt-0.5 max-w-[100px] truncate">{displayName}</span>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform hidden lg:block ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Avatar for mobile (just the circle) */}
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="md:hidden"
                            >
                                {profile?.photoURL ? (
                                    <img src={profile.photoURL} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-100" />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-xs font-black">
                                        {getInitials()}
                                    </div>
                                )}
                            </button>

                            {/* Dropdown */}
                            {isDropdownOpen && (
                                <div className="absolute right-0 top-[calc(100%+8px)] w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[60]">
                                    <div className="p-4 border-b border-slate-50 bg-slate-50/50">
                                        <p className="text-sm font-black text-slate-900 truncate">{displayName}</p>
                                        <p className="text-xs text-slate-400 font-medium truncate">{user.email}</p>
                                    </div>
                                    <div className="py-2">
                                        <Link
                                            to="/account"
                                            onClick={() => setIsDropdownOpen(false)}
                                            className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                                        >
                                            <User className="w-4 h-4" /> My Profile
                                        </Link>
                                        <Link
                                            to="/account?tab=orders"
                                            onClick={() => setIsDropdownOpen(false)}
                                            className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                                        >
                                            <Package className="w-4 h-4" /> My Orders
                                        </Link>
                                        <Link
                                            to="/account?tab=addresses"
                                            onClick={() => setIsDropdownOpen(false)}
                                            className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                                        >
                                            <MapPin className="w-4 h-4" /> Saved Addresses
                                        </Link>
                                        <Link
                                            to="/account?tab=security"
                                            onClick={() => setIsDropdownOpen(false)}
                                            className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                                        >
                                            <Settings className="w-4 h-4" /> Security
                                        </Link>
                                    </div>
                                    <div className="border-t border-slate-100">
                                        <button
                                            onClick={handleLogout}
                                            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" /> Sign Out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => openAuthModal('login')}
                            className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-emerald-200 text-emerald-700 rounded-2xl text-[12px] font-black uppercase tracking-widest hover:bg-emerald-50 hover:border-emerald-300 transition-all active:scale-95 shadow-sm"
                        >
                            <User className="w-4 h-4" />
                            Sign In
                        </button>
                    )}

                    {/* Mobile hamburger */}
                    <button className="lg:hidden p-2 text-slate-600 bg-slate-100 rounded-xl" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                        {isMenuOpen ? <X /> : <Menu />}
                    </button>
                </div>

                {/* Mobile Menu Dropdown */}
                {isMenuOpen && (
                    <div className="lg:hidden absolute top-[calc(100%+16px)] left-0 w-full bg-white border-b border-slate-100 p-4 shadow-xl z-50 rounded-b-2xl">
                        <div className="relative group mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search items..."
                                className="w-full pl-12 pr-10 py-3 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all outline-none text-sm font-medium"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
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
                        <div className="flex flex-col gap-2 text-sm font-bold text-slate-600 uppercase tracking-wider">
                            <Link to="/" className="p-3 bg-slate-50 rounded-xl text-emerald-600" onClick={() => setIsMenuOpen(false)}>Catalog</Link>
                            <a href="#specials" className="p-3 hover:bg-slate-50 rounded-xl" onClick={() => setIsMenuOpen(false)}>Specials</a>
                            <a href="#how" className="p-3 hover:bg-slate-50 rounded-xl" onClick={() => setIsMenuOpen(false)}>How it works</a>
                            <a href="#support" className="p-3 hover:bg-slate-50 rounded-xl" onClick={() => setIsMenuOpen(false)}>Support</a>

                            {/* Mobile auth controls */}
                            <div className="border-t border-slate-100 mt-2 pt-4">
                                {user ? (
                                    <>
                                        <Link to="/account" className="p-3 hover:bg-slate-50 rounded-xl flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
                                            <User className="w-4 h-4 text-emerald-600" /> My Account
                                        </Link>
                                        <Link to="/account?tab=orders" className="p-3 hover:bg-slate-50 rounded-xl flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
                                            <Package className="w-4 h-4 text-emerald-600" /> My Orders
                                        </Link>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full p-3 hover:bg-red-50 rounded-xl flex items-center gap-2 text-red-500"
                                        >
                                            <LogOut className="w-4 h-4" /> Sign Out
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => { setIsMenuOpen(false); openAuthModal('login'); }}
                                        className="w-full p-3 bg-emerald-600 text-white rounded-xl flex items-center justify-center gap-2 font-black tracking-widest"
                                    >
                                        <User className="w-4 h-4" /> Sign In / Register
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
}
