import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { logAudit, normalizeFirestoreDates } from '../firebase/firestoreHelpers';
import { runTransaction, doc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { Sale, SaleItem, PaymentMethod, ReturnReason, Return, Customer, Product } from '../types';
import { roundTo2 } from '../utils/math';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../auth/AuthContext';
import { generateAndSavePdfFromHtml, saveElementAsImage } from '../services/pdfService';
import { format } from 'date-fns';
import { customersRepo } from '../repositories';
import { v4 as uuidv4 } from 'uuid';
import { emitDashboardRefresh } from '../utils/dashboardRefreshSignal';

/**
 * Detects whether a sale was purchased on credit (full or partial).
 */
export function isSaleBoughtOnCredit(sale?: Sale | null): boolean {
    if (!sale) return false;
    if (sale.paymentMethod === PaymentMethod.CREDIT) return true;
    if (Array.isArray(sale.paymentMethods) && sale.paymentMethods.some(m => m.method === PaymentMethod.CREDIT && Number(m.amount) > 0)) return true;
    if (sale.debtInfo && Number(sale.debtInfo.thisSaleDebt) > 0) return true;
    if (sale.customerId && sale.amountPaid !== undefined && sale.finalAmount > sale.amountPaid) return true;
    return false;
}

export function useReturns() {
    const [step, setStep] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [originalSale, setOriginalSale] = useState<Sale | undefined>(undefined);
    const [returnableItems, setReturnableItems] = useState<(SaleItem & { returnedQuantity: number; restockStatus: 'restocked' | 'damaged'; reason: ReturnReason | string })[]>([]);
    const [totalRefundAmount, setTotalRefundAmount] = useState(0);
    const [returnReason, setReturnReason] = useState<ReturnReason | string>(ReturnReason.OTHER);
    const [refundMethod, setRefundMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [returnId, setReturnId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const receiptRef = useRef<HTMLDivElement>(null);
    const { currentUser } = useAuth();
    const { showToast } = useToast();

    useEffect(() => {
        if (originalSale?.customerId) {
            customersRepo.getById(originalSale.customerId).then(c => setCustomer(c || null));
        } else {
            setCustomer(null);
        }
    }, [originalSale?.customerId]);

    const [searchResults, setSearchResults] = useState<Sale[]>([]);

    const handleSearchSale = async () => {
        if (!searchQuery) {
            showToast('Please enter a Sale ID, Customer Name, or Invoice Number', 'info');
            return;
        }
        setSearchResults([]);
        try {
            // 1. Search by ID
            const saleDocRef = doc(db, 'sales', searchQuery);
            const saleSnap = await getDoc(saleDocRef);
            if (saleSnap.exists()) {
                const sale = normalizeFirestoreDates<Sale>({ ...saleSnap.data(), id: saleSnap.id });
                if (!sale.deleted) {
                    handleSelectSale(sale);
                    return;
                }
            }

            // 2. Search by Invoice Number
            const invoiceQuery = query(
                collection(db, 'sales'),
                where('invoiceNo', '==', searchQuery),
                where('deleted', '==', false)
            );
            const invoiceSnap = await getDocs(invoiceQuery);
            if (!invoiceSnap.empty) {
                const sales = invoiceSnap.docs.map(d => normalizeFirestoreDates<Sale>({ ...d.data(), id: d.id }));
                if (sales.length === 1) {
                    handleSelectSale(sales[0]);
                } else {
                    const sorted = [...sales].sort((a, b) => {
                        const timeA = a.date ? new Date(a.date).getTime() : 0;
                        const timeB = b.date ? new Date(b.date).getTime() : 0;
                        return timeB - timeA;
                    });
                    setSearchResults(sorted);
                    showToast(`Found ${sales.length} sales with invoice "${searchQuery}". Please select one.`, 'info');
                }
                return;
            }

            // 3. Search by Customer Name
            const customerQuery = query(
                collection(db, 'sales'),
                where('customerName', '==', searchQuery),
                where('deleted', '==', false)
            );
            const customerSnap = await getDocs(customerQuery);
            let salesByCustomer = customerSnap.docs.map(d => normalizeFirestoreDates<Sale>({ ...d.data(), id: d.id }));

            // 4. If no exact match, try case-sensitive prefix range query (avoids full collection scan)
            if (salesByCustomer.length === 0) {
                const prefixEnd = searchQuery.slice(0, -1) + String.fromCharCode(searchQuery.charCodeAt(searchQuery.length - 1) + 1);
                const prefixQuery = query(
                    collection(db, 'sales'),
                    where('customerName', '>=', searchQuery),
                    where('customerName', '<', prefixEnd),
                    where('deleted', '==', false)
                );
                const prefixSnap = await getDocs(prefixQuery);
                salesByCustomer = prefixSnap.docs
                    .map(d => normalizeFirestoreDates<Sale>({ ...d.data(), id: d.id }));
            }

            if (salesByCustomer.length > 0) {
                if (salesByCustomer.length === 1) {
                    handleSelectSale(salesByCustomer[0]);
                } else {
                    const sorted = [...salesByCustomer].sort((a, b) => {
                        const timeA = a.date ? new Date(a.date).getTime() : 0;
                        const timeB = b.date ? new Date(b.date).getTime() : 0;
                        return timeB - timeA;
                    });
                    setSearchResults(sorted);
                    showToast(`Found ${salesByCustomer.length} sales for "${searchQuery}". Please select one.`, 'info');
                }
            } else {
                setOriginalSale(undefined);
                setReturnableItems([]);
                setStep(1);
                showToast('Sale not found', 'error');
            }
        } catch (error) {
            console.error('Error fetching sale:', error);
            showToast('Error searching for sale', 'error');
        }
    };

    const handleSelectSale = (sale: Sale) => {
        setOriginalSale(sale);
        setReturnableItems(
            sale.items.map((item) => ({
                ...item,
                returnedQuantity: 0,
                restockStatus: 'damaged',
                reason: ReturnReason.OTHER,
            }))
        );
        setTotalRefundAmount(0);
        // Automatically default refund method to STORE_CREDIT if purchased on credit
        if (isSaleBoughtOnCredit(sale)) {
            setRefundMethod(PaymentMethod.STORE_CREDIT);
        } else {
            setRefundMethod(PaymentMethod.CASH);
        }
        setStep(2);
        setSearchResults([]);
        showToast(`Sale #${sale.id || sale.invoiceNo} selected.`, 'success');
    };

    const calculateRefund = (items: typeof returnableItems, sale = originalSale) => {
        if (!sale) return;
        const totalSaleAmount = sale.totalAmount;
        const totalSaleDiscount = sale.discount;

        const refund = items.reduce((sum, item) => {
            const itemTotal = item.returnedQuantity * item.price;
            const discountShare = totalSaleAmount > 0
                ? (itemTotal / totalSaleAmount) * totalSaleDiscount
                : 0;
            return sum + (itemTotal - discountShare);
        }, 0);

        setTotalRefundAmount(roundTo2(refund));
    };

    const handleQuantityChange = (productId: string, newQuantity: number, originalSaleItem: SaleItem) => {
        setReturnableItems((prevItems) => {
            const updatedItems = prevItems.map((item) => {
                if (item.productId === productId) {
                    const alreadyReturned = originalSaleItem.returnedQuantity || 0;
                    const maxReturnable = originalSaleItem.quantity - alreadyReturned;
                    const quantity = Math.max(0, Math.min(newQuantity, maxReturnable));
                    return { ...item, returnedQuantity: quantity };
                }
                return item;
            });
            calculateRefund(updatedItems);
            return updatedItems;
        });
    };

    const handleRestockStatusChange = (productId: string, status: 'restocked' | 'damaged') => {
        setReturnableItems((prevItems) =>
            prevItems.map((item) => item.productId === productId ? { ...item, restockStatus: status } : item)
        );
    };

    const handleReturnAllItems = () => {
        if (!originalSale) return;
        const updatedItems = originalSale.items.map(item => ({
            ...item,
            returnedQuantity: item.quantity - (item.returnedQuantity || 0),
            restockStatus: 'restocked' as 'restocked',
            reason: ReturnReason.OTHER,
        }));
        setReturnableItems(updatedItems);
        calculateRefund(updatedItems);
    };

    const handleReturnAllOfThisItem = (productId: string) => {
        setReturnableItems(prevItems => {
            const updatedItems = prevItems.map(item => {
                if (item.productId === productId) {
                    const originalSaleItem = originalSale?.items.find(i => i.productId === productId);
                    const alreadyReturned = originalSaleItem?.returnedQuantity || 0;
                    return {
                        ...item,
                        returnedQuantity: item.quantity - alreadyReturned,
                        restockStatus: 'restocked' as 'restocked',
                        reason: ReturnReason.OTHER,
                    };
                }
                return item;
            });
            calculateRefund(updatedItems);
            return updatedItems;
        });
    };

    const handleProcessReturn = async () => {
        if (isSubmitting) return; // Block double-submit
        if (!originalSale || returnableItems.every((item) => item.returnedQuantity === 0)) {
            showToast('No items selected for return.', 'info');
            return;
        }
        if (!returnReason || returnReason === '') {
            showToast('Please provide a reason for the return.', 'info');
            return;
        }

        const itemsToReturn = returnableItems.filter(item => item.returnedQuantity > 0);
        for (const item of itemsToReturn) {
            if (item.restockStatus !== 'restocked' && item.restockStatus !== 'damaged') {
                showToast(`Please specify restock status for ${item.productName}.`, 'info');
                return;
            }
        }


        setIsSubmitting(true);
        try {
            const newReturnId = uuidv4();
            const nowIso = new Date().toISOString();
            const now = new Date();
            const isCreditSale = isSaleBoughtOnCredit(originalSale);
            const effectiveRefundMethod = isCreditSale ? PaymentMethod.STORE_CREDIT : refundMethod;
            let updatedCustomerRecord: Customer | null = null;

            await runTransaction(db, async (tx) => {
                // ── READ PHASE ──
                // Read all product docs that are being returned
                const productSnaps = await Promise.all(
                    itemsToReturn.map(item => tx.get(doc(db, 'products', item.productId)))
                );

                // Read the original sale doc
                const saleRef = doc(db, 'sales', originalSale.id!);
                const saleSnap = await tx.get(saleRef);
                if (!saleSnap.exists()) throw new Error('Original sale not found.');

                // Read customer doc if present
                let customerSnap = null;
                const customerRef = originalSale.customerId ? doc(db, 'customers', originalSale.customerId) : null;
                if (customerRef) {
                    customerSnap = await tx.get(customerRef);
                }

                // ── GUARD: verify no item exceeds original sold quantity (prevents double-submit & race conditions) ──
                const liveSaleData = normalizeFirestoreDates<Sale>(saleSnap.data());
                for (const item of itemsToReturn) {
                    const liveSaleItem = liveSaleData.items.find(si => si.productId === item.productId);
                    if (!liveSaleItem) continue;
                    const originalSoldQty  = liveSaleItem.quantity;
                    const alreadyReturned  = liveSaleItem.returnedQuantity || 0;
                    const remainingAllowed = originalSoldQty - alreadyReturned;
                    if (item.returnedQuantity > remainingAllowed) {
                        throw new Error(
                            `Return rejected: "${item.productName}" — trying to return ${item.returnedQuantity} but only ${remainingAllowed} remaining. This sale may have already been returned.`
                        );
                    }
                }

                // ── WRITE PHASE ──
                const staffId = currentUser?.id;

                // 1. Create Return document
                const returnRef = doc(db, 'returns', newReturnId);
                tx.set(returnRef, {
                    id: newReturnId,
                    saleId: originalSale.id!,
                    customerId: originalSale.customerId || null,
                    customerName: originalSale.customerName,
                    staffId: staffId || null,
                    returnDate: now,
                    totalRefundAmount: totalRefundAmount,
                    reason: returnReason as ReturnReason,
                    paymentMethod: effectiveRefundMethod,
                    notes: isCreditSale ? 'Automated credit balance reduction for item returned from credit purchase.' : '',
                    created_at: nowIso,
                    updated_at: nowIso,
                    deleted: false
                });

                // 2. Create ReturnedItem documents and restock products
                for (let i = 0; i < itemsToReturn.length; i++) {
                    const item = itemsToReturn[i];
                    const snap = productSnaps[i];
                    const productData = snap.exists() ? normalizeFirestoreDates<Product>(snap.data()) : null;
                    const actualCostPrice = item.costPrice || (productData?.buyPrice ?? 0);
                    const valueLost = item.restockStatus === 'damaged' ? item.returnedQuantity * actualCostPrice : 0;

                    const returnedItemId = uuidv4();
                    const returnedItemRef = doc(db, 'returnedItems', returnedItemId);
                    tx.set(returnedItemRef, {
                        id: returnedItemId,
                        returnId: newReturnId,
                        productId: item.productId,
                        productName: item.productName,
                        quantity: item.returnedQuantity,
                        price: item.price,
                        refundAmount: roundTo2(item.returnedQuantity * item.price),
                        restockStatus: item.restockStatus,
                        valueLost: roundTo2(valueLost),
                        returnDate: now,
                        created_at: nowIso,
                        updated_at: nowIso,
                        deleted: false
                    });

                    // Restock product if not damaged
                    if (item.restockStatus === 'restocked' && productData && snap.exists()) {
                        const pRef = doc(db, 'products', item.productId);
                        tx.update(pRef, {
                            quantity: productData.quantity + item.returnedQuantity,
                            stockValue: (productData.quantity + item.returnedQuantity) * (productData.buyPrice || 0),
                            updated_at: nowIso
                        });
                    }
                }

                // 3. Update customer debt if refund method is Store Credit / Credit or original sale was on credit
                const shouldReduceDebt = (effectiveRefundMethod === PaymentMethod.STORE_CREDIT || effectiveRefundMethod === PaymentMethod.CREDIT)
                    && customerSnap && customerSnap.exists() && customerRef;

                if (shouldReduceDebt) {
                    const custData = normalizeFirestoreDates<Customer>(customerSnap.data());
                    const currentDebt = custData.currentDebt || 0;
                    const newDebt = roundTo2(Math.max(0, currentDebt - totalRefundAmount));
                    tx.update(customerRef, {
                        currentDebt: newDebt,
                        updated_at: nowIso
                    });
                    updatedCustomerRecord = {
                        ...custData,
                        currentDebt: newDebt
                    };
                }

                // 4. Update original sale's items with returnedQuantity
                const updatedSaleItems: SaleItem[] = liveSaleData.items.map(saleItem => {
                    const returnedItemInThisTransaction = itemsToReturn.find(rtnItem => rtnItem.productId === saleItem.productId);
                    if (returnedItemInThisTransaction) {
                        return {
                            ...saleItem,
                            returnedQuantity: (saleItem.returnedQuantity || 0) + returnedItemInThisTransaction.returnedQuantity
                        };
                    }
                    return saleItem;
                });
                tx.update(saleRef, { items: updatedSaleItems, updated_at: nowIso });
            });

            emitDashboardRefresh();

            setReturnId(newReturnId);

            if (updatedCustomerRecord) {
                setCustomer(updatedCustomerRecord);
                import('../utils/creditInfoSync')
                    .then(({ syncCreditInfoToShopUser }) => syncCreditInfoToShopUser(updatedCustomerRecord!))
                    .catch(err => console.warn('[CreditSync] Failed to sync credit info to shop user:', err));
            }

            const auditMsg = isCreditSale
                ? `Processed return ${newReturnId} for credit sale ${originalSale.invoiceNo || originalSale.id} — Refund: ₦${totalRefundAmount.toLocaleString()} automatically applied to customer credit balance (Remaining debt: ₦${(updatedCustomerRecord?.currentDebt ?? 0).toLocaleString()})`
                : `Processed return ${newReturnId} for sale ${originalSale.invoiceNo || originalSale.id} — Refund: ₦${totalRefundAmount.toLocaleString()}`;

            logAudit(
                'RETURN_PROCESSED',
                auditMsg,
                currentUser?.username || 'Unknown'
            ).catch(console.error);

            if (isCreditSale) {
                showToast(`Return processed! Customer credit balance reduced by ₦${totalRefundAmount.toLocaleString()}`, 'success');
            } else {
                showToast(`Return processed successfully! Refund: ₦${totalRefundAmount.toLocaleString()}`, 'success');
            }
            setStep(5);
        } catch (error: any) {
            console.error('Error processing return:', error);
            showToast(error?.message || 'Failed to process return. See console for details.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const startNewReturn = () => {
        setStep(1);
        setSearchQuery('');
        setOriginalSale(undefined);
        setReturnableItems([]);
        setTotalRefundAmount(0);
        setReturnReason(ReturnReason.OTHER);
        setRefundMethod(PaymentMethod.CASH);
        setCustomer(null);
        setReturnId(null);
    };

    const handleDownloadReturnPdf = async () => {
        if (!receiptRef.current || !originalSale) {
            showToast("Return receipt content is not available to save as PDF.", 'error');
            return;
        }
        const defaultFileName = `return-receipt-${returnId}-${format(new Date(), 'yyyyMMdd')}.pdf`;
        receiptRef.current.classList.add('bg-white');
        try {
            await generateAndSavePdfFromHtml(receiptRef.current, defaultFileName);
            showToast('Return receipt PDF saved successfully!', 'success');
        } catch (error) {
            console.error("Return receipt PDF download failed:", error);
            showToast('Failed to save Return receipt PDF.', 'error');
        } finally {
            receiptRef.current.classList.remove('bg-white');
        }
    };

    const handleDownloadReturnImage = async () => {
        if (!receiptRef.current || !originalSale) {
            showToast("Return receipt content is not available to save as an image.", 'error');
            return;
        }
        const defaultFileName = `return-receipt-${returnId}-${format(new Date(), 'yyyyMMdd')}.png`;
        receiptRef.current.classList.add('bg-white');
        try {
            await saveElementAsImage(receiptRef.current, defaultFileName);
            showToast('Return receipt image saved successfully!', 'success');
        } catch (error) {
            console.error("Return receipt image download failed:", error);
            showToast('Failed to save Return receipt image.', 'error');
        } finally {
            receiptRef.current.classList.remove('bg-white');
        }
    };

    return {
        state: {
            step, searchQuery, originalSale, returnableItems, totalRefundAmount,
            returnReason, refundMethod, customer, returnId, receiptRef, currentUser,
            searchResults, isSubmitting
        },
        actions: {
            setStep, setSearchQuery, setReturnReason, setRefundMethod,
            handleSearchSale, handleQuantityChange, handleRestockStatusChange,
            handleReturnAllItems, handleReturnAllOfThisItem, handleProcessReturn,
            startNewReturn, handleDownloadReturnPdf, handleDownloadReturnImage,
            handleSelectSale
        }
    };
}
