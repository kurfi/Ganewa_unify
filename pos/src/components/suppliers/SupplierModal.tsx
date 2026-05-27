import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { X } from 'lucide-react';
import { db } from '../../db/db';
import { Supplier } from '../../types';
import { validateNigerianPhone } from '../../utils/validation';

interface SupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
}

export function SupplierModal({ isOpen, onClose, supplier }: SupplierModalProps) {
    const { showToast } = useToast();
    const [formData, setFormData] = useState<Partial<Supplier>>({
        companyName: '',
        contactName: '',
        phone: '',
        email: '',
        address: ''
    });

    useEffect(() => {
        if (supplier) {
            setFormData({
                companyName: supplier.companyName,
                contactName: supplier.contactName,
                phone: supplier.phone,
                email: supplier.email,
                address: supplier.address
            });
        } else {
            setFormData({
                companyName: '',
                contactName: '',
                phone: '',
                email: '',
                address: ''
            });
        }
    }, [supplier, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.companyName?.trim()) {
            showToast('Company name is required', 'error');
            return;
        }

        if (!formData.contactName?.trim()) {
            showToast('Contact person is required', 'error');
            return;
        }

        if (formData.phone && !validateNigerianPhone(formData.phone, showToast)) {
            return;
        }

        try {
            if (supplier) {
                await db.suppliers.update(supplier.id!, {
                    ...formData,
                    updated_at: new Date().toISOString()
                });
            } else {
                await db.suppliers.add({
                    ...formData,
                    balance: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                } as Supplier);
            }
            onClose();
        } catch (error) {
            console.error('Error saving supplier:', error);
            showToast('Failed to save supplier', 'error');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h2 className="font-bold text-lg text-slate-800">
                        {supplier ? 'Edit Supplier' : 'Add New Supplier'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                        <input
                            required
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={formData.companyName}
                            onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person *</label>
                        <input
                            required
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={formData.contactName}
                            onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                            <input
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <input
                                type="email"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                        <textarea
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                            rows={3}
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                        />
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                            Save Supplier
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
