import React from 'react';
import { Edit, Trash2, Phone, Mail, MapPin, History } from 'lucide-react';
import { Supplier } from '../../types';

interface SupplierCardProps {
    supplier: Supplier;
    onEdit: (supplier: Supplier) => void;
    onDelete: (id: string) => void | Promise<void>;
    onSettle: (supplier: Supplier) => void;
    onHistory: (supplier: Supplier) => void;
}

export const SupplierCard: React.FC<SupplierCardProps> = ({ supplier, onEdit, onDelete, onSettle, onHistory }) => {
    return (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-lg text-slate-800">{supplier.companyName}</h3>
                <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onHistory(supplier)}
                        title="View Purchase & Payment History"
                        className="p-2 md:p-1.5 bg-white md:bg-transparent shadow-sm md:shadow-none rounded-lg text-slate-500 hover:text-emerald-600 transition-colors"
                    >
                        <History className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onEdit(supplier)}
                        title="Edit Supplier"
                        className="p-2 md:p-1.5 bg-white md:bg-transparent shadow-sm md:shadow-none rounded-lg text-slate-500 hover:text-emerald-600 transition-colors"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(supplier.id!)}
                        title="Delete Supplier"
                        className="p-2 md:p-1.5 bg-white md:bg-transparent shadow-sm md:shadow-none rounded-lg text-slate-500 hover:text-red-600 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                    <UserRoleIcon className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">{supplier.contactName}</span>
                </div>
                {supplier.phone && (
                    <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <span>{supplier.phone}</span>
                    </div>
                )}
                {supplier.email && (
                    <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span>{supplier.email}</span>
                    </div>
                )}
                {supplier.address && (
                    <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                        <span className="line-clamp-2">{supplier.address}</span>
                    </div>
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Balance</span>
                    <span className={`font-bold ${supplier.balance && supplier.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ₦{(supplier.balance || 0).toLocaleString()}
                    </span>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => onHistory(supplier)}
                        className="flex-1 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs md:text-sm font-semibold rounded-lg border border-slate-200 hover:border-slate-300 transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                    >
                        <History className="w-4 h-4 text-slate-500" />
                        History
                    </button>
                    {supplier.balance && supplier.balance > 0 ? (
                        <button
                            onClick={() => onSettle(supplier)}
                            className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                        >
                            Settle Debt
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function UserRoleIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    )
}
