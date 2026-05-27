import { useState, useEffect, useRef } from 'react';
import { db, addReturn, addReturnedItem, updateCustomer } from '../db/db';
import { Sale, SaleItem, PaymentMethod, ReturnReason, Return, Customer } from '../types';
import { roundTo2 } from '../utils/math';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../auth/AuthContext';
import { generateAndSavePdfFromHtml, saveElementAsImage } from '../services/pdfService';
import { format } from 'date-fns';

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

    const receiptRef = useRef<HTMLDivElement>(null);
    const { currentUser } = useAuth();
    const { showToast } = useToast();

    useEffect(() => {
        if (originalSale?.customerId) {
            db.customers.get(originalSale.customerId).then(setCustomer);
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
            let sale = await db.sales.get(searchQuery);

            // 2. Search by Invoice Number
            if (!sale) {
                sale = await db.sales.where('invoiceNo').equals(searchQuery).first();
            }

            if (sale) {
                handleSelectSale(sale);
                return;
            }

            // 3. Search by exact Customer Name
            let salesByCustomer = await db.sales
                .where('customerName').equals(searchQuery)
                .sortBy('date');

            // 4. Search by Case-Insensitive Customer Name Start (if no exact match)
            if (salesByCustomer.length === 0) {
                salesByCustomer = await db.sales
                    .where('customerName').startsWithIgnoreCase(searchQuery)
                    .sortBy('date');
            }

            if (salesByCustomer.length > 0) {
                if (salesByCustomer.length === 1) {
                    handleSelectSale(salesByCustomer[0]);
                } else {
                    // Sort descending for the UI selection
                    setSearchResults([...salesByCustomer].reverse());
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
            returnedQuantity: item.quantity,
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
                    return {
                        ...item,
                        returnedQuantity: item.quantity,
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

        try {
            await db.transaction('rw', [db.sales, db.products, db.returns, db.returnedItems, db.customers, db.auditLogs], async () => {
                const staffId = currentUser?.id;
                const returnEntry: Omit<Return, 'id'> = {
                    saleId: originalSale.id!,
                    customerId: originalSale.customerId,
                    customerName: originalSale.customerName,
                    staffId: staffId,
                    returnDate: new Date(),
                    totalRefundAmount: totalRefundAmount,
                    reason: returnReason as ReturnReason,
                    paymentMethod: refundMethod,
                    notes: '',
                };
                const newReturnId = await addReturn(returnEntry);
                setReturnId(newReturnId);

                for (const item of itemsToReturn) {
                    const product = await db.products.get(item.productId);
                    let actualCostPrice = item.costPrice || (product?.buyPrice ?? 0);
                    const valueLost = item.restockStatus === 'damaged' ? item.returnedQuantity * actualCostPrice : 0;

                    await addReturnedItem({
                        returnId: newReturnId,
                        productId: item.productId,
                        productName: item.productName,
                        quantity: item.returnedQuantity,
                        price: item.price,
                        refundAmount: roundTo2(item.returnedQuantity * item.price),
                        restockStatus: item.restockStatus as 'restocked' | 'damaged',
                        valueLost: roundTo2(valueLost),
                    });

                    if (item.restockStatus === 'restocked' && product) {
                        await db.products.update(product.id!, {
                            quantity: product.quantity + item.returnedQuantity,
                            updated_at: new Date().toISOString()
                        });
                    }
                }

                if (originalSale.paymentMethod === PaymentMethod.CREDIT && originalSale.customerId && customer) {
                    const newDebt = roundTo2(customer.currentDebt - totalRefundAmount);
                    await updateCustomer(customer.id!, { currentDebt: Math.max(0, newDebt) });
                }

                const updatedSaleItems: SaleItem[] = originalSale.items.map(saleItem => {
                    const returnedItemInThisTransaction = itemsToReturn.find(rtnItem => rtnItem.productId === saleItem.productId);
                    if (returnedItemInThisTransaction) {
                        return {
                            ...saleItem,
                            returnedQuantity: (saleItem.returnedQuantity || 0) + returnedItemInThisTransaction.returnedQuantity
                        };
                    }
                    return saleItem;
                });
                await db.sales.update(originalSale.id!, { items: updatedSaleItems });
            });

            showToast(`Return processed successfully! Refund: ₦${totalRefundAmount.toLocaleString()}`, 'success');
            setStep(5);
        } catch (error) {
            console.error('Error processing return:', error);
            showToast('Failed to process return. See console for details.', 'error');
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
            searchResults
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
