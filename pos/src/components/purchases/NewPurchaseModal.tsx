import React, { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { db } from '../../db/db';
import { Purchase, PurchaseItem, Supplier, Product } from '../../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Save, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { validateNumericField } from '../../utils/validation';

interface NewPurchaseModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NewPurchaseModal({ isOpen, onClose }: NewPurchaseModalProps) {
    const { showToast } = useToast();
    const [invoiceNo, setInvoiceNo] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [cartPoints, setCartPoints] = useState<PurchaseItem[]>([]);
    const [paidAmount, setPaidAmount] = useState<number>(0);

    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [itemQuantity, setItemQuantity] = useState<number>(1);
    const [itemCost, setItemCost] = useState<number>(0);
    const [itemPrice, setItemPrice] = useState<number>(0);
    const [productSearch, setProductSearch] = useState('');

    const suppliers = useLiveQuery(() => db.suppliers.toArray(), [isOpen]) || [];
    const products = useLiveQuery(async () => {
        if (!isOpen || !productSearch) return [];
        return db.products.where('name').startsWithIgnoreCase(productSearch).limit(10).toArray();
    }, [productSearch, isOpen]);

    // Auto-generate invoice number when modal opens
    React.useEffect(() => {
        if (isOpen && !invoiceNo) {
            const now = new Date();
            const timestamp = format(now, 'yyyyMMdd-HHmmss');
            setInvoiceNo(`PUR-${timestamp}`);
        }
    }, [isOpen, invoiceNo]);

    const handleAddItem = () => {
        if (!selectedProduct) return;

        if (!validateNumericField(itemQuantity, 'Quantity', 1, showToast)) return;
        if (!validateNumericField(itemCost, 'Cost Price', 0, showToast)) return;
        if (!validateNumericField(itemPrice, 'Selling Price', 0, showToast)) return;

        const newItem: PurchaseItem = {
            productId: selectedProduct.id!,
            productName: selectedProduct.name,
            quantity: itemQuantity,
            costPrice: itemCost,
            sellingPrice: itemPrice,
            total: itemQuantity * itemCost
        };

        setCartPoints([...cartPoints, newItem]);
        setSelectedProduct(null);
        setProductSearch('');
        setItemQuantity(1);
        setItemCost(0);
        setItemPrice(0);
    };

    const calculateTotal = () => cartPoints.reduce((sum, item) => sum + item.total, 0);

    const handleSubmit = async () => {
        if (!selectedSupplier || cartPoints.length === 0) {
            showToast('Please select a supplier and add items.', 'error');
            return;
        }

        try {
            const totalAmount = calculateTotal();
            const balance = totalAmount - paidAmount;

            await db.transaction('rw', [db.purchases, db.products, db.suppliers, db.settings], async () => {

                await db.purchases.add({
                    invoiceNo,
                    supplierId: selectedSupplier.id!,
                    supplierName: selectedSupplier.companyName,
                    date: new Date(purchaseDate),
                    items: cartPoints,
                    totalAmount,
                    paidAmount,
                    balance,
                    status: balance <= 0 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'PENDING'),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                } as Purchase);

                for (const item of cartPoints) {
                    const product = await db.products.get(item.productId);
                    if (product) {
                        await db.products.update(item.productId, {
                            quantity: product.quantity + item.quantity,
                            buyPrice: item.costPrice,
                            sellPrice: item.sellingPrice,
                            updated_at: new Date().toISOString()
                        });
                    }
                }

                if (balance > 0) {
                    const supplier = await db.suppliers.get(selectedSupplier.id!);
                    if (supplier) {
                        await db.suppliers.update(supplier.id!, {
                            balance: (supplier.balance || 0) + balance,
                            updated_at: new Date().toISOString()
                        });
                    }
                }
            });

            onClose();
        } catch (error) {
            console.error('Failed to save purchase:', error);
            showToast('Failed to save purchase order.', 'error');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-emerald-600" /> New Purchase Order
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold p-1 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
                            <select
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                onChange={(e) => {
                                    const sup = suppliers.find(s => s.id === e.target.value);
                                    setSelectedSupplier(sup || null);
                                }}
                                value={selectedSupplier?.id || ''}
                            >
                                <option value="">Select Supplier</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Number</label>
                            <input
                                className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 cursor-not-allowed outline-none"
                                value={invoiceNo}
                                readOnly
                                tabIndex={-1}
                                placeholder="Auto-generated"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Auto-generated by system.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                            <input
                                type="date"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={purchaseDate}
                                onChange={e => setPurchaseDate(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Add Item Section */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                        <h3 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">Add Products</h3>
                        <div className="flex flex-col md:flex-row gap-3 items-end">
                            <div className="flex-1 relative w-full">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Search Product</label>
                                <input
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    placeholder="Type product name..."
                                    value={selectedProduct ? selectedProduct.name : productSearch}
                                    onChange={e => {
                                        setProductSearch(e.target.value);
                                        if (selectedProduct) setSelectedProduct(null);
                                    }}
                                />
                                {/* Autocomplete Dropdown */}
                                {productSearch && !selectedProduct && products && products.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 shadow-lg rounded-lg mt-1 z-20 max-h-48 overflow-y-auto">
                                        {products.map(p => (
                                            <div
                                                key={p.id}
                                                className="p-2 hover:bg-slate-50 cursor-pointer text-sm"
                                                onClick={() => {
                                                    setSelectedProduct(p);
                                                    setItemCost(p.buyPrice);
                                                    setItemPrice(p.sellPrice);
                                                    setProductSearch('');
                                                }}
                                            >
                                                <div className="font-bold text-slate-800">{p.name}</div>
                                                <div className="text-xs text-slate-500">Stock: {p.quantity} | Cost: ₦{p.buyPrice}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="w-24">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Qty</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    min="1"
                                    value={itemQuantity}
                                    onChange={e => setItemQuantity(parseInt(e.target.value) || 0)}
                                />
                            </div>
                            <div className="w-32">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Unit Cost</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={itemCost}
                                    onChange={e => setItemCost(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                            <div className="w-32">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Selling Price</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-emerald-50 border-emerald-200"
                                    value={itemPrice}
                                    onChange={e => setItemPrice(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                            <button
                                onClick={handleAddItem}
                                disabled={!selectedProduct}
                                className="bg-slate-800 hover:bg-slate-900 text-white p-2.5 rounded-lg disabled:opacity-50 transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="border rounded-lg overflow-hidden mb-6">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                                <tr>
                                    <th className="p-3">Product</th>
                                    <th className="p-3 text-right">Qty</th>
                                    <th className="p-3 text-right">Cost</th>
                                    <th className="p-3 text-right">Total</th>
                                    <th className="p-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {cartPoints.map((item, index) => (
                                    <tr key={index}>
                                        <td className="p-3 font-medium text-slate-800">{item.productName}</td>
                                        <td className="p-3 text-right">{item.quantity}</td>
                                        <td className="p-3 text-right">₦{item.costPrice.toLocaleString()}</td>
                                        <td className="p-3 text-right font-bold">₦{item.total.toLocaleString()}</td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => setCartPoints(cartPoints.filter((_, i) => i !== index))}
                                                className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {cartPoints.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-400 italic">No items added yet</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold text-slate-800">
                                <tr>
                                    <td colSpan={3} className="p-3 text-right uppercase tracking-wide text-xs text-slate-500">Total Amount</td>
                                    <td className="p-3 text-right text-lg">₦{calculateTotal().toLocaleString()}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Payment Info */}
                    <div className="flex justify-end gap-3 items-center">
                        <label className="font-bold text-slate-700">Amount Paid:</label>
                        <input
                            type="number"
                            className="w-40 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-right font-bold"
                            value={paidAmount}
                            onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between shrink-0">
                    <div className="text-sm">
                        <span className="text-slate-500">Balance due to Supplier:</span>
                        <span className="font-bold text-red-600 ml-2">₦{Math.max(0, calculateTotal() - paidAmount).toLocaleString()}</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                        <button onClick={handleSubmit} className="px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
                            <Save className="w-4 h-4" /> Save Purchase
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
