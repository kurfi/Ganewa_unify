import React, { useState } from 'react';
import { CreditCard, Plus, X, Edit, Trash2, AlertCircle } from 'lucide-react';
import { bankAccountsRepo } from '../../repositories';
import { useCollection, logAudit } from '../../firebase/firestoreHelpers';
import { BankAccount } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useDialog } from '../../contexts/DialogContext';

export function EcommercePaymentConfig() {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const { confirm } = useDialog();

    const { data: bankAccounts } = useCollection<BankAccount>('bankAccounts');

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

    const [form, setForm] = useState({
        bankName: '',
        accountNo: '',
        accountName: '',
        active: true,
        error: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenAddModal = () => {
        setForm({
            bankName: '',
            accountNo: '',
            accountName: '',
            active: true,
            error: ''
        });
        setIsAddModalOpen(true);
    };

    const handleOpenEditModal = (account: BankAccount) => {
        setEditingAccount(account);
        setForm({
            bankName: account.bankName,
            accountNo: account.accountNo,
            accountName: account.accountName,
            active: account.active,
            error: ''
        });
        setIsEditModalOpen(true);
    };

    const validateForm = () => {
        if (!form.bankName.trim()) {
            setForm(prev => ({ ...prev, error: 'Bank Name is required.' }));
            return false;
        }
        if (!form.accountNo.trim() || !/^\d+$/.test(form.accountNo.trim())) {
            setForm(prev => ({ ...prev, error: 'Account Number must contain only digits.' }));
            return false;
        }
        if (form.accountNo.trim().length < 5) {
            setForm(prev => ({ ...prev, error: 'Account Number must be at least 5 digits.' }));
            return false;
        }
        if (!form.accountName.trim()) {
            setForm(prev => ({ ...prev, error: 'Account Name is required.' }));
            return false;
        }
        return true;
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm() || isSubmitting) return;

        setIsSubmitting(true);

        try {
            const newAccount: Omit<BankAccount, 'id' | 'deleted' | 'created_at' | 'updated_at'> = {
                bankName: form.bankName.trim(),
                accountNo: form.accountNo.trim(),
                accountName: form.accountName.trim(),
                balance: 0,
                active: form.active
            };

            await bankAccountsRepo.create(newAccount);

            await logAudit(
                'BANK_ACCOUNT_CREATED',
                `Bank account ${form.accountNo} (${form.bankName}) created for E-commerce`,
                currentUser?.username || 'System'
            );

            showToast("Bank account added successfully!", 'success');
            setIsAddModalOpen(false);
        } catch (error) {
            console.error("Failed to add bank account:", error);
            setForm(prev => ({ ...prev, error: 'Failed to add bank account.' }));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAccount || !validateForm() || isSubmitting) return;

        setIsSubmitting(true);

        try {
            const updates: Partial<BankAccount> = {
                bankName: form.bankName.trim(),
                accountNo: form.accountNo.trim(),
                accountName: form.accountName.trim(),
                active: form.active
            };

            await bankAccountsRepo.update(editingAccount.id!, updates);

            await logAudit(
                'BANK_ACCOUNT_UPDATED',
                `Bank account ${editingAccount.accountNo} (${editingAccount.bankName}) updated`,
                currentUser?.username || 'System'
            );

            showToast("Bank account updated successfully!", 'success');
            setIsEditModalOpen(false);
        } catch (error) {
            console.error("Failed to update bank account:", error);
            setForm(prev => ({ ...prev, error: 'Failed to update bank account.' }));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteAccount = async (id: string, accountNo: string) => {
        if (await confirm(`Are you sure you want to delete account ${accountNo}? This will prevent customers from paying into it.`, { type: 'warning', confirmText: 'Delete Account' })) {
            try {
                await bankAccountsRepo.delete(id);

                await logAudit(
                    'BANK_ACCOUNT_DELETED',
                    `Bank account with ID: ${id} deleted`,
                    currentUser?.username || 'System'
                );

                showToast("Bank account deleted successfully.", 'success');
            } catch (error) {
                console.error("Failed to delete bank account:", error);
                showToast("Failed to delete bank account.", 'error');
            }
        }
    };

    const handleToggleActive = async (account: BankAccount) => {
        try {
            await bankAccountsRepo.update(account.id!, { active: !account.active });
            showToast(`Account ${account.accountNo} status updated.`, 'success');
        } catch (error) {
            console.error("Failed to toggle status:", error);
            showToast("Failed to update account status.", 'error');
        }
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                        <CreditCard className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                        E-commerce Bank Accounts
                    </h2>
                    <p className="text-slate-500 text-xs md:text-sm">Configure bank accounts displayed to customers on Checkout.</p>
                </div>
                <button
                    onClick={handleOpenAddModal}
                    className="w-full md:w-auto bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 flex items-center justify-center gap-2 shadow-sm text-xs md:text-sm font-medium"
                >
                    <Plus className="w-4 h-4" /> Add Account
                </button>
            </div>

            {bankAccounts.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs md:text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-400 font-medium">
                                <th className="py-3 px-4">Bank Name</th>
                                <th className="py-3 px-4">Account Number</th>
                                <th className="py-3 px-4">Account Name</th>
                                <th className="py-3 px-4 text-center">Status</th>
                                <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {bankAccounts.map((account) => (
                                <tr key={account.id} className="text-slate-700 hover:bg-slate-50">
                                    <td className="py-3 px-4 font-semibold">{account.bankName}</td>
                                    <td className="py-3 px-4 font-mono">{account.accountNo}</td>
                                    <td className="py-3 px-4">{account.accountName}</td>
                                    <td className="py-3 px-4 text-center">
                                        <button
                                            onClick={() => handleToggleActive(account)}
                                            className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                                                account.active
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : 'bg-slate-100 text-slate-600'
                                            }`}
                                        >
                                            {account.active ? 'Active' : 'Inactive'}
                                        </button>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleOpenEditModal(account)}
                                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900"
                                                title="Edit"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteAccount(account.id!, account.accountNo)}
                                                className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-700"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-8 text-slate-400">
                    <p className="text-xs md:text-sm">No bank accounts configured yet. Click "Add Account" to configure one.</p>
                </div>
            )}

            {/* Add Account Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-4 md:p-6 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">Add Bank Account</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleAddAccount} className="p-4 md:p-6 space-y-4">
                            {form.error && (
                                <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-xs">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{form.error}</span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700">Bank Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Moniepoint MFB"
                                    value={form.bankName}
                                    onChange={e => setForm({ ...form, bankName: e.target.value, error: '' })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700">Account Number</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 8138012494"
                                    value={form.accountNo}
                                    onChange={e => setForm({ ...form, accountNo: e.target.value, error: '' })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700">Account Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Ganewa Provision Store"
                                    value={form.accountName}
                                    onChange={e => setForm({ ...form, accountName: e.target.value, error: '' })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                                />
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="add-active"
                                    checked={form.active}
                                    onChange={e => setForm({ ...form, active: e.target.checked })}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <label htmlFor="add-active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                                    Display to customers on checkout
                                </label>
                            </div>
                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 text-xs font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Adding...' : 'Add Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Account Modal */}
            {isEditModalOpen && editingAccount && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-4 md:p-6 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">Edit Bank Account</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateAccount} className="p-4 md:p-6 space-y-4">
                            {form.error && (
                                <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-xs">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{form.error}</span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700">Bank Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Moniepoint MFB"
                                    value={form.bankName}
                                    onChange={e => setForm({ ...form, bankName: e.target.value, error: '' })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700">Account Number</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 8138012494"
                                    value={form.accountNo}
                                    onChange={e => setForm({ ...form, accountNo: e.target.value, error: '' })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700">Account Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Ganewa Provision Store"
                                    value={form.accountName}
                                    onChange={e => setForm({ ...form, accountName: e.target.value, error: '' })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                                />
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="edit-active"
                                    checked={form.active}
                                    onChange={e => setForm({ ...form, active: e.target.checked })}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <label htmlFor="edit-active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                                    Display to customers on checkout
                                </label>
                            </div>
                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 text-xs font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
