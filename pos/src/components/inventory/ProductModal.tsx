import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useModalRegistration } from '../../contexts/ModalContext';
import { X, Upload, Loader2, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Product, DiscountTier } from '../../types';
import { uploadToCloudinary } from '../../services/cloudinary';
import { useActiveCategories } from '../../hooks/useActiveCategories';
import { validateInventoryField, validateNumericField } from '../../utils/validation';
import { ImageWithFallback } from '../ImageWithFallback';

interface ProductModalProps {
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    editingProduct: Product | null;
    formData: Partial<Product>;
    handleSubmit: (data: Partial<Product>) => Promise<void>;
}

export function ProductModal({
    isModalOpen,
    setIsModalOpen,
    editingProduct,
    formData: initialFormData,
    handleSubmit
}: ProductModalProps) {
    useModalRegistration(isModalOpen);
    const { showToast } = useToast();
    const { categories, loading: categoriesLoading, error: categoriesError } = useActiveCategories();
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [localFormData, setLocalFormData] = useState<Partial<Product>>(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [newTierName, setNewTierName] = useState('');
    const [newTierQty, setNewTierQty] = useState('');
    const [newTierPrice, setNewTierPrice] = useState('');

    const handleAddTier = () => {
        if (!newTierName.trim()) {
            showToast('Tier name is required (e.g. Dozen, Roll, Carton)', 'error');
            return;
        }
        const qty = parseInt(newTierQty);
        if (isNaN(qty) || qty <= 1) {
            showToast('Minimum quantity must be greater than 1', 'error');
            return;
        }
        const price = parseFloat(newTierPrice);
        if (isNaN(price) || price <= 0) {
            showToast('Price per unit must be a positive number', 'error');
            return;
        }
        if (localFormData.sellPrice && price >= localFormData.sellPrice) {
            showToast('Discount price per unit must be less than regular selling price', 'error');
            return;
        }

        const currentTiers = localFormData.onlineDiscountTiers || [];
        if (currentTiers.some(t => t.name.toLowerCase() === newTierName.toLowerCase())) {
            showToast('A tier with this name already exists', 'error');
            return;
        }
        if (currentTiers.some(t => t.minQuantity === qty)) {
            showToast('A tier with this minimum quantity already exists', 'error');
            return;
        }

        const newTier: DiscountTier = { name: newTierName.trim(), minQuantity: qty, pricePerUnit: price };
        setLocalFormData(prev => ({
            ...prev,
            onlineDiscountTiers: [...(prev.onlineDiscountTiers || []), newTier]
        }));

        setNewTierName('');
        setNewTierQty('');
        setNewTierPrice('');
    };

    const handleRemoveTier = (index: number) => {
        setLocalFormData(prev => ({
            ...prev,
            onlineDiscountTiers: (prev.onlineDiscountTiers || []).filter((_, i) => i !== index)
        }));
    };

    // Sync local state when modal opens or initial data changes
    useEffect(() => {
        if (isModalOpen) {
            let matchedCatId = initialFormData.categoryId;
            if (!matchedCatId && initialFormData.category && categories.length > 0) {
                const found = categories.find(c => c.name.toLowerCase() === initialFormData.category?.toLowerCase());
                if (found) matchedCatId = found.id;
            }
            setLocalFormData({
                ...initialFormData,
                categoryId: matchedCatId || initialFormData.categoryId
            });
            setPreviewUrl(initialFormData.photo || null);
        }
    }, [isModalOpen, initialFormData, categories]);

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

    const onFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isSubmitting) return;

        // Validate name
        if (!localFormData.name?.trim()) {
            showToast('Product name is required', 'error');
            return;
        }

        if (!validateInventoryField(localFormData.name || '', 'Product name', showToast, 34)) {
            return;
        }

        // Validate category
        if (!localFormData.categoryId && !localFormData.category) {
            showToast('Category is required. Please select a valid category.', 'error');
            return;
        }

        // If categories are loaded, verify the category is valid
        if (categories.length > 0) {
            const matchedCat = categories.find(c => c.id === localFormData.categoryId || c.name === localFormData.category);
            if (!matchedCat) {
                showToast('The selected category does not exist. Please pick an active category.', 'error');
                return;
            }
        }

        // Validate numeric fields
        if (!validateNumericField(localFormData.buyPrice || 0, 'Cost Price', 0, showToast)) return;
        if (!validateNumericField(localFormData.sellPrice || 0, 'Selling Price', 0, showToast)) return;
        if (!validateNumericField(localFormData.quantity || 0, 'Stock Quantity', 0, showToast)) return;
        if (!validateNumericField(localFormData.wholesalePrice || 0, 'Wholesale Price', 0, showToast)) return;
        if (!validateNumericField(localFormData.minStockLevel || 0, 'Min Stock Level', 0, showToast)) return;

        setIsSubmitting(true);
        try {
            await handleSubmit(localFormData);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isModalOpen) return null;

    return (
        <div role="dialog" aria-modal="true" data-modal="true" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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
                                    <ImageWithFallback
                                        src={previewUrl || localFormData.photo}
                                        alt="Product preview"
                                        className="max-h-32 object-contain rounded-lg"
                                        fallback={
                                            <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-4">
                                                <ImageIcon className="w-10 h-10 opacity-60" />
                                                <span className="text-xs">Failed to load preview</span>
                                            </div>
                                        }
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
                            {categoriesError ? (
                                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                                    ⚠️ Could not load categories from Firestore. Product creation is blocked until categories are loaded.
                                </div>
                            ) : categoriesLoading ? (
                                <div className="p-2.5 bg-slate-50 border border-slate-200 text-slate-500 text-xs rounded-lg flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                                    Loading categories...
                                </div>
                            ) : categories.length === 0 ? (
                                <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg">
                                    ⚠️ No categories found in Firestore. Please initialize categories in Settings before adding products.
                                </div>
                            ) : (
                                <select
                                    required
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                    value={localFormData.categoryId || ''}
                                    onChange={e => {
                                        const selectedId = e.target.value;
                                        const cat = categories.find(c => c.id === selectedId);
                                        setLocalFormData({
                                            ...localFormData,
                                            categoryId: selectedId,
                                            category: cat ? cat.name : ''
                                        });
                                    }}
                                >
                                    <option value="" disabled>Select a category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            )}
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

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Barcode (EAN/UPC)</label>
                            <input
                                type="text"
                                placeholder="Scan or enter barcode"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={localFormData.barcode ?? ''}
                                onChange={e => setLocalFormData({ ...localFormData, barcode: e.target.value.trim() })}
                            />
                        </div>

                        {/* Online Quantity Discounts Section */}
                        <div className="col-span-2 border-t border-slate-100 pt-4 mt-2">
                            <h3 className="text-sm font-bold text-slate-800 mb-2">Online Quantity Discounts (for E-commerce)</h3>
                            <p className="text-xs text-slate-500 mb-4">Set quantity breakpoints where online customers get a cheaper unit price (e.g. Dozen, Roll, Carton).</p>
                            
                            {/* Current Tiers List */}
                            {localFormData.onlineDiscountTiers && localFormData.onlineDiscountTiers.length > 0 ? (
                                <div className="space-y-2 mb-4">
                                    {localFormData.onlineDiscountTiers.map((tier, index) => (
                                        <div key={index} className="flex justify-between items-center p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                                            <div className="flex items-center gap-4 text-xs font-semibold text-slate-800">
                                                <span className="bg-emerald-600 text-white px-2 py-0.5 rounded uppercase text-[10px] tracking-wider">{tier.name}</span>
                                                <span>Min Quantity: <span className="font-bold text-slate-900">{tier.minQuantity}</span></span>
                                                <span>Price/Unit: <span className="font-bold text-emerald-700">₦{tier.pricePerUnit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveTier(index)}
                                                className="text-red-400 hover:text-red-600 transition-colors p-1"
                                                title="Remove Discount Tier"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400 mb-4">
                                    No online quantity discounts defined for this product yet.
                                </div>
                            )}

                            {/* Add Tier Editor Form */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tier Name (e.g., Dozen)</label>
                                    <input
                                        type="text"
                                        placeholder="Dozen"
                                        className="w-full p-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={newTierName}
                                        onChange={e => setNewTierName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Min Quantity</label>
                                    <input
                                        type="number"
                                        placeholder="12"
                                        min="2"
                                        className="w-full p-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={newTierQty}
                                        onChange={e => setNewTierQty(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Price per Unit (₦)</label>
                                        <input
                                            type="number"
                                            placeholder="200"
                                            min="0.01"
                                            step="any"
                                            className="w-full p-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                            value={newTierPrice}
                                            onChange={e => setNewTierPrice(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddTier}
                                        className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center justify-center h-9 w-9 shrink-0"
                                        title="Add Tier"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>

                    <div className="col-span-2 pt-4 flex gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting} className="flex-1 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isSubmitting || uploading} className="flex-1 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                            {isSubmitting ? 'Saving...' : 'Save Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
