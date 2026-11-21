import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { logAudit } from '../../firebase/firestoreHelpers';
import { customersRepo } from '../../repositories';
import { Customer } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { validateNigerianPhone, validateNumericField } from '../../utils/validation';

interface EditCustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
}

export function EditCustomerModal({ isOpen, onClose, customer }: EditCustomerModalProps) {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (customer) {
            setEditingCustomer({ ...customer });
        }
    }, [customer]);

    if (!isOpen || !editingCustomer) return null;

    const handleUpdateCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingCustomer.id || isSubmitting) return;

        if (!editingCustomer.name?.trim()) {
            showToast('Customer name is required', 'error');
            return;
        }

        if (!editingCustomer.phone?.trim()) {
            showToast('Phone number is required', 'error');
            return;
        }

        if (!validateNigerianPhone(editingCustomer.phone, showToast)) {
            return;
        }

        if (!validateNumericField(editingCustomer.creditLimit || 0, 'Credit Limit', 0, showToast)) return;
        if (!validateNumericField(editingCustomer.currentDebt || 0, 'Current Debt', 0, showToast)) return;

        setIsSubmitting(true);

        try {
            const oldDebt = customer?.currentDebt || 0;
            const newDebt = Number(editingCustomer.currentDebt) || 0;
            const debtDifference = newDebt - oldDebt;

            const updatedFields = {
                name: editingCustomer.name.trim(),
                phone: editingCustomer.phone.trim(),
                email: editingCustomer.email?.trim() || '',
                creditLimit: Number(editingCustomer.creditLimit) || 0,
                currentDebt: newDebt,
            };

            await customersRepo.update(editingCustomer.id, updatedFields);

            if (debtDifference !== 0) {
                await logAudit(
                    'CUSTOMER_DEBT_ADJUSTED',
                    `Debt for ${editingCustomer.name} adjusted from ₦${oldDebt} to ₦${newDebt} (Diff: ₦${debtDifference})`,
                    currentUser?.username || 'Unknown'
                );
            }

            // Sync updated credit info snapshot to ecommerce profile (non-blocking)
            const { syncCreditInfoToShopUser } = await import('../../utils/creditInfoSync');
            syncCreditInfoToShopUser({
                ...editingCustomer,
                ...updatedFields
            });

            showToast('Customer updated successfully', 'success');
            onClose();
        } catch (error) {
            console.error("Failed to update customer:", error);
            showToast("Failed to update customer details.", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[95vh]">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">Edit Customer</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleUpdateCustomer} className="space-y-3 md:space-y-4">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Name</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            required
                            value={editingCustomer.name || ''}
                            onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Phone</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            required
                            value={editingCustomer.phone || ''}
                            onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            type="email"
                            value={editingCustomer.email || ''}
                            onChange={e => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Credit Limit (₦)</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            type="number"
                            placeholder="0.00"
                            value={editingCustomer.creditLimit || ''}
                            onChange={e => setEditingCustomer({ ...editingCustomer, creditLimit: parseFloat(e.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Current Debt (₦)</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            type="number"
                            placeholder="0.00"
                            value={editingCustomer.currentDebt || ''}
                            onChange={e => setEditingCustomer({ ...editingCustomer, currentDebt: parseFloat(e.target.value) || 0 })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-xs md:text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-xs md:text-sm font-medium disabled:opacity-50">
                            {isSubmitting ? 'Updating...' : 'Update Customer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
