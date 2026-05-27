import React from 'react';
import { ShoppingBag, Package, Users, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QuickActionsProps {
    isAdmin: boolean;
}

export function QuickActions({ isAdmin }: QuickActionsProps) {
    const navigate = useNavigate();

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4">Quick Actions</h2>
            <div className="space-y-2 md:space-y-3">
                <button
                    onClick={() => navigate('/pos')}
                    className="w-full flex items-center gap-3 p-2.5 md:p-3 rounded-lg border border-slate-100 hover:bg-emerald-50 hover:border-emerald-100 transition-all duration-200 text-left group"
                >
                    <div className="bg-emerald-100 p-1.5 md:p-2 rounded-md text-emerald-600 group-hover:scale-110 transition-transform"><ShoppingBag className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                    <div>
                        <p className="font-medium text-slate-700 text-xs md:text-sm">New Sale</p>
                        <p className="text-[10px] text-slate-400">Go to POS</p>
                    </div>
                </button>
                {isAdmin && (
                    <button
                        onClick={() => navigate('/inventory')}
                        className="w-full flex items-center gap-3 p-2.5 md:p-3 rounded-lg border border-slate-100 hover:bg-blue-50 hover:border-blue-100 transition-all duration-200 text-left group"
                    >
                        <div className="bg-blue-100 p-1.5 md:p-2 rounded-md text-blue-600 group-hover:scale-110 transition-transform"><Package className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                        <div>
                            <p className="font-medium text-slate-700 text-xs md:text-sm">Add Inventory</p>
                            <p className="text-[10px] text-slate-400">Restock products</p>
                        </div>
                    </button>
                )}
                {isAdmin && (
                    <button
                        onClick={() => navigate('/customers')}
                        className="w-full flex items-center gap-3 p-2.5 md:p-3 rounded-lg border border-slate-100 hover:bg-orange-50 hover:border-orange-100 transition-all duration-200 text-left group"
                    >
                        <div className="bg-orange-100 p-1.5 md:p-2 rounded-md text-orange-600 group-hover:scale-110 transition-transform"><Users className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                        <div>
                            <p className="font-medium text-slate-700 text-xs md:text-sm">Add Customer</p>
                            <p className="text-[10px] text-slate-400">Register new client</p>
                        </div>
                    </button>
                )}
                {isAdmin && (
                    <button
                        onClick={() => navigate('/reports')}
                        className="w-full flex items-center gap-3 p-2.5 md:p-3 rounded-lg border border-slate-100 hover:bg-purple-50 hover:border-purple-100 transition-all duration-200 text-left group"
                    >
                        <div className="bg-purple-100 p-1.5 md:p-2 rounded-md text-purple-600 group-hover:scale-110 transition-transform"><TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                        <div>
                            <p className="font-medium text-slate-700 text-xs md:text-sm">View Reports</p>
                            <p className="text-[10px] text-slate-400">Full business analytics</p>
                        </div>
                    </button>
                )}
            </div>
        </div>
    );
}
