import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export function SecurityProfile() {
    const { currentUser, changePassword } = useAuth();
    const { showToast } = useToast();
    const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
    const [changePasswordForm, setChangePasswordForm] = useState({ password: '', confirmPassword: '', error: '', loading: false });

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const { password, confirmPassword } = changePasswordForm;

        if (!password) {
            setChangePasswordForm(prev => ({ ...prev, error: 'Password cannot be empty.' }));
            return;
        }

        if (password !== confirmPassword) {
            setChangePasswordForm(prev => ({ ...prev, error: 'Passwords do not match.' }));
            return;
        }

        setChangePasswordForm(prev => ({ ...prev, loading: true, error: '' }));
        try {
            const result = await changePassword(password);
            if (result.success) {
                showToast('Password updated successfully!', 'success');
                setIsChangePasswordModalOpen(false);
                setChangePasswordForm({ password: '', confirmPassword: '', error: '', loading: false });
            } else {
                setChangePasswordForm(prev => ({ ...prev, error: result.error || 'Failed to update password.' }));
            }
        } catch (err: any) {
            setChangePasswordForm(prev => ({ ...prev, error: err.message || 'An unexpected error occurred.' }));
        } finally {
            setChangePasswordForm(prev => ({ ...prev, loading: false }));
        }
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="p-2.5 md:p-3 bg-indigo-100 rounded-full">
                        <Lock className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-base md:text-lg font-bold text-slate-900">Security & Profile</h2>
                        <p className="text-slate-500 text-xs md:text-sm">Manage your account security.</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsChangePasswordModalOpen(true)}
                    className="w-full md:w-auto px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-xs md:text-sm font-medium"
                >
                    Change Password
                </button>
            </div>
            <div className="pt-3 md:pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center text-xs md:text-sm">
                    <span className="text-slate-500">Username:</span>
                    <span className="font-semibold text-slate-900">{currentUser?.username}</span>
                </div>
                <div className="flex justify-between items-center text-xs md:text-sm mt-2">
                    <span className="text-slate-500">Role:</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] md:text-xs font-bold uppercase">{currentUser?.role}</span>
                </div>
            </div>

            {/* Change Password Modal */}
            {isChangePasswordModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
                    <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg md:text-xl font-bold text-slate-800">Change Password</h2>
                            <button
                                onClick={() => setIsChangePasswordModalOpen(false)}
                                className="p-1 text-slate-400 hover:text-slate-600"
                                disabled={changePasswordForm.loading}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleChangePassword} className="space-y-3 md:space-y-4">
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">New Password</label>
                                <input
                                    required
                                    type="password"
                                    value={changePasswordForm.password}
                                    onChange={e => setChangePasswordForm(p => ({ ...p, password: e.target.value, error: '' }))}
                                    className="w-full border-slate-300 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    placeholder="Enter new password"
                                />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                                <input
                                    required
                                    type="password"
                                    value={changePasswordForm.confirmPassword}
                                    onChange={e => setChangePasswordForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))}
                                    className="w-full border-slate-300 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    placeholder="Confirm new password"
                                />
                            </div>

                            {changePasswordForm.error && (
                                <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 italic">
                                    {changePasswordForm.error}
                                </p>
                            )}

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsChangePasswordModalOpen(false)}
                                    className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100"
                                    disabled={changePasswordForm.loading}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs md:text-sm font-bold disabled:opacity-50 flex items-center gap-2"
                                    disabled={changePasswordForm.loading}
                                >
                                    {changePasswordForm.loading ? 'Updating...' : 'Update Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
