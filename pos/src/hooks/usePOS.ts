import { useState } from 'react';
import { runTransaction, doc, deleteDoc } from 'firebase/firestore';
import { db, ensureSilentAuth } from '../firebase/config';
import { logAudit, normalizeFirestoreDates } from '../firebase/firestoreHelpers';
import { Sale, SaleItem, PaymentMethod, SaleStatus, Customer, Product } from '../types';
import { roundTo2 } from '../utils/math';
import { v4 as uuidv4 } from 'uuid';
import { productsRepo, customersRepo, salesRepo } from '../repositories';
import { sanitizeFirestoreData } from '../repositories/BaseRepository';
import { emitDashboardRefresh } from '../utils/dashboardRefreshSignal';
import { fetchNextInvoiceNo } from '../services/invoiceNumberService';

interface UsePOSProps {
    cart: SaleItem[];
    clearCart: () => void;
    calculateTotal: () => number;
    discount: number;
    setDiscount: (discount: number) => void;
    selectedCustomer: Customer | null;
    setSelectedCustomer: (customer: Customer | null) => void;
    currentUser: any;
    isAdmin: boolean;
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    setActiveTab: (tab: 'cart' | 'held' | 'history') => void;
    setIsPaymentModalOpen: (isOpen: boolean) => void;
    setIsMultipayOpen: (isOpen: boolean) => void;
    setMultipayEntries: (entries: { method: PaymentMethod; amount: string }[]) => void;
    setMobileView: (view: 'catalog' | 'checkout') => void;
}

export function usePOS({
    cart, clearCart, calculateTotal, discount, setDiscount,
    selectedCustomer, setSelectedCustomer, currentUser, showToast, setActiveTab,
    setIsPaymentModalOpen, setIsMultipayOpen, setMultipayEntries, setMobileView
}: UsePOSProps) {

    const [isProcessing, setIsProcessing] = useState(false);
    const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
    const [receiptCustomerDebt, setReceiptCustomerDebt] = useState<{ previousDebt: number; thisSaleDebt: number; newDebt: number; creditLimit: number } | null>(null);

    const handleHoldSale = async () => {
        if (cart.length === 0) return;
        try {
            const firebaseUser = await ensureSilentAuth();
            if (!firebaseUser) {
                showToast(
                    'POS is not connected to the server. Please check your internet connection and try again. If the problem persists, contact your administrator.',
                    'error'
                );
                return;
            }

            const total = calculateTotal();
            // Fetch an atomic, collision-free invoice number from Cloud Functions.
            // We prefix held sales with HLD- so cashiers can distinguish them from
            // completed invoices, while still using the same sequential counter.
            let tempInvoiceNo: string;
            try {
                const atomicNo = await fetchNextInvoiceNo();
                // Replace the INV- prefix with HLD- to signal it is a held sale
                tempInvoiceNo = atomicNo.replace(/^INV-/, 'HLD-');
            } catch (invoiceErr) {
                console.warn('[HoldSale] Cloud Function unavailable, falling back to local ID:', invoiceErr);
                // Fallback: timestamp-based ID (only used when the function is unreachable)
                tempInvoiceNo = `HLD-${Date.now().toString().slice(-6)}`;
            }
            const finalAmount = roundTo2(Math.max(0, total - discount));

            const saleData: any = {
                customerName: selectedCustomer?.name || 'Walk-in',
                date: new Date(),
                totalAmount: total,
                discount: discount,
                finalAmount: finalAmount,
                paymentMethod: PaymentMethod.CASH,
                status: SaleStatus.HELD,
                items: cart,
                invoiceNo: tempInvoiceNo,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted: false
            };

            if (selectedCustomer?.id) {
                saleData.customerId = selectedCustomer.id;
            } else {
                saleData.customerId = null;
            }

            const cleanedSaleData = sanitizeFirestoreData(saleData);

            await salesRepo.create(cleanedSaleData as any);
            clearCart();
            setDiscount(0);
            setSelectedCustomer(null);
            setActiveTab('held');
            showToast('Sale put on hold', 'info');
        } catch (error: any) {
            console.error('[HoldSale] Error:', error);
            showToast(error?.message || 'Failed to hold sale.', 'error');
        }
    };

    const handleResumeSale = async (sale: Sale, setCart: (items: SaleItem[]) => void) => {
        try {
            const firebaseUser = await ensureSilentAuth();
            if (!firebaseUser) {
                showToast(
                    'POS is not connected to the server. Please check your internet connection and try again. If the problem persists, contact your administrator.',
                    'error'
                );
                return;
            }

            const itemsWithCurrentStock = await Promise.all(sale.items.map(async item => {
                const product = await productsRepo.getById(item.productId);
                return {
                    ...item,
                    stockAtAddition: product?.quantity || 0
                };
            }));

            if (sale.id) {
                await deleteDoc(doc(db, 'sales', sale.id));
            }

            setCart(itemsWithCurrentStock);
            setDiscount(sale.discount || 0);
            if (sale.customerId) {
                const cust = await customersRepo.getById(sale.customerId);
                setSelectedCustomer(cust || null);
            } else {
                setSelectedCustomer(null);
            }
            setActiveTab('cart');
        } catch (error: any) {
            console.error('[ResumeSale] Error:', error);
            showToast(error?.message || 'Failed to resume sale.', 'error');
        }
    };

    const handleCheckout = async (method: PaymentMethod, multipayEntries: { method: PaymentMethod; amount: string }[] = [], amountPaid?: number) => {
        if (isProcessing) return;

        if (!navigator.onLine) {
            showToast('No internet connection: cannot complete sale. POS checkout requires an active connection to ensure stock consistency.', 'error');
            return;
        }

        setIsProcessing(true);

        if (cart.length === 0) {
            showToast('Cart is empty.', 'error');
            setIsProcessing(false);
            return;
        }

        try {
            // ── AUTH GUARD ──
            // Ensure the POS is signed into Firebase before touching Firestore.
            // If silent auth failed (wrong password, account disabled, no network)
            // we surface a clear message instead of a cryptic permissions error.
            const firebaseUser = await ensureSilentAuth();
            if (!firebaseUser) {
                showToast(
                    'POS is not connected to the server. Please check your internet connection and try again. If the problem persists, contact your administrator.',
                    'error'
                );
                setIsProcessing(false);
                return;
            }

            const totalAmount = calculateTotal();
            const finalAmount = roundTo2(Math.max(0, totalAmount - discount));
            
            let actualPaid = amountPaid !== undefined ? amountPaid : finalAmount;
            if (method === PaymentMethod.MULTIPAY) {
                actualPaid = multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0);
            } else if (method === PaymentMethod.CREDIT) {
                actualPaid = 0;
            }
            
            const debtAmount = roundTo2(Math.max(0, finalAmount - actualPaid));
            const changeDue = roundTo2(Math.max(0, actualPaid - finalAmount));
            const isCreditOrPartial = debtAmount > 0.01;

            if (isCreditOrPartial && !selectedCustomer) {
                showToast('Credit/Partial payments are only allowed for registered customers. Please select a customer.', 'error');
                setIsProcessing(false);
                return;
            }

            if (method === PaymentMethod.CREDIT && !selectedCustomer) {
                showToast('Please select a registered customer to record a debt sale.', 'error');
                setIsProcessing(false);
                return;
            }

            const saleId = uuidv4();
            const now = new Date();
            const nowIso = now.toISOString();

            // ── Fetch atomic invoice number BEFORE the transaction ──────────────
            // The Cloud Function runs its own Firestore transaction on
            // settings/invoiceCounter (Admin SDK, bypasses rules), so this number
            // is guaranteed unique even under concurrent checkouts.
            let formattedInvoiceNo: string;
            try {
                formattedInvoiceNo = await fetchNextInvoiceNo();
            } catch (invoiceErr) {
                console.error('[Checkout] Failed to fetch invoice number from Cloud Function:', invoiceErr);
                throw new Error('Could not generate an invoice number. Please try again.');
            }

            // Firestore runTransaction guarantees atomic stock checks and customer debt updates across tills.
            // RULE: ALL READS MUST OCCUR BEFORE ANY WRITES inside Firestore runTransaction!
            const result = await runTransaction(db, async (tx) => {
                // ── READ PHASE ──
                // 1. Read all product docs
                const productSnaps = await Promise.all(
                    cart.map(item => tx.get(doc(db, 'products', item.productId)))
                );

                // 2. Read Customer doc (if applicable)
                let customerSnap = null;
                const customerRef = selectedCustomer?.id ? doc(db, 'customers', selectedCustomer.id) : null;
                if (customerRef) {
                    customerSnap = await tx.get(customerRef);
                }

                // ── VALIDATION PHASE ──
                const finalItems: SaleItem[] = [];
                for (let i = 0; i < cart.length; i++) {
                    const item = cart[i];
                    const snap = productSnaps[i];
                    if (!snap.exists()) {
                        throw new Error(`Product "${item.productName}" not found.`);
                    }
                    const productData = normalizeFirestoreDates<Product>(snap.data());
                    if (productData.quantity < item.quantity) {
                        throw new Error(`Insufficient stock for "${item.productName}". Available: ${productData.quantity}`);
                    }
                    finalItems.push({
                        ...item,
                        costPrice: productData.buyPrice || item.price
                    });
                }

                // Calculate debt info
                let debtInfo: { previousDebt: number; thisSaleDebt: number; newDebt: number; creditLimit: number } | null = null;
                let newCustomerDebt = 0;
                let customerObj: Customer | null = null;

                if (customerSnap && customerSnap.exists()) {
                    customerObj = normalizeFirestoreDates<Customer>(customerSnap.data());
                    const previousDebt = customerObj.currentDebt || 0;
                    const thisSaleDebt = debtAmount;
                    newCustomerDebt = roundTo2(previousDebt + thisSaleDebt);

                    debtInfo = {
                        previousDebt,
                        thisSaleDebt,
                        newDebt: newCustomerDebt,
                        creditLimit: customerObj.creditLimit || 0
                    };
                }

                // ── WRITE PHASE ──
                // 1. Update product stock
                for (let i = 0; i < cart.length; i++) {
                    const item = cart[i];
                    const snap = productSnaps[i];
                    const productData = snap.data() as Product;
                    const pRef = doc(db, 'products', item.productId);
                    tx.update(pRef, {
                        quantity: productData.quantity - item.quantity,
                        stockValue: (productData.quantity - item.quantity) * (productData.buyPrice || 0),
                        updated_at: nowIso
                    });
                }

                // Note: invoice counter is now managed by the Cloud Function.
                // No client-side write to settings/invoiceCounter is needed here.

                // 2. Update customer debt if applicable
                if (customerRef && customerObj && debtAmount > 0) {
                    tx.update(customerRef, {
                        currentDebt: newCustomerDebt,
                        updated_at: nowIso
                    });
                }

                // 4. Create Sale document
                const saleData: any = {
                    id: saleId,
                    customerName: selectedCustomer?.name || 'Walk-in',
                    date: now,
                    totalAmount,
                    discount,
                    finalAmount,
                    amountPaid: actualPaid,
                    changeDue,
                    paymentMethod: (debtAmount > 0 && actualPaid > 0) ? PaymentMethod.MULTIPAY : method,
                    status: SaleStatus.COMPLETED,
                    items: finalItems,
                    invoiceNo: formattedInvoiceNo,
                    cashier: currentUser?.username || 'Unknown',
                    created_at: nowIso,
                    updated_at: nowIso,
                    deleted: false
                };
                if (selectedCustomer?.id) {
                    saleData.customerId = selectedCustomer.id;
                } else {
                    saleData.customerId = null;
                }

                if (debtAmount > 0) {
                    const methods = [];
                    if (actualPaid > 0) {
                        if (method === PaymentMethod.MULTIPAY) {
                            methods.push(...multipayEntries.map(e => ({ method: e.method, amount: roundTo2(parseFloat(e.amount)) })));
                        } else if (method !== PaymentMethod.CREDIT) {
                            methods.push({ method, amount: actualPaid });
                        }
                    }
                    methods.push({ method: PaymentMethod.CREDIT, amount: debtAmount });
                    saleData.paymentMethods = methods;
                    if (actualPaid > 0) saleData.paymentMethod = PaymentMethod.MULTIPAY;
                } else if (method === PaymentMethod.MULTIPAY) {
                    saleData.paymentMethods = multipayEntries.map(e => ({ method: e.method, amount: roundTo2(parseFloat(e.amount)) }));
                }

                if (Array.isArray(saleData.paymentMethods)) {
                    let mCash = 0;
                    let mBank = 0;
                    saleData.paymentMethods.forEach((m: any) => {
                        if (m.method === PaymentMethod.CASH) mCash += Number(m.amount || 0);
                        if (m.method === PaymentMethod.CARD || m.method === PaymentMethod.TRANSFER) mBank += Number(m.amount || 0);
                    });
                    saleData.multipayCash = roundTo2(mCash);
                    saleData.multipayBank = roundTo2(mBank);
                } else {
                    saleData.multipayCash = 0;
                    saleData.multipayBank = 0;
                }

                if (debtInfo) saleData.debtInfo = debtInfo;

                const saleDocRef = doc(db, 'sales', saleId);
                tx.set(saleDocRef, sanitizeFirestoreData(saleData));

                return {
                    saleId,
                    generatedInvoiceNo: formattedInvoiceNo,
                    debtInfo,
                    saleData
                };
            });

            emitDashboardRefresh();

            setReceiptCustomerDebt(result.debtInfo);

            const finalSale: Sale = {
                ...result.saleData,
                id: result.saleId,
            } as Sale;

            setReceiptSale(finalSale);

            logAudit(
                'SALE_COMPLETED',
                `Sale #${result.generatedInvoiceNo} — ₦${finalAmount.toLocaleString()} via ${debtAmount > 0 ? 'PARTIAL' : method}${debtAmount > 0 ? ` (Debt: ₦${debtAmount.toLocaleString()})` : ''}`,
                currentUser?.username || 'Unknown'
            ).catch(console.error);

            // Sync credit info to ecommerce app if debt sale
            if (selectedCustomer?.id && debtAmount > 0) {
                customersRepo.getById(selectedCustomer.id).then(async (freshCustomer) => {
                    if (freshCustomer) {
                        try {
                            const { syncCreditInfoToShopUser } = await import('../utils/creditInfoSync');
                            syncCreditInfoToShopUser(freshCustomer);
                        } catch (syncErr) {
                            console.error('[POS-Sync] Failed to sync credit info to shopUsers:', syncErr);
                        }
                    }
                }).catch(err => console.error('[POS-Sync] Failed to fetch customer for sync:', err));
            }

            showToast(`✓ Sale complete — ₦${finalAmount.toLocaleString()}`, 'success');

            clearCart();
            setDiscount(0);
            setIsPaymentModalOpen(false);
            setSelectedCustomer(null);
            setIsMultipayOpen(false);
            setMultipayEntries([]);
            setMobileView('catalog');

        } catch (error: any) {
            console.error('[Checkout] Transaction Error:', error);
            showToast(`Transaction failed: ${error?.message || 'Unknown error'}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return {
        handleHoldSale,
        handleResumeSale,
        handleCheckout,
        isProcessing,
        receiptSale,
        setReceiptSale,
        receiptCustomerDebt,
        setReceiptCustomerDebt
    };
}
