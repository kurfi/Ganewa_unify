import { useState } from 'react';
import { db } from '../db/db';
import { Supplier } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDialog } from '../contexts/DialogContext';
import { useToast } from '../contexts/ToastContext';

export function useSuppliers() {
    const { confirm } = useDialog();
    const { showToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [settleSupplier, setSettleSupplier] = useState<Supplier | null>(null);

    const suppliers = useLiveQuery(
        () => {
            if (!searchQuery) return db.suppliers.toArray();
            const term = (searchQuery || '').toLowerCase();
            return db.suppliers
                .filter(s =>
                    (s.companyName || '').toLowerCase().includes(term) ||
                    (s.contactName || '').toLowerCase().includes(term)
                )
                .toArray();
        },
        [searchQuery]
    );

    const handleDelete = async (id: string) => {
        if (await confirm('Are you sure you want to delete this supplier?', { type: 'warning', confirmText: 'Delete Supplier' })) {
            try {
                await db.suppliers.delete(id);
                showToast('Supplier deleted successfully', 'success');
            } catch (error) {
                console.error('Error deleting supplier:', error);
                showToast('Failed to delete supplier', 'error');
            }
        }
    };

    const handleEdit = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setEditingSupplier(null);
        setIsModalOpen(true);
    };

    const handleSettle = (supplier: Supplier) => {
        setSettleSupplier(supplier);
        setIsSettleModalOpen(true);
    };

    return {
        suppliers,
        searchQuery,
        setSearchQuery,
        isModalOpen,
        setIsModalOpen,
        isSettleModalOpen,
        setIsSettleModalOpen,
        editingSupplier,
        settleSupplier,
        handleDelete,
        handleEdit,
        handleAdd,
        handleSettle
    };
}
