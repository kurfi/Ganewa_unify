import React, { useState } from 'react';
import { Zap, ArrowRight, ShieldCheck, Clock, Star, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import HowItWorksModal from './HowItWorksModal';

export default function Hero() {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <header className="relative pt-8 sm:pt-20 pb-8 sm:pb-24 px-4 md:px-12 bg-white flex flex-col items-center text-center overflow-hidden">
            <div className="relative z-10 max-w-5xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-4 sm:py-2 bg-emerald-50 text-emerald-700 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest mb-4 sm:mb-8 animate-bounce">
                    <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-emerald-600" /> New items added today
                </div>
                <h1 className="text-3xl sm:text-5xl md:text-8xl font-black text-slate-950 mb-4 sm:mb-8 leading-[0.95] tracking-tight">
                    Shopping in Kurfi <br />
                    just got <span className="gradient-text italic">Premium.</span>
                </h1>
                <p className="text-slate-500 text-xs sm:text-lg md:text-xl mb-6 sm:mb-12 max-w-2xl mx-auto font-medium leading-relaxed px-2">
                    The same Ganewa quality you trust, now available at your fingertips.
                    Real-time inventory, local prices, and delivery within 60 minutes.
                </p>
                
                {/* Responsive Side-by-Side conversion buttons */}
                <div className="flex flex-row justify-center items-center gap-2 sm:gap-4 max-w-md mx-auto w-full px-2">
                    <a href="#catalog" className="flex-1 px-3 sm:px-10 py-3 sm:py-5 bg-emerald-600 text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-sm font-black shadow-lg sm:shadow-2xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 sm:gap-3 active:scale-95 whitespace-nowrap">
                        Explore Catalog <ArrowRight className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                    </a>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex-1 px-3 sm:px-10 py-3 sm:py-5 bg-white text-slate-900 border border-slate-100 sm:border-2 rounded-xl sm:rounded-2xl text-[11px] sm:text-sm font-black hover:bg-slate-50 transition-all active:scale-95 shadow-sm flex items-center justify-center gap-1.5 sm:gap-3 whitespace-nowrap"
                    >
                        <div className="w-5 h-5 sm:w-8 sm:h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                            <Play className="w-2.5 h-2.5 sm:w-4 sm:h-4 fill-current ml-0.5" />
                        </div>
                        Watch How
                    </button>
                </div>

                <HowItWorksModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

                {/* Stats/Trust Bar */}
                <div className="mt-10 sm:mt-20 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-12 border-t border-slate-100 pt-8 sm:pt-16">
                    <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-500" />
                        <span className="text-[10px] sm:text-sm font-black text-slate-900 uppercase tracking-wider">Verified Quality</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-500" />
                        <span className="text-[10px] sm:text-sm font-black text-slate-900 uppercase tracking-wider">60m Delivery</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="flex -space-x-2 sm:-space-x-3">
                            {[1, 2, 3, 4].map(i => (
                                <div
                                    key={i}
                                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-white bg-emerald-100 text-emerald-600 flex items-center justify-center text-[8px] sm:text-[10px] font-black"
                                >
                                    G
                                </div>
                            ))}
                        </div>
                        <span className="text-[10px] sm:text-sm font-black text-slate-900 uppercase tracking-wider">Community Trusted</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <div className="flex text-amber-400">
                            {[1, 2, 3, 4, 5].map(i => <Star key={i} className="fill-current w-3.5 h-3.5 sm:w-4 sm:h-4" />)}
                        </div>
                        <span className="text-[10px] sm:text-sm font-black text-slate-900 uppercase tracking-wider">Top Rated Service</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
