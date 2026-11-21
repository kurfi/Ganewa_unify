import React, { useState } from 'react';
import { X } from 'lucide-react';
import { logAudit } from '../../firebase/firestoreHelpers';
import { customersRepo } from '../../repositories';
import { Customer } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useModalRegistration } from '../../contexts/ModalContext';
import { validateNigerianPhone, validateNumericField } from '../../utils/validation';

interface AddCustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AddCustomerModal({ isOpen, onClose }: AddCustomerModalProps) {
    useModalRegistration(isOpen);
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
        creditLimit: 0,
        currentDebt: 0
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleAddCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isSubmitting) return;

        if (!newCustomer.name?.trim()) {
            showToast('Customer name is required', 'error');
            return;
        }

        if (!newCustomer.phone?.trim()) {
            showToast('Phone number is required', 'error');
            return;
        }

        if (!validateNigerianPhone(newCustomer.phone, showToast)) {
            return;
        }

        if (!validateNumericField(newCustomer.creditLimit || 0, 'Credit Limit', 0, showToast)) return;
        if (!validateNumericField(newCustomer.currentDebt || 0, 'Existing Debt', 0, showToast)) return;

        setIsSubmitting(true);

        try {
            const customerToAdd: Customer = {
                name: newCustomer.name.trim(),
                phone: newCustomer.phone.trim(),
                email: newCustomer.email?.trim() || '',
                creditLimit: Number(newCustomer.creditLimit) || 0,
                currentDebt: Number(newCustomer.currentDebt) || 0
            } as Customer;

            await customersRepo.create(customerToAdd);

            if (customerToAdd.currentDebt > 0) {
                await logAudit(
                    'CUSTOMER_CREATED_WITH_DEBT',
                    `Customer ${customerToAdd.name} created with initial debt of ₦${customerToAdd.currentDebt}`,
                    currentUser?.username || 'Unknown'
                );
            } else {
                await logAudit(
                    'CUSTOMER_CREATED',
                    `Customer ${customerToAdd.name} created`,
                    currentUser?.username || 'Unknown'
                );
            }

            showToast('Customer added successfully', 'success');
            onClose();
        } catch (error) {
            console.error("Failed to add customer:", error);
            showToast("Failed to add customer.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[95vh]">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">New Customer</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleAddCustomer} className="space-y-3 md:space-y-4">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Name</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            placeholder="e.g. John Doe"
                            required
                            value={newCustomer.name || ''}
                            onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Phone</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            placeholder="e.g. 08012345678"
                            required
                            value={newCustomer.phone || ''}
                            onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            type="email"
                            placeholder="john@example.com"
                            value={newCustomer.email || ''}
                            onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Credit Limit (₦)</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            type="number"
                            placeholder="0.00"
                            value={newCustomer.creditLimit || ''}
                            onChange={e => setNewCustomer({ ...newCustomer, creditLimit: parseFloat(e.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Existing Debt (₦)</label>
                        <input
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                            type="number"
                            placeholder="0.00"
                            value={newCustomer.currentDebt || ''}
                            onChange={e => setNewCustomer({ ...newCustomer, currentDebt: parseFloat(e.target.value) || 0 })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-xs md:text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-xs md:text-sm font-medium disabled:opacity-50">
                            {isSubmitting ? 'Saving...' : 'Save Customer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
