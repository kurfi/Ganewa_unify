import React, { useState } from 'react';
import { db, deleteCustomer, logAudit } from '../db/db';
import { Customer, UserRole } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserPlus, Mail, Phone, History, Upload, Pencil, Wallet, Trash2, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useDialog } from '../contexts/DialogContext';

// Modals
import { AddCustomerModal } from '../components/customers/AddCustomerModal';
import { EditCustomerModal } from '../components/customers/EditCustomerModal';
import { RepayDebtModal } from '../components/customers/RepayDebtModal';
import { BulkImportModal } from '../components/customers/BulkImportModal';
import { CustomerHistoryModal } from '../components/customers/CustomerHistoryModal';

const Customers: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useDialog();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const customers = useLiveQuery(() => {
    if (!db.customers) return [];
    let query = db.customers.where('name').notEqual('Walk-in Customer');

    if (searchQuery) {
      const lowerCaseQuery = (searchQuery || '').toLowerCase();
      return query.filter(customer =>
        ((customer.name || '').toLowerCase().includes(lowerCaseQuery)) ||
        ((customer.phone || '').includes(lowerCaseQuery)) ||
        ((customer.email || '').toLowerCase().includes(lowerCaseQuery))
      ).toArray().then(arr => arr.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    }
    return query.toArray().then(arr => arr.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  }, [searchQuery]);

  const handleOpenEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditModalOpen(true);
  };

  const handleOpenRepayModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsRepayModalOpen(true);
  };

  const handleViewHistory = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsHistoryModalOpen(true);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!isAdmin) {
      showToast('Access Denied: Only admins can delete customers.', 'error');
      return;
    }

    if (await confirm('Are you sure you want to delete this customer? This action cannot be undone.', { type: 'warning', confirmText: 'Delete Customer' })) {
      try {
        await deleteCustomer(customerId);
        showToast('Customer deleted successfully.', 'success');
        await logAudit('DELETE_CUSTOMER', `Deleted customer ID: ${customerId}`, currentUser?.username || 'Unknown');
      } catch (error) {
        console.error('Failed to delete customer:', error);
        showToast('Failed to delete customer.', 'error');
      }
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Customers</h1>
        <div className="flex-1 min-w-0 md:max-w-xs relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            className="w-full pl-10 pr-4 py-2 md:py-2.5 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm text-slate-900 dark:text-white placeholder-slate-400"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="flex-1 md:flex-none bg-white text-slate-700 border border-slate-200 px-3 py-1.5 md:px-4 md:py-2 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2 shadow-sm transition-colors text-xs md:text-sm"
              >
                <Upload className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Import CSV
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex-1 md:flex-none bg-slate-900 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2 shadow-sm text-xs md:text-sm font-medium"
              >
                <UserPlus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Add Customer
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 xl.5:grid-cols-4 gap-4 customer-cards-grid">
        {customers?.map(customer => (
          <div key={customer.id} className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col transition-all hover:shadow-md">
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg md:text-xl shrink-0">
                {(customer.name || '?').charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-800 truncate text-sm md:text-base">{customer.name}</h3>
                <p className="text-[10px] md:text-xs text-slate-500 truncate" title={customer.id}>ID: {customer.id}</p>
              </div>
            </div>
            <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm text-slate-600 mb-4 md:mb-5">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 shrink-0" />
                <span className="truncate">{customer.phone}</span>
              </div>
              {customer.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
            </div>
            <div className="mt-auto pt-3 md:pt-4 border-t border-slate-100 flex flex-col gap-3">
              <div className="flex justify-between items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] md:text-xs text-slate-400 truncate">Current Debt</p>
                  <p className={`font-bold text-base md:text-xl ${customer.currentDebt > 0 ? 'text-red-500' : 'text-slate-700'} truncate`}>
                    ₦{(customer.currentDebt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                {customer.currentDebt > 0 && (
                  <button
                    onClick={() => handleOpenRepayModal(customer)}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-md text-[10px] md:text-xs font-bold hover:bg-emerald-100 flex items-center gap-1 shrink-0"
                  >
                    <Wallet className="w-3 h-3" /> Repay
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 md:gap-2 w-full">
                {isAdmin && (
                  <button
                    onClick={() => handleOpenEditModal(customer)}
                    className="flex-1 min-w-[70px] py-1.5 md:py-2 bg-slate-50 text-slate-600 text-xs md:text-sm font-medium rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1.5 md:gap-2 transition-colors min-w-0"
                  >
                    <Pencil className="w-3 h-3 shrink-0" /> <span className="truncate">Edit</span>
                  </button>
                )}
                <button
                  onClick={() => handleViewHistory(customer)}
                  className="flex-1 min-w-[70px] py-1.5 md:py-2 bg-slate-50 text-slate-600 text-xs md:text-sm font-medium rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1.5 md:gap-2 transition-colors min-w-0"
                >
                  <History className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" /> <span className="truncate">History</span>
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteCustomer(customer.id!)}
                    className="flex-1 min-w-[70px] py-1.5 md:py-2 bg-red-50 text-red-600 text-xs md:text-sm font-medium rounded-lg hover:bg-red-100 flex items-center justify-center gap-1.5 md:gap-2 transition-colors min-w-0"
                  >
                    <Trash2 className="w-3 h-3 shrink-0" /> <span className="truncate">Delete</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {customers?.length === 0 && (
          <div className="col-span-full text-center py-10 text-slate-400">
            No customers found. Add one to get started.
          </div>
        )}
      </div>

      {/* Modals */}
      <AddCustomerModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <BulkImportModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} />
      <EditCustomerModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} customer={selectedCustomer} />
      <RepayDebtModal isOpen={isRepayModalOpen} onClose={() => setIsRepayModalOpen(false)} customer={selectedCustomer} />
      <CustomerHistoryModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} customer={selectedCustomer} />

    </div>
  );
};

export default Customers;
