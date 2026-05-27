import React from 'react';
import { Instagram, Twitter, Facebook } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="bg-white border-t border-slate-100 pt-16 sm:pt-24 pb-8 sm:pb-12 px-4 md:px-12 mt-12 sm:mt-20">
            <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
                {/* Logo & Brand */}
                <div className="flex items-center gap-3 mb-6 justify-center">
                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full overflow-hidden border-2 border-emerald-500/20">
                        <img
                            src="/pwa-192x192.png"
                            alt="Ganewa Logo"
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <span className="text-xl sm:text-2xl font-black text-slate-950 uppercase tracking-tight">GANEWA MALL</span>
                </div>

                {/* Description */}
                <p className="text-slate-400 font-medium text-sm sm:text-base leading-relaxed mb-8 max-w-xl mx-auto">
                    Providing premium provisions and groceries to the Kurfi community since 2010.
                    Our new digital platform brings our physical aisles to your phone.
                </p>

                {/* Social Icons */}
                <div className="flex gap-3 sm:gap-4 mb-12 justify-center">
                    <a href="#" className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all group"><Instagram className="w-4 sm:w-5 h-4 sm:h-5 group-hover:scale-110" /></a>
                    <a href="#" className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all group"><Twitter className="w-4 sm:w-5 h-4 sm:h-5 group-hover:scale-110" /></a>
                    <a href="#" className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all group"><Facebook className="w-4 sm:w-5 h-4 sm:h-5 group-hover:scale-110" /></a>
                </div>

                {/* Directory & Company grids */}
                <div className="grid grid-cols-2 gap-12 sm:gap-24 w-full border-t border-slate-100 pt-10 mb-12 max-w-xl mx-auto">
                    <div>
                        <h4 className="text-slate-900 font-black text-xs uppercase tracking-[0.2em] mb-4 sm:mb-6">Directory</h4>
                        <ul className="space-y-4 text-[11px] sm:text-[13px] font-bold text-slate-400">
                            <li><a href="#" className="hover:text-emerald-600 transition-colors uppercase tracking-widest block text-center">Marketplace</a></li>
                            <li><a href="#" className="hover:text-emerald-600 transition-colors uppercase tracking-widest block text-center">Offers</a></li>
                            <li><a href="#" className="hover:text-emerald-600 transition-colors uppercase tracking-widest block text-center">Best Sellers</a></li>
                            <li><a href="#" className="hover:text-emerald-600 transition-colors uppercase tracking-widest block text-center">New Arrivals</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-slate-900 font-black text-xs uppercase tracking-[0.2em] mb-4 sm:mb-6">Company</h4>
                        <ul className="space-y-4 text-[11px] sm:text-[13px] font-bold text-slate-400">
                            <li><a href="#" className="hover:text-emerald-600 transition-colors uppercase tracking-widest block text-center">About Us</a></li>
                            <li><a href="#" className="hover:text-emerald-600 transition-colors uppercase tracking-widest block text-center">Delivery</a></li>
                            <li><a href="#" className="hover:text-emerald-600 transition-colors uppercase tracking-widest block text-center">Privacy</a></li>
                            <li><a href="#" className="hover:text-emerald-600 transition-colors uppercase tracking-widest block text-center">Terms</a></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className="max-w-7xl mx-auto pt-8 border-t border-slate-100 flex flex-col items-center gap-4 text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] text-center w-full">
                <span>
                    &copy; {new Date().getFullYear()} Ganewa Provision Store. <br className="md:hidden" />
                    Built by AFRAHAB SOLUTIONS KURFI 08138012494, 08074741411
                </span>
            </div>
        </footer>
    );
}
