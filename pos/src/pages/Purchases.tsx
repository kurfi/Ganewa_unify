import React, { useState } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, Package } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

// Components
import { PurchasesList } from '../components/purchases/PurchasesList';
import { NewPurchaseModal } from '../components/purchases/NewPurchaseModal';

export default function Purchases() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const purchases = useLiveQuery(async () => {
        let collection = db.purchases.orderBy('date').reverse();
        if (searchQuery) {
            const all = await collection.toArray();
            const term = (searchQuery || '').toLowerCase();
            return all.filter(p =>
                (p.supplierName || '').toLowerCase().includes(term) ||
                (p.invoiceNo || '').toLowerCase().includes(term)
            );
        }
        return collection.toArray();
    }, [searchQuery]) || [];

    return (
        <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col gap-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Package className="w-6 h-6 text-emerald-600" />
                    Purchases & Restocking
                </h1>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Purchase
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search invoice or supplier..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>
                </div>

                <PurchasesList purchases={purchases} />
            </div>

            <NewPurchaseModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </div>
    );
}
