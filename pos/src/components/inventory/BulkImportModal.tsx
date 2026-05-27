import React from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Upload, Download } from 'lucide-react';
import { db, logAudit } from '../../db/db';
import { User, Product } from '../../types';
import { PRODUCT_CATEGORIES } from '../../constants/productCategories';
import { validateInventoryField } from '../../utils/validation';

interface BulkImportModalProps {
    isBulkModalOpen: boolean;
    setIsBulkModalOpen: (open: boolean) => void;
    currentUser: User | null;
    downloadTemplate: () => void;
}

export function BulkImportModal({ isBulkModalOpen, setIsBulkModalOpen, currentUser, downloadTemplate }: BulkImportModalProps) {
    const { showToast } = useToast();
    if (!isBulkModalOpen) return null;

    const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            const lines = text.split('\n');
            const productsToAdd: Product[] = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const [name, category, buyPrice, sellPrice, quantity, minStock] = line.split(',');

                if (name && sellPrice) {
                    const productName = name.trim();
                    if (!validateInventoryField(productName, `Product name at line ${i + 1}`, showToast, 34)) {
                        return; // Stop import if any name is invalid
                    }

                    productsToAdd.push({
                        name: productName,
                        category: category?.trim() || PRODUCT_CATEGORIES[0],
                        buyPrice: parseFloat(buyPrice) || 0,
                        sellPrice: parseFloat(sellPrice) || 0,
                        quantity: parseInt(quantity) || 0,
                        wholesalePrice: parseFloat(sellPrice) * 0.9,
                        minStockLevel: parseInt(minStock) || 5,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    } as Product);
                }
            }

            if (productsToAdd.length > 0) {
                try {
                    await db.products.bulkAdd(productsToAdd);
                    showToast(`Successfully imported ${productsToAdd.length} products.`, 'success');
                    setIsBulkModalOpen(false);
                    await logAudit('BULK_IMPORT', `Imported ${productsToAdd.length} products`, currentUser?.username || 'Unknown');
                } catch (error) {
                    console.error("Import failed", error);
                    showToast("Import failed. Check CSV format.", 'error');
                }
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 text-center">
                <h2 className="font-bold text-lg text-slate-800 mb-2">Bulk Import Products</h2>
                <p className="text-sm text-slate-500 mb-6">Upload a CSV file to add products in bulk.</p>

                <label className="block w-full border-2 border-dashed border-slate-300 rounded-xl p-8 hover:bg-slate-50 cursor-pointer transition-colors mb-4">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <span className="text-sm font-medium text-slate-600">Click to upload CSV</span>
                    <input type="file" accept=".csv" className="hidden" onChange={handleBulkImport} />
                </label>

                <button onClick={downloadTemplate} className="text-emerald-600 text-sm font-medium hover:underline flex items-center justify-center gap-1 mb-6">
                    <Download className="w-4 h-4" /> Download Template
                </button>

                <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-500 font-medium hover:underline">Cancel</button>
            </div>
        </div>
    );
}
