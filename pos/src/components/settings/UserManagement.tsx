import React, { useState } from 'react';
import { Users, Plus, X, Edit, Trash2 } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { usersRepo } from '../../repositories';
import { useCollection, logAudit } from '../../firebase/firestoreHelpers';
import { User, UserRole } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useDialog } from '../../contexts/DialogContext';
import { validateInventoryField } from '../../utils/validation';

export function UserManagement() {
    const { currentUser } = useAuth();
    const { data: dbUsers } = useCollection<User>('users');
    const { showToast } = useToast();
    const { confirm } = useDialog();

    const allUsers = dbUsers ? [...dbUsers] : [];

    const filteredUsers = allUsers.filter(u => {
        // Super Admin sees everyone
        if (currentUser?.role === UserRole.SUPER_ADMIN) return true;
        
        // Admin sees everyone except Super Admins
        if (currentUser?.role === UserRole.ADMIN) {
            return u.role !== UserRole.SUPER_ADMIN;
        }

        // Cashiers see only other Cashiers (or themselves)
        if (currentUser?.role === UserRole.CASHIER) {
            return u.role === UserRole.CASHIER;
        }

        return false;
    });

    const users = filteredUsers;

    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const [addUserForm, setAddUserForm] = useState({ username: '', password: '', confirmPassword: '', role: UserRole.CASHIER, error: '' });
    const [editUserForm, setEditUserForm] = useState({ id: '', role: UserRole.CASHIER, password: '', confirmPassword: '', error: '' });
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [isEditingUserSubmitting, setIsEditingUserSubmitting] = useState(false);

    const handleOpenAddModal = () => {
        setAddUserForm({ username: '', password: '', confirmPassword: '', role: UserRole.CASHIER, error: '' });
        setIsAddUserModalOpen(true);
    };

    const handleOpenEditModal = (user: User) => {
        setEditingUser(user);
        setEditUserForm({ id: user.id!, role: user.role, password: '', confirmPassword: '', error: '' });
        setIsEditUserModalOpen(true);
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isAddingUser) return;

        const { username, password, confirmPassword, role } = addUserForm;

        if (!validateInventoryField(username, 'Username', showToast)) {
            return;
        }

        if (password.length < 8) {
            setAddUserForm(prev => ({ ...prev, error: 'Password must be at least 8 characters.' }));
            return;
        }

        if (password !== confirmPassword) {
            setAddUserForm(prev => ({ ...prev, error: 'Passwords do not match.' }));
            return;
        }

        const existingUser = allUsers.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
        if (existingUser) {
            setAddUserForm(prev => ({ ...prev, error: 'Username already exists.' }));
            return;
        }

        setIsAddingUser(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const createStaffUserFn = httpsCallable(functions, 'createStaffUser');
            await createStaffUserFn({
                username: username.trim(),
                password,
                role
            });

            await logAudit(
                'USER_CREATED',
                `User ${username.trim()} created with role ${role}`,
                currentUser?.username || 'System'
            );

            showToast("Staff user created! They must change their password on first login.", 'success');
            setIsAddUserModalOpen(false);
        } catch (error: any) {
            console.error("Failed to add user:", error);
            setAddUserForm(prev => ({ ...prev, error: error?.message || 'Failed to add user.' }));
        } finally {
            setIsAddingUser(false);
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isEditingUserSubmitting) return;

        const { id, role, password, confirmPassword } = editUserForm;

        if (password && password.length < 8) {
            setEditUserForm(prev => ({ ...prev, error: 'Password must be at least 8 characters.' }));
            return;
        }

        if (password && password !== confirmPassword) {
            setEditUserForm(prev => ({ ...prev, error: 'New passwords do not match.' }));
            return;
        }

        setIsEditingUserSubmitting(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');

            if (editingUser && role !== editingUser.role) {
                const setUserRoleFn = httpsCallable(functions, 'setUserRole');
                await setUserRoleFn({ targetUid: id, role });
            }

            if (password) {
                const setStaffPasswordFn = httpsCallable(functions, 'setStaffPassword');
                await setStaffPasswordFn({ targetUid: id, newPassword: password, requirePasswordChange: true });
            }

            await logAudit(
                'USER_UPDATED',
                `User ${editingUser?.username} updated`,
                currentUser?.username || 'System'
            );

            setIsEditUserModalOpen(false);
            showToast(password ? "User updated. Temporary password set (must change on next login)." : "User updated successfully.", 'success');
        } catch (error: any) {
            console.error("Failed to update user:", error);
            setEditUserForm(prev => ({ ...prev, error: error?.message || 'Failed to update user.' }));
            showToast(error?.message || "Failed to update user.", 'error');
        } finally {
            setIsEditingUserSubmitting(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (userId === currentUser?.id) {
            showToast("You cannot delete your own account.", 'error');
            return;
        }
        if (await confirm("Are you sure you want to delete this user? This action cannot be undone.", { type: 'warning', confirmText: 'Delete User' })) {
            try {
                await usersRepo.delete(userId);
                await logAudit(
                    'USER_DELETED',
                    `User deleted with ID: ${userId}`,
                    currentUser?.username || 'System'
                );
                showToast("User deleted successfully.", 'success');
            } catch (error) {
                console.error("Failed to delete user:", error);
                showToast("Failed to delete user.", 'error');
            }
        }
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
                <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Users className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                        User Management
                    </h2>
                    <p className="text-slate-500 text-xs md:text-sm">
                        {currentUser?.role === UserRole.SUPER_ADMIN
                            ? 'Manage staff accounts, roles, and password resets.'
                            : 'View staff accounts. Only a Super Admin can add users, change roles, or reset passwords.'}
                    </p>
                </div>
                {currentUser?.role === UserRole.SUPER_ADMIN && (
                    <button
                        onClick={handleOpenAddModal}
                        className="w-full md:w-auto bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 flex items-center justify-center gap-2 shadow-sm text-xs md:text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" /> Add User
                    </button>
                )}
            </div>

            {/* User Management Desktop View */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                        <tr>
                            <th className="p-3 font-medium">Username</th>
                            <th className="p-3 font-medium">Role</th>
                            <th className="p-3 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {users?.map(user => (
                            <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-medium text-slate-800">{user.username}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN)
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-green-100 text-green-700'
                                        }`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="p-3 text-right">
                                    <div className="flex gap-2 justify-end">
                                        <button 
                                            onClick={() => handleOpenEditModal(user)} 
                                            disabled={user.role === UserRole.SUPER_ADMIN}
                                            className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUser(user.id!)}
                                            disabled={user.id === currentUser?.id || user.role === UserRole.SUPER_ADMIN}
                                            className="p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-md disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
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

            {/* User Management Mobile View */}
            <div className="md:hidden space-y-3">
                {users?.map(user => (
                    <div key={user.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">{user.username}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN)
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-green-100 text-green-700'
                                    }`}>
                                    {user.role}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleOpenEditModal(user)} 
                                    disabled={user.role === UserRole.SUPER_ADMIN}
                                    className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg disabled:opacity-20"
                                >
                                    <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => handleDeleteUser(user.id!)}
                                    disabled={user.id === currentUser?.id || user.role === UserRole.SUPER_ADMIN}
                                    className="p-2 bg-white border border-slate-200 text-red-600 rounded-lg disabled:opacity-20"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {(!users || users.length === 0) && (
                    <div className="p-4 text-center text-slate-400 text-xs py-10">No users found.</div>
                )}
            </div>

            {/* Add User Modal */}
            {isAddUserModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
                    <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg md:text-xl font-bold text-slate-800">Add New User</h2>
                            <button onClick={() => setIsAddUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddUser} className="space-y-3 md:space-y-4">
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Username</label>
                                <input required value={addUserForm.username} onChange={e => setAddUserForm(p => ({ ...p, username: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Password</label>
                                <input required type="password" value={addUserForm.password} onChange={e => setAddUserForm(p => ({ ...p, password: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                                <input required type="password" value={addUserForm.confirmPassword} onChange={e => setAddUserForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Role</label>
                                <select value={addUserForm.role} onChange={e => setAddUserForm(p => ({ ...p, role: e.target.value as UserRole }))} className="w-full border-slate-300 border p-2 rounded-lg bg-white text-sm">
                                    <option value={UserRole.CASHIER}>Cashier</option>
                                    <option value={UserRole.ADMIN}>Admin</option>
                                    {currentUser?.role === UserRole.SUPER_ADMIN && (
                                        <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
                                    )}
                                </select>
                            </div>
                            {addUserForm.error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{addUserForm.error}</p>}
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setIsAddUserModalOpen(false)} disabled={isAddingUser} className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                                <button type="submit" disabled={isAddingUser} className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-xs md:text-sm font-bold disabled:opacity-50">
                                    {isAddingUser ? 'Saving...' : 'Save User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {isEditUserModalOpen && editingUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
                    <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg md:text-xl font-bold text-slate-800">Edit User: {editingUser.username}</h2>
                            <button onClick={() => setIsEditUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleUpdateUser} className="space-y-3 md:space-y-4">
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Role</label>
                                <select value={editUserForm.role} onChange={e => setEditUserForm(p => ({ ...p, role: e.target.value as UserRole }))} className="w-full border-slate-300 border p-2 rounded-lg bg-white text-sm">
                                    <option value={UserRole.CASHIER}>Cashier</option>
                                    <option value={UserRole.ADMIN}>Admin</option>
                                    {currentUser?.role === UserRole.SUPER_ADMIN && (
                                        <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
                                    )}
                                </select>
                            </div>
                            <p className="text-[10px] md:text-xs text-slate-500 border-t border-slate-100 pt-4 italic text-center">Leave password blank to keep current.</p>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">New Password</label>
                                <input type="password" value={editUserForm.password} onChange={e => setEditUserForm(p => ({ ...p, password: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                                <input type="password" value={editUserForm.confirmPassword} onChange={e => setEditUserForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
                            </div>
                            {editUserForm.error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{editUserForm.error}</p>}
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setIsEditUserModalOpen(false)} disabled={isEditingUserSubmitting} className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                                <button type="submit" disabled={isEditingUserSubmitting} className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-xs md:text-sm font-bold disabled:opacity-50">
                                    {isEditingUserSubmitting ? 'Updating...' : 'Update User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
