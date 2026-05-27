import { useState } from 'react';
import { db, logAudit } from '../db/db';
import { Product, User } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../contexts/ToastContext';
import { useDialog } from '../contexts/DialogContext';

export function useInventory(currentUser: User | null) {
    const { showToast } = useToast();
    const { confirm } = useDialog();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '',
        category: '',
        buyPrice: 0,
        sellPrice: 0,
        quantity: 0,
        minStockLevel: 10,
        department: '',
        wholesalePrice: 0,
        photo: ''
    });

    const products = useLiveQuery(async () => {
        let collection = db.products.orderBy('name');
        if (searchTerm) {
            const all = await collection.toArray();
            const term = (searchTerm || '').toLowerCase();
            return all.filter(p =>
                ((p.name || '').toLowerCase().includes(term)) ||
                ((p.category || '').toLowerCase().includes(term))
            );
        }
        return collection.toArray();
    }, [searchTerm]);


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
                photo: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleDelete = async (product: Product) => {
        if (await confirm(`Are you sure you want to delete "${product.name}"?`, { type: 'warning', confirmText: 'Delete Product' })) {
            try {
                await db.products.delete(product.id!);
                await logAudit('DELETE_PRODUCT', `Deleted product: ${product.name}`, currentUser?.username || 'Unknown');
                showToast(`Product "${product.name}" deleted successfully`, 'success');
            } catch (error) {
                console.error('Failed to delete product:', error);
                showToast('Failed to delete product', 'error');
            }
        }
    };

    const handleSubmit = async (data: Partial<Product>) => {
        // Basic validation
        if (!data.name || !data.category || data.buyPrice === undefined || data.sellPrice === undefined) {
            showToast('Please fill in all required fields (*) correctly', 'error');
            return;
        }

        try {
            const productData = {
                ...data,
                updated_at: new Date().toISOString()
            } as Product;

            if (editingProduct) {
                await db.products.update(editingProduct.id!, productData);
                await logAudit('UPDATE_PRODUCT', `Updated product: ${productData.name}`, currentUser?.username || 'Unknown');
                showToast('Product updated successfully', 'success');
            } else {
                productData.created_at = new Date().toISOString();
                await db.products.add(productData);
                await logAudit('CREATE_PRODUCT', `Created product: ${productData.name}`, currentUser?.username || 'Unknown');
                showToast('Product added successfully', 'success');
            }

            setIsModalOpen(false);
            setEditingProduct(null);
        } catch (error) {
            console.error('Failed to save product:', error);
            showToast('Failed to save product. Please check your data and try again.', 'error');
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
        isModalOpen,
        setIsModalOpen,
        isBulkModalOpen,
        setIsBulkModalOpen,
        searchTerm,
        setSearchTerm,
        editingProduct,
        formData,
        setFormData,
        products,
        handleOpenModal,
        handleDelete,
        handleSubmit,
        downloadTemplate
    };
}
