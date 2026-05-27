import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { X, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { Product } from '../../types';
import { uploadToCloudinary } from '../../services/cloudinary';
import { PRODUCT_CATEGORIES } from '../../constants/productCategories';
import { validateInventoryField, validateNumericField } from '../../utils/validation';

interface ProductModalProps {
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    editingProduct: Product | null;
    formData: Partial<Product>;
    handleSubmit: (data: Partial<Product>) => void;
}

export function ProductModal({
    isModalOpen,
    setIsModalOpen,
    editingProduct,
    formData: initialFormData,
    handleSubmit
}: ProductModalProps) {
    const { showToast } = useToast();
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [localFormData, setLocalFormData] = useState<Partial<Product>>(initialFormData);

    // Sync local state when modal opens or initial data changes
    useEffect(() => {
        if (isModalOpen) {
            setLocalFormData(initialFormData);
            setPreviewUrl(initialFormData.photo || null);
        }
    }, [isModalOpen, initialFormData]);

    const handleClearPhoto = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setLocalFormData(prev => ({ ...prev, photo: '' }));
        setPreviewUrl(null);
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Create local preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);

        try {
            setUploading(true);
            const downloadURL = await uploadToCloudinary(file);

            setLocalFormData(prev => ({ ...prev, photo: downloadURL }));
            setUploading(false);
        } catch (error) {
            console.error('Error uploading image:', error);
            showToast('Failed to upload image. Please try again.', 'error');
            setUploading(false);
        }
    };

    const onFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validate name
        if (!localFormData.name?.trim()) {
            showToast('Product name is required', 'error');
            return;
        }

        if (!validateInventoryField(localFormData.name || '', 'Product name', showToast, 34)) {
            return;
        }

        // Validate category
        if (!localFormData.category) {
            showToast('Category is required', 'error');
            return;
        }

        // Validate numeric fields
        if (!validateNumericField(localFormData.buyPrice || 0, 'Cost Price', 0, showToast)) return;
        if (!validateNumericField(localFormData.sellPrice || 0, 'Selling Price', 0, showToast)) return;
        if (!validateNumericField(localFormData.quantity || 0, 'Stock Quantity', 0, showToast)) return;
        if (!validateNumericField(localFormData.wholesalePrice || 0, 'Wholesale Price', 0, showToast)) return;
        if (!validateNumericField(localFormData.minStockLevel || 0, 'Min Stock Level', 0, showToast)) return;

        handleSubmit(localFormData);
    };

    if (!isModalOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h2 className="font-bold text-lg text-slate-800">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={onFormSubmit} className="p-6 max-h-[75vh] overflow-y-scroll custom-scrollbar scroll-smooth">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="col-span-2 flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors relative group overflow-hidden min-h-[160px]">
                            {uploading ? (
                                <div className="flex flex-col items-center gap-2 text-emerald-600">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <span className="text-sm font-medium">Uploading image...</span>
                                </div>
                            ) : previewUrl || localFormData.photo ? (
                                <div className="relative w-full h-full flex items-center justify-center">
                                    <img
                                        src={previewUrl || localFormData.photo}
                                        alt="Product preview"
                                        className="max-h-32 object-contain rounded-lg"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                        <label className="cursor-pointer bg-white px-4 py-2 rounded-full text-slate-800 text-sm font-semibold border border-white/30 hover:bg-slate-50 transition-colors">
                                            Change Photo
                                            <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleClearPhoto}
                                            className="bg-red-500/80 hover:bg-red-600 px-4 py-2 rounded-full text-white text-sm font-semibold transition-colors"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-emerald-600 transition-colors py-4">
                                    <div className="w-12 h-12 bg-white rounded-full shadow-sm border border-slate-200 flex items-center justify-center">
                                        <Upload className="w-6 h-6" />
                                    </div>
                                    <span className="text-sm font-medium">Click to upload product photo</span>
                                    <span className="text-xs text-slate-400">JPG, PNG or WEBP (Max 2MB)</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                </label>
                            )}
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Product Name *</label>
                            <input
                                type="text"
                                required
                                maxLength={34}
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={localFormData.name || ''}
                                onChange={e => setLocalFormData({ ...localFormData, name: e.target.value })}
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
                            <select
                                required
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                value={localFormData.category || ''}
                                onChange={e => setLocalFormData({ ...localFormData, category: e.target.value })}
                            >
                                <option value="" disabled>Select a category</option>
                                {PRODUCT_CATEGORIES.map(category => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (₦) *</label>
                            <input
                                required
                                type="number"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={localFormData.buyPrice ?? ''}
                                onChange={e => setLocalFormData({ ...localFormData, buyPrice: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price (₦) *</label>
                            <input
                                required
                                type="number"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={localFormData.sellPrice ?? ''}
                                onChange={e => setLocalFormData({ ...localFormData, sellPrice: parseFloat(e.target.value) || 0 })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Stock Quantity *</label>
                            <input
                                required
                                type="number"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={localFormData.quantity ?? ''}
                                onChange={e => setLocalFormData({ ...localFormData, quantity: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Wholesale Price (₦) *</label>
                            <input
                                required
                                type="number"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={localFormData.wholesalePrice ?? ''}
                                onChange={e => setLocalFormData({ ...localFormData, wholesalePrice: parseFloat(e.target.value) || 0 })}
                            />
                        </div>


                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Min. Stock Level *</label>
                            <input
                                required
                                type="number"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={localFormData.minStockLevel ?? ''}
                                onChange={e => setLocalFormData({ ...localFormData, minStockLevel: parseInt(e.target.value) || 0 })}
                            />
                        </div>

                    </div>

                    <div className="col-span-2 pt-4 flex gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                        <button type="submit" className="flex-1 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors">Save Product</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
