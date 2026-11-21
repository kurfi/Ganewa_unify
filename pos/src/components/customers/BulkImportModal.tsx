import React from 'react';
import { X, Upload, Download } from 'lucide-react';
import { customersRepo } from '../../repositories';
import { Customer } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import { validateNigerianPhone } from '../../utils/validation';

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function BulkImportModal({ isOpen, onClose }: BulkImportModalProps) {
    const { showToast } = useToast();

    if (!isOpen) return null;

    const downloadTemplate = () => {
        const headers = "Name,Phone,Email,CreditLimit,CurrentDebt\nJohn Doe,08012345678,john@example.com,50000,0";
        const blob = new Blob([headers], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'customers_template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            const lines = text.split('\n');
            const customersToAdd: Partial<Customer>[] = [];
            let skippedRows = 0;

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const [name, phone, email, creditLimit, currentDebt] = line.split(',');

                if (name && phone) {
                    const cleanPhone = phone.trim();
                    const nigerianPrefixes = ['081', '080', '091', '090', '070'];

                    // Silent validation for bulk to avoid too many toasts
                    if (cleanPhone.length === 11 && /^\d+$/.test(cleanPhone) && nigerianPrefixes.includes(cleanPhone.substring(0, 3))) {
                        customersToAdd.push({
                            name: name.trim(),
                            phone: cleanPhone,
                            email: email?.trim() || '',
                            creditLimit: parseFloat(creditLimit) || 0,
                            currentDebt: parseFloat(currentDebt) || 0
                        });
                    } else {
                        skippedRows++;
                    }
                } else {
                    skippedRows++;
                }
            }

            if (customersToAdd.length > 0) {
                try {
                    await Promise.all(customersToAdd.map(c => customersRepo.create(c as Customer)));
                    let message = `Successfully imported ${customersToAdd.length} customers.`;
                    if (skippedRows > 0) message += ` (${skippedRows} rows skipped due to invalid data/phone format).`;
                    showToast(message, skippedRows > 0 ? 'info' : 'success');
                    onClose();
                } catch (error) {
                    console.error("Import failed", error);
                    showToast("Import failed. Please check your CSV format.", 'error');
                }
            } else {
                showToast("No valid customers with correct phone format found.", 'error');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">Bulk Import Customers</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h3 className="font-medium text-slate-800 mb-2 flex items-center gap-2"><Download className="w-4 h-4" /> Step 1: Get Template</h3>
                        <p className="text-sm text-slate-500 mb-3">Download the CSV template to see the required format.</p>
                        <button
                            onClick={downloadTemplate}
                            className="text-sm text-indigo-600 font-medium hover:underline"
                        >
                            Download Template.csv
                        </button>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h3 className="font-medium text-slate-800 mb-2 flex items-center gap-2"><Upload className="w-4 h-4" /> Step 2: Upload CSV</h3>
                        <p className="text-sm text-slate-500 mb-3">Select your filled CSV file to import.</p>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleBulkImport}
                            className="block w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-indigo-50 file:text-indigo-700
                                hover:file:bg-indigo-100
                            "
                        />
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Close</button>
                </div>
            </div>
        </div>
    );
}
