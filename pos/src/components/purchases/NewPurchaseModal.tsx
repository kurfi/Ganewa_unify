import React, { useState, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useCollection, normalizeFirestoreDates } from '../../firebase/firestoreHelpers';
import { db } from '../../firebase/config';
import { runTransaction, doc } from 'firebase/firestore';
import { Purchase, PurchaseItem, Supplier, Product, PaymentMethod } from '../../types';
import { Plus, X, Save, Trash2, Banknote, ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';
import { validateNumericField } from '../../utils/validation';
import { v4 as uuidv4 } from 'uuid';
import { emitDashboardRefresh } from '../../utils/dashboardRefreshSignal';
import { computeBalances } from '../../utils/computeBalances';
import { roundTo2 } from '../../utils/math';

type PaymentMode = 'CASH' | 'TRANSFER' | 'MIX';

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
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Payment state ---
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
    // Single-method fields
    const [paidAmount, setPaidAmount] = useState<number>(0);
    // Mix-method fields
    const [cashAmount, setCashAmount] = useState<number>(0);
    const [transferAmount, setTransferAmount] = useState<number>(0);

    // --- Add product state ---
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [itemQuantity, setItemQuantity] = useState<number>(1);
    const [itemCost, setItemCost] = useState<number>(0);
    const [itemPrice, setItemPrice] = useState<number>(0);
    const [productSearch, setProductSearch] = useState('');

    const { data: rawSuppliers } = useCollection<Supplier>('suppliers');
    const { data: rawProducts } = useCollection<Product>('products');

    const suppliers = useMemo(() => rawSuppliers.filter(s => !s.deleted), [rawSuppliers]);

    const matchingProducts = useMemo(() => {
        if (!productSearch) return [];
        const term = productSearch.toLowerCase();
        return rawProducts
            .filter(p => !p.deleted && (p.name || '').toLowerCase().includes(term))
            .slice(0, 10);
    }, [rawProducts, productSearch]);

    // Auto-generate invoice number and prefetch balances when modal opens
    const [cachedBalances, setCachedBalances] = useState<{ cashAtHand: number; moneyInBank: number } | null>(null);

    React.useEffect(() => {
        if (isOpen) {
            if (!invoiceNo) {
                const now = new Date();
                const timestamp = format(now, 'yyyyMMdd-HHmmss');
                setInvoiceNo(`PUR-${timestamp}`);
            }
            // Pre-fetch balances in background so liquidity check is instantaneous upon save
            computeBalances().then(setCachedBalances).catch(() => {});
        }
    }, [isOpen, invoiceNo]);

    // Reset all state when modal closes
    const handleClose = () => {
        setInvoiceNo('');
        setSelectedSupplier(null);
        setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
        setCartPoints([]);
        setPaymentMode('CASH');
        setPaidAmount(0);
        setCashAmount(0);
        setTransferAmount(0);
        setSelectedProduct(null);
        setItemQuantity(1);
        setItemCost(0);
        setItemPrice(0);
        setProductSearch('');
        onClose();
    };

    const calculateTotal = () => cartPoints.reduce((sum, item) => sum + item.total, 0);

    // How much is actually being paid (resolved from payment mode)
    const resolvedPaidAmount = paymentMode === 'MIX'
        ? roundTo2(cashAmount + transferAmount)
        : paidAmount;

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

    const handleSubmit = async () => {
        if (isSubmitting) return;

        if (!selectedSupplier || cartPoints.length === 0) {
            showToast('Please select a supplier and add items.', 'error');
            return;
        }

        const totalAmount = calculateTotal();
        const paid = resolvedPaidAmount;

        // Validate mix amounts
        if (paymentMode === 'MIX') {
            if (cashAmount < 0 || transferAmount < 0) {
                showToast('Cash and Transfer amounts cannot be negative.', 'error');
                return;
            }
            if (cashAmount === 0 && transferAmount === 0) {
                showToast('Please enter cash and/or transfer amounts for mix payment.', 'error');
                return;
            }
        }

        if (paid < 0) {
            showToast('Paid amount cannot be negative.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            // --- Liquidity check (uses pre-fetched balance if available for 0ms delay) ---
            if (paid > 0) {
                try {
                    const balances = cachedBalances || await computeBalances();
                    if (balances) {
                        if (paymentMode === 'CASH') {
                            if (paid > balances.cashAtHand) {
                                const shortfall = roundTo2(paid - balances.cashAtHand);
                                showToast(
                                    `Insufficient cash at hand. Available: ₦${balances.cashAtHand.toLocaleString(undefined, { minimumFractionDigits: 2 })} — Shortfall: ₦${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                                    'error'
                                );
                                setIsSubmitting(false);
                                return;
                            }
                        } else if (paymentMode === 'TRANSFER') {
                            if (paid > balances.moneyInBank) {
                                const shortfall = roundTo2(paid - balances.moneyInBank);
                                showToast(
                                    `Insufficient bank balance. Available: ₦${balances.moneyInBank.toLocaleString(undefined, { minimumFractionDigits: 2 })} — Shortfall: ₦${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                                    'error'
                                );
                                setIsSubmitting(false);
                                return;
                            }
                        } else if (paymentMode === 'MIX') {
                            if (cashAmount > balances.cashAtHand) {
                                const shortfall = roundTo2(cashAmount - balances.cashAtHand);
                                showToast(
                                    `Insufficient cash at hand for cash portion. Available: ₦${balances.cashAtHand.toLocaleString(undefined, { minimumFractionDigits: 2 })} — Shortfall: ₦${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                                    'error'
                                );
                                setIsSubmitting(false);
                                return;
                            }
                            if (transferAmount > balances.moneyInBank) {
                                const shortfall = roundTo2(transferAmount - balances.moneyInBank);
                                showToast(
                                    `Insufficient bank balance for transfer portion. Available: ₦${balances.moneyInBank.toLocaleString(undefined, { minimumFractionDigits: 2 })} — Shortfall: ₦${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                                    'error'
                                );
                                setIsSubmitting(false);
                                return;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('[NewPurchaseModal] Balance check failed, proceeding without check:', err);
                }
            }
            const balance = roundTo2(totalAmount - paid);
            const nowIso = new Date().toISOString();
            const now = new Date(purchaseDate);
            const purchaseId = uuidv4();

            await runTransaction(db, async (tx) => {
                // ── READ PHASE ──
                const productSnaps = await Promise.all(
                    cartPoints.map(item => tx.get(doc(db, 'products', item.productId)))
                );

                const supplierRef = doc(db, 'suppliers', selectedSupplier.id!);
                const supplierSnap = await tx.get(supplierRef);

                // ── WRITE PHASE ──

                // 1. Create Purchase doc
                const purchaseRef = doc(db, 'purchases', purchaseId);
                const purchaseData: Omit<Purchase, 'id'> = {
                    invoiceNo,
                    supplierId: selectedSupplier.id!,
                    supplierName: selectedSupplier.companyName,
                    supplierNameLower: (selectedSupplier.companyName || '').toLowerCase(),
                    invoiceNoLower: (invoiceNo || '').toLowerCase(),
                    date: now,
                    items: cartPoints,
                    totalAmount,
                    paidAmount: paid,
                    balance: Math.max(0, balance),
                    status: balance <= 0 ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'PENDING'),
                    created_at: nowIso,
                    updated_at: nowIso,
                    deleted: false
                };
                tx.set(purchaseRef, purchaseData);

                // 2. Update Products (restock)
                for (let i = 0; i < cartPoints.length; i++) {
                    const item = cartPoints[i];
                    const snap = productSnaps[i];
                    if (snap.exists()) {
                        const pData = normalizeFirestoreDates<Product>(snap.data());
                        const pRef = doc(db, 'products', item.productId);
                        const auditLogId = `audit_purchase_${purchaseId}_${item.productId}`;
                        tx.update(pRef, {
                            quantity: (pData.quantity || 0) + item.quantity,
                            sellPrice: item.sellingPrice,
                            stockValue: ((pData.quantity || 0) + item.quantity) * item.costPrice,
                            auditLogId,
                            updated_at: nowIso
                        });

                        // Write financial/cost fields to privateData/financials
                        const finRef = doc(db, 'products', item.productId, 'privateData', 'financials');
                        tx.set(finRef, {
                            buyPrice: item.costPrice,
                            costPrice: item.costPrice,
                            supplierId: selectedSupplier.id!,
                            supplierName: selectedSupplier.companyName,
                            updated_at: nowIso
                        }, { merge: true });

                        // Log purchase intake audit record
                        const auditRef = doc(db, 'auditLogs', auditLogId);
                        tx.set(auditRef, {
                            id: auditLogId,
                            action: 'PURCHASE_INTAKE',
                            details: `Stock intake: ${item.quantity} units of ${item.productName} at ₦${item.costPrice}`,
                            date: nowIso,
                            created_at: nowIso
                        });
                    }
                }

                // 3. Record supplierPayment(s) so cash/bank is properly debited
                if (paid > 0) {
                    if (paymentMode === 'CASH') {
                        const spId = uuidv4();
                        tx.set(doc(db, 'supplierPayments', spId), {
                            id: spId,
                            supplierId: selectedSupplier.id!,
                            supplierName: selectedSupplier.companyName,
                            purchaseId,
                            date: now,
                            amount: paid,
                            paymentMethod: PaymentMethod.CASH,
                            note: `Payment on purchase ${invoiceNo}`,
                            created_at: nowIso,
                            updated_at: nowIso,
                            deleted: false
                        });
                    } else if (paymentMode === 'TRANSFER') {
                        const spId = uuidv4();
                        tx.set(doc(db, 'supplierPayments', spId), {
                            id: spId,
                            supplierId: selectedSupplier.id!,
                            supplierName: selectedSupplier.companyName,
                            purchaseId,
                            date: now,
                            amount: paid,
                            paymentMethod: PaymentMethod.TRANSFER,
                            note: `Payment on purchase ${invoiceNo}`,
                            created_at: nowIso,
                            updated_at: nowIso,
                            deleted: false
                        });
                    } else if (paymentMode === 'MIX') {
                        // Two separate payment records — one per method
                        if (cashAmount > 0) {
                            const spCashId = uuidv4();
                            tx.set(doc(db, 'supplierPayments', spCashId), {
                                id: spCashId,
                                supplierId: selectedSupplier.id!,
                                supplierName: selectedSupplier.companyName,
                                purchaseId,
                                date: now,
                                amount: cashAmount,
                                paymentMethod: PaymentMethod.CASH,
                                note: `Cash portion of mix payment on purchase ${invoiceNo}`,
                                created_at: nowIso,
                                updated_at: nowIso,
                                deleted: false
                            });
                        }
                        if (transferAmount > 0) {
                            const spTransferId = uuidv4();
                            tx.set(doc(db, 'supplierPayments', spTransferId), {
                                id: spTransferId,
                                supplierId: selectedSupplier.id!,
                                supplierName: selectedSupplier.companyName,
                                purchaseId,
                                date: now,
                                amount: transferAmount,
                                paymentMethod: PaymentMethod.TRANSFER,
                                note: `Transfer portion of mix payment on purchase ${invoiceNo}`,
                                created_at: nowIso,
                                updated_at: nowIso,
                                deleted: false
                            });
                        }
                    }
                }

                // 4. Update Supplier balance
                // balance > 0  → store owes supplier more → ADD to supplier.balance
                // balance <= 0 → fully paid or overpaid  → SUBTRACT any excess from supplier.balance
                if (supplierSnap.exists()) {
                    const supData = normalizeFirestoreDates<Supplier>(supplierSnap.data());
                    const currentSupplierBalance = supData.balance || 0;
                    let newSupplierBalance: number;

                    if (balance > 0) {
                        // Partial / PENDING: add unpaid amount as new debt
                        newSupplierBalance = roundTo2(currentSupplierBalance + balance);
                    } else {
                        // Fully paid or overpaid: reduce existing debt by any excess (|balance|)
                        newSupplierBalance = roundTo2(Math.max(0, currentSupplierBalance + balance));
                    }

                    tx.update(supplierRef, {
                        balance: newSupplierBalance,
                        updated_at: nowIso
                    });
                }
            });

            emitDashboardRefresh();
            showToast('Purchase order saved successfully.', 'success');
            handleClose();
        } catch (error) {
            console.error('Failed to save purchase:', error);
            showToast('Failed to save purchase order.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const total = calculateTotal();
    const paid = resolvedPaidAmount;
    const balanceDue = Math.max(0, total - paid);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-emerald-600" /> New Purchase Order
                    </h2>
                    <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 font-bold p-1 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
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
                                {productSearch && !selectedProduct && matchingProducts.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 shadow-lg rounded-lg mt-1 z-20 max-h-48 overflow-y-auto">
                                        {matchingProducts.map(p => (
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
                                    <td className="p-3 text-right text-lg">₦{total.toLocaleString()}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Payment Section */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Payment</h3>

                        {/* Payment Mode Tabs */}
                        <div className="flex gap-2">
                            {(['CASH', 'TRANSFER', 'MIX'] as PaymentMode[]).map(mode => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => {
                                        setPaymentMode(mode);
                                        // Reset amounts on mode switch
                                        setPaidAmount(0);
                                        setCashAmount(0);
                                        setTransferAmount(0);
                                    }}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                                        paymentMode === mode
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                                    }`}
                                >
                                    {mode === 'CASH' && <Banknote className="w-4 h-4" />}
                                    {mode === 'TRANSFER' && <Banknote className="w-4 h-4" />}
                                    {mode === 'MIX' && <ArrowLeftRight className="w-4 h-4" />}
                                    {mode === 'MIX' ? 'Cash + Transfer' : mode.charAt(0) + mode.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>

                        {/* Payment Input(s) */}
                        {(paymentMode === 'CASH' || paymentMode === 'TRANSFER') && (
                            <div className="flex items-center gap-3">
                                <label className="font-bold text-slate-700 text-sm whitespace-nowrap">
                                    Amount Paid ({paymentMode === 'CASH' ? 'Cash' : 'Transfer'}):
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-44 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-right font-bold"
                                    value={paidAmount}
                                    onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                        )}

                        {paymentMode === 'MIX' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                        <Banknote className="w-4 h-4 text-emerald-600" /> Cash Amount
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-right font-bold"
                                        value={cashAmount}
                                        onChange={e => setCashAmount(parseFloat(e.target.value) || 0)}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                        <ArrowLeftRight className="w-4 h-4 text-blue-500" /> Transfer Amount
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-right font-bold"
                                        value={transferAmount}
                                        onChange={e => setTransferAmount(parseFloat(e.target.value) || 0)}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="sm:col-span-2 bg-white border border-slate-200 rounded-lg px-3 py-2 flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Total Payment:</span>
                                    <span className="font-bold text-slate-800">₦{resolvedPaidAmount.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="text-sm space-y-0.5">
                        <div>
                            <span className="text-slate-500">Amount Paid:</span>
                            <span className="font-bold text-emerald-600 ml-2">₦{paid.toLocaleString()}</span>
                        </div>
                        <div>
                            <span className="text-slate-500">Balance due to Supplier:</span>
                            <span className={`font-bold ml-2 ${balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                ₦{balanceDue.toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleClose} disabled={isSubmitting} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50">Cancel</button>
                        <button onClick={handleSubmit} disabled={isSubmitting} className="px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50">
                            <Save className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save Purchase'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
