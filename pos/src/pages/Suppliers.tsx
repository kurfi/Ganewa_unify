import React from 'react';
import { Building, Plus, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

// Hooks
import { useSuppliers } from '../hooks/useSuppliers';

// Components
import { SupplierCard } from '../components/suppliers/SupplierCard';
import { SupplierModal } from '../components/suppliers/SupplierModal';
import { SettleSupplierDebtModal } from '../components/suppliers/SettleSupplierDebtModal';

export default function Suppliers() {
    const {
        suppliers,
        searchQuery,
        setSearchQuery,
        isModalOpen,
        setIsModalOpen,
        isSettleModalOpen,
        setIsSettleModalOpen,
        editingSupplier,
        settleSupplier,
        handleDelete,
        handleEdit,
        handleAdd,
        handleSettle
    } = useSuppliers();

    return (
        <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col gap-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h1 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Building className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
                    Suppliers
                </h1>
                <button
                    onClick={handleAdd}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Supplier
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search suppliers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {suppliers?.map(supplier => (
                            <SupplierCard
                                key={supplier.id}
                                supplier={supplier}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onSettle={handleSettle}
                            />
                        ))}

                        {suppliers?.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-400">
                                <Building className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p>No suppliers found</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <SupplierModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                supplier={editingSupplier}
            />

            <SettleSupplierDebtModal
                isOpen={isSettleModalOpen}
                onClose={() => setIsSettleModalOpen(false)}
                supplier={settleSupplier}
            />
        </div>
    );
}
