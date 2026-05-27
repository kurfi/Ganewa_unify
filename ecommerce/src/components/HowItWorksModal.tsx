import React from 'react';
import { X, ShoppingBag, Truck, Smartphone, CheckCircle2 } from 'lucide-react';

interface HowItWorksModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function HowItWorksModal({ isOpen, onClose }: HowItWorksModalProps) {
    if (!isOpen) return null;

    const steps = [
        {
            icon: <Smartphone className="w-8 h-8 text-emerald-500" />,
            title: "Browse Catalog",
            description: "Explore our wide range of premium products from Ganewa Shopping Mall directly on your device."
        },
        {
            icon: <ShoppingBag className="w-8 h-8 text-emerald-500" />,
            title: "Place Your Order",
            description: "Add items to your cart, provide your delivery details, and checkout with just a few clicks."
        },
        {
            icon: <Truck className="w-8 h-8 text-emerald-500" />,
            title: "Fast Delivery",
            description: "Our dedicated team will deliver your order to your doorstep in Kurfi Central within 60 minutes."
        }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-full transition-colors z-10"
                >
                    <X className="w-6 h-6 text-slate-400" />
                </button>

                <div className="p-8 md:p-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">
                        <CheckCircle2 className="w-3 h-3" /> How Ganewa Works
                    </div>

                    <h2 className="text-3xl md:text-4xl font-black text-slate-950 mb-4 tracking-tight">
                        Seamless Shopping. <br />
                        <span className="gradient-text italic">Delivered.</span>
                    </h2>

                    <p className="text-slate-500 font-medium mb-12">
                        Experience the future of local shopping in Kurfi with our streamlined 3-step process.
                    </p>

                    <div className="space-y-8">
                        {steps.map((step, index) => (
                            <div key={index} className="flex gap-6 items-start group">
                                <div className="flex-shrink-0 w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-50 transition-colors duration-300">
                                    {step.icon}
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 mb-1">{step.title}</h3>
                                    <p className="text-slate-500 text-sm leading-relaxed font-medium">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-12 py-5 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-[0.98]"
                    >
                        Got it, let's shop!
                    </button>
                </div>
            </div>
        </div>
    );
}
