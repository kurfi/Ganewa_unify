import React from 'react';
import { Package, Upload, Plus } from 'lucide-react';

interface InventoryHeaderProps {
    setIsBulkModalOpen: (open: boolean) => void;
    handleOpenModal: () => void;
}

export function InventoryHeader({ setIsBulkModalOpen, handleOpenModal }: InventoryHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Package className="w-6 h-6 text-emerald-600" />
                Inventory Management
            </h1>
            <div className="flex gap-2 w-full md:w-auto">
                <button
                    onClick={() => setIsBulkModalOpen(true)}
                    className="flex-1 md:flex-none px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors border border-slate-200"
                >
                    <Upload className="w-4 h-4" /> Import
                </button>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                    <Plus className="w-4 h-4" /> Add Product
                </button>
            </div>
        </div>
    );
}
