import { useMemo, useState } from 'react';
import { Product, User } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useDialog } from '../contexts/DialogContext';
import { logAudit } from '../firebase/firestoreHelpers';
import { usePaginatedCollection } from '../hooks/usePaginatedCollection';
import { productsRepo } from '../repositories';
import { emitDashboardRefresh } from '../utils/dashboardRefreshSignal';

export function useInventory(currentUser: User | null) {
    const { showToast } = useToast();
    const { confirm } = useDialog();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '',
        categoryId: '',
        category: '',
        buyPrice: 0,
        sellPrice: 0,
        quantity: 0,
        minStockLevel: 10,
        department: '',
        wholesalePrice: 0,
        photo: '',
        onlineDiscountTiers: []
    });

    const { data: rawProducts, loading, hasMore, loadMore, loadingMore, refresh, updateItem, addItem, removeItem } = usePaginatedCollection<Product>({
        collectionName: 'products',
        orderByField: 'name',
        orderDirection: 'asc',
        pageSize: 50,
        searchTerm: searchTerm,
        searchField: 'nameLower'
    });

    const products = useMemo(() => {
        // Exclude nameless records
        return rawProducts.filter(p => !!(p.name || '').trim());
    }, [rawProducts]);

    const handleOpenModal = (product?: Product) => {
        if (product && typeof product === 'object' && 'id' in product) {
            setEditingProduct(product);
            setFormData({ ...product });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                category: 'Beverages (Drinks & Water)',
                buyPrice: 0,
                sellPrice: 0,
                quantity: 0,
                minStockLevel: 10,
                department: '',
                wholesalePrice: 0,
                photo: '',
                onlineDiscountTiers: []
            });
        }
        setIsModalOpen(true);
    };

    const handleDelete = async (product: Product) => {
        if (await confirm(`Are you sure you want to delete "${product.name}"?`, { type: 'warning', confirmText: 'Delete Product' })) {
            const productId = product.id!;
            // Optimistic removal for instant UI response
            removeItem(productId);
            showToast(`Product "${product.name}" deleted successfully`, 'success');

            productsRepo.delete(productId)
                .then(() => {
                    emitDashboardRefresh();
                    logAudit('DELETE_PRODUCT', `Deleted product: ${product.name}`, currentUser?.username || 'Unknown').catch(console.error);
                })
                .catch((error) => {
                    console.error('Failed to delete product in database:', error);
                    showToast('Failed to delete product from database.', 'error');
                    refresh();
                });
        }
    };

    const handleSubmit = async (data: Partial<Product>) => {
        // Basic validation
        if (!data.name || !data.category || data.buyPrice === undefined || data.sellPrice === undefined) {
            showToast('Please fill in all required fields (*) correctly', 'error');
            return;
        }

        const computedStockValue = (Number(data.quantity) || 0) * (Number(data.buyPrice) || 0);

        if (editingProduct) {
            const productId = editingProduct.id!;
            const updatedProduct = {
                ...editingProduct,
                ...data,
                stockValue: computedStockValue,
                updated_at: new Date().toISOString()
            };

            // 1. Instant optimistic update & modal close (0ms delay)
            updateItem(productId, updatedProduct);
            setIsModalOpen(false);
            setEditingProduct(null);
            showToast('Product updated successfully', 'success');

            // 2. Persist in background
            const previousQty = editingProduct.quantity;
            const newQty = data.quantity ?? previousQty;
            const isQtyChange = previousQty !== newQty;

            productsRepo.update(productId, { ...data, stockValue: computedStockValue })
                .then(() => {
                    emitDashboardRefresh();
                    if (isQtyChange) {
                        logAudit(
                            'STOCK_QUANTITY_CHANGE',
                            `Cashier/Staff ${currentUser?.username || 'Unknown'} changed stock for "${data.name}" from ${previousQty} to ${newQty}. Reason: Manual stock adjustment`,
                            currentUser?.username || 'Unknown'
                        ).catch(console.error);
                    }
                    logAudit('UPDATE_PRODUCT', `Updated product: ${data.name}`, currentUser?.username || 'Unknown').catch(console.error);
                })
                .catch((error) => {
                    console.error('Failed to update product in database:', error);
                    showToast('Failed to save product changes to server.', 'error');
                    refresh();
                });
        } else {
            // New product creation
            setIsModalOpen(false);
            setEditingProduct(null);

            try {
                const newId = await productsRepo.create({
                    ...data,
                    stockValue: computedStockValue
                } as Omit<Product, 'id' | 'deleted' | 'created_at' | 'updated_at'>);

                const newProduct: Product = {
                    id: newId,
                    name: data.name || '',
                    categoryId: data.categoryId || '',
                    category: data.category || '',
                    buyPrice: Number(data.buyPrice) || 0,
                    sellPrice: Number(data.sellPrice) || 0,
                    quantity: Number(data.quantity) || 0,
                    stockValue: computedStockValue,
                    minStockLevel: Number(data.minStockLevel) || 10,
                    department: data.department || '',
                    wholesalePrice: Number(data.wholesalePrice) || 0,
                    photo: data.photo || '',
                    onlineDiscountTiers: data.onlineDiscountTiers || [],
                    deleted: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                addItem(newProduct);
                emitDashboardRefresh();
                logAudit('CREATE_PRODUCT', `Created product: ${data.name}`, currentUser?.username || 'Unknown').catch(console.error);
                showToast('Product added successfully', 'success');
            } catch (error) {
                console.error('Failed to save product:', error);
                showToast('Failed to save product. Please check your data and try again.', 'error');
            }
        }
    };

    const downloadTemplate = () => {
        const headers = "Name,Category,BuyPrice,SellPrice,Quantity,MinStock\nMilk,Dairy,1000,1200,50,10";
        const blob = new Blob([headers], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'inventory_template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return {
        isModalOpen, setIsModalOpen,
        isBulkModalOpen, setIsBulkModalOpen,
        searchTerm, setSearchTerm,
        editingProduct, setEditingProduct,
        formData, setFormData,
        products,
        loading, hasMore, loadMore, loadingMore,
        handleOpenModal,
        handleDelete,
        handleSubmit,
        downloadTemplate
    };
}
