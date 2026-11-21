import { useMemo, useState } from 'react';
import { Supplier } from '../types';
import { usePaginatedCollection } from '../hooks/usePaginatedCollection';
import { suppliersRepo } from '../repositories';
import { useDialog } from '../contexts/DialogContext';
import { useToast } from '../contexts/ToastContext';

export function useSuppliers() {
    const { confirm } = useDialog();
    const { showToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [settleSupplier, setSettleSupplier] = useState<Supplier | null>(null);
    const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);

    const { data: rawSuppliers, loading, hasMore, loadMore, loadingMore } = usePaginatedCollection<Supplier>({
        collectionName: 'suppliers',
        orderByField: 'companyName',
        orderDirection: 'asc',
        pageSize: 50,
        searchTerm: searchQuery,
        searchField: 'nameLower'
    });

    const suppliers = useMemo(() => {
        return rawSuppliers;
    }, [rawSuppliers]);

    const handleDelete = async (id: string) => {
        if (await confirm('Are you sure you want to delete this supplier?', { type: 'warning', confirmText: 'Delete Supplier' })) {
            try {
                await suppliersRepo.delete(id);
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

    const handleHistory = (supplier: Supplier) => {
        setHistorySupplier(supplier);
        setIsHistoryModalOpen(true);
    };

    return {
        suppliers,
        searchQuery,
        setSearchQuery,
        isModalOpen,
        setIsModalOpen,
        isSettleModalOpen,
        setIsSettleModalOpen,
        isHistoryModalOpen,
        setIsHistoryModalOpen,
        editingSupplier,
        settleSupplier,
        historySupplier,
        loading, hasMore, loadMore, loadingMore,
        handleDelete,
        handleEdit,
        handleAdd,
        handleSettle,
        handleHistory
    };
}
