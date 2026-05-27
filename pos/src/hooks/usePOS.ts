import { useState } from 'react';
import { db, logAudit } from '../db/db';
import { Sale, SaleItem, PaymentMethod, SaleStatus, Customer } from '../types';
import { roundTo2 } from '../utils/math';

interface UsePOSProps {
    cart: SaleItem[];
    clearCart: () => void;
    calculateTotal: () => number;
    discount: number;
    setDiscount: (discount: number) => void;
    selectedCustomer: Customer | null;
    setSelectedCustomer: (customer: Customer | null) => void;
    currentUser: any,
    isAdmin: boolean,
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
    setActiveTab: (tab: 'cart' | 'held' | 'history') => void,
    setIsPaymentModalOpen: (isOpen: boolean) => void,
    setIsMultipayOpen: (isOpen: boolean) => void,
    setMultipayEntries: (entries: { method: PaymentMethod; amount: string }[]) => void,
    setMobileView: (view: 'catalog' | 'checkout') => void;
}

export function usePOS({
    cart, clearCart, calculateTotal, discount, setDiscount,
    selectedCustomer, setSelectedCustomer, currentUser, isAdmin, showToast, setActiveTab,
    setIsPaymentModalOpen, setIsMultipayOpen, setMultipayEntries, setMobileView
}: UsePOSProps) {

    const [isProcessing, setIsProcessing] = useState(false);
    const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
    const [receiptCustomerDebt, setReceiptCustomerDebt] = useState<{ previousDebt: number; thisSaleDebt: number; newDebt: number; creditLimit: number } | null>(null);


    const handleHoldSale = async () => {
        if (cart.length === 0) return;
        try {
            const total = calculateTotal();

            // Generate temporary invoice number for held sale if it doesn't have one
            const tempInvoiceNo = `HLD-${Date.now().toString().slice(-6)}`;

            await db.sales.add({
                customerId: selectedCustomer?.id,
                customerName: selectedCustomer?.name || 'Walk-in',
                date: new Date(),
                totalAmount: total,
                discount: discount,
                finalAmount: roundTo2(Math.max(0, total - discount)),
                paymentMethod: PaymentMethod.CASH, // Default placeholder
                status: SaleStatus.HELD,
                items: cart,
                invoiceNo: tempInvoiceNo
            });
            clearCart();
            setDiscount(0);
            setSelectedCustomer(null);
            setActiveTab('held');
            showToast('Sale put on hold', 'info');
        } catch (error) {
            console.error(error);
            showToast("Failed to hold sale.", 'error');
        }
    };

    const handleResumeSale = async (sale: Sale, setCart: (items: SaleItem[]) => void) => {
        const itemsWithCurrentStock = await Promise.all(sale.items.map(async item => {
            const product = await db.products.get(item.productId);
            return {
                ...item,
                stockAtAddition: product?.quantity || 0
            };
        }));

        setCart(itemsWithCurrentStock);
        setDiscount(sale.discount || 0);
        if (sale.customerId) {
            const cust = await db.customers.get(sale.customerId);
            setSelectedCustomer(cust || null);
        } else {
            setSelectedCustomer(null);
        }
        if (sale.id) await db.sales.delete(sale.id);
        setActiveTab('cart');
    };

    const handleCheckout = async (method: PaymentMethod, multipayEntries: { method: PaymentMethod; amount: string }[] = [], amountPaid?: number) => {
        if (isProcessing) return;
        setIsProcessing(true);

        if (cart.length === 0) {
            showToast('Cart is empty.', 'error');
            setIsProcessing(false);
            return;
        }

        try {
            const totalAmount = calculateTotal();
            const finalAmount = roundTo2(Math.max(0, totalAmount - discount));
            
            // Determine actual paid amount
            let actualPaid = amountPaid !== undefined ? amountPaid : finalAmount;
            if (method === PaymentMethod.MULTIPAY) {
                actualPaid = multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0);
            } else if (method === PaymentMethod.CREDIT) {
                actualPaid = 0;
            }
            
            const debtAmount = roundTo2(Math.max(0, finalAmount - actualPaid));
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

            const finalItems: SaleItem[] = [];

            const { newId, generatedInvoiceNo, debtInfo, saleData } = await db.transaction('rw', [db.products, db.sales, db.customers, db.auditLogs, db.settings], async () => {
                // 1. Stock check & deduction
                for (const item of cart) {
                    const product = await db.products.get(item.productId);
                    if (!product) throw new Error(`Product "${item.productName}" not found.`);
                    if (product.quantity < item.quantity) {
                        throw new Error(`Insufficient stock for "${item.productName}". Available: ${product.quantity}`);
                    }

                    await db.products.update(item.productId, {
                        quantity: product.quantity - item.quantity,
                    });

                    finalItems.push({ ...item, costPrice: product.buyPrice });
                }

                // 2. Generate Invoice Number
                const lastInvoiceSetting = await db.settings.get('lastInvoiceNo');
                let nextInvoiceNo = 1;
                if (lastInvoiceSetting) {
                    nextInvoiceNo = parseInt(lastInvoiceSetting.value) + 1;
                }
                const formattedInvoiceNo = `INV-${nextInvoiceNo.toString().padStart(6, '0')}`;
                await db.settings.put({ key: 'lastInvoiceNo', value: nextInvoiceNo.toString() });

                // 3. Build sale record
                const saleData: any = {
                    customerName: selectedCustomer?.name || 'Walk-in',
                    date: new Date(),
                    totalAmount,
                    discount,
                    finalAmount,
                    paymentMethod: (debtAmount > 0 && actualPaid > 0) ? PaymentMethod.MULTIPAY : method,
                    status: SaleStatus.COMPLETED,
                    items: finalItems,
                    invoiceNo: formattedInvoiceNo
                };
                if (selectedCustomer?.id) saleData.customerId = selectedCustomer.id;
                
                // Set payment methods breakdown
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
                    // If it was a single method but partial, we mark it as MULTIPAY internally for the breakdown
                    if (actualPaid > 0) saleData.paymentMethod = PaymentMethod.MULTIPAY;
                } else if (method === PaymentMethod.MULTIPAY) {
                    saleData.paymentMethods = multipayEntries.map(e => ({ method: e.method, amount: roundTo2(parseFloat(e.amount)) }));
                }

                // 4. Update customer debt and prepare debtInfo
                let debtInfo: { previousDebt: number; thisSaleDebt: number; newDebt: number; creditLimit: number } | null = null;
                if (selectedCustomer?.id) {
                    const customer = await db.customers.get(selectedCustomer.id);
                    if (customer) {
                        const previousDebt = customer.currentDebt || 0;
                        const thisSaleDebt = debtAmount;
                        const newDebt = roundTo2(previousDebt + thisSaleDebt);
                        
                        if (thisSaleDebt > 0) {
                            await db.customers.update(customer.id!, { currentDebt: newDebt });
                        }
                        
                        debtInfo = { 
                            previousDebt, 
                            thisSaleDebt,
                            newDebt, 
                            creditLimit: customer.creditLimit || 0 
                        };
                        saleData.debtInfo = debtInfo;
                    }
                }

                // 5. Save sale
                const savedId = await db.sales.add(saleData as Sale);

                return { newId: savedId, generatedInvoiceNo: formattedInvoiceNo, debtInfo, saleData };
            });

            // Set debt state OUTSIDE the transaction (React state setters don't work inside Dexie transactions)
            setReceiptCustomerDebt(debtInfo ?? null);

            // 5. Build full sale object for receipt
            const finalSale: Sale = {
                ...(saleData as any),
                id: newId,
            } as Sale;

            setReceiptSale(finalSale);

            logAudit(
                'SALE_COMPLETED',
                `Sale #${generatedInvoiceNo} — ₦${finalAmount.toLocaleString()} via ${debtAmount > 0 ? 'PARTIAL' : method}${debtAmount > 0 ? ` (Debt: ₦${debtAmount.toLocaleString()})` : ''}`,
                currentUser?.username || 'Unknown'
            ).catch(console.error);

            showToast(`✓ Sale complete — ₦${finalAmount.toLocaleString()}`, 'success');

            // 6. Reset state
            clearCart();
            setDiscount(0);
            setIsPaymentModalOpen(false);
            setSelectedCustomer(null);
            setIsMultipayOpen(false);
            setMultipayEntries([]);
            setMobileView('catalog');

        } catch (error: any) {
            console.error('[Checkout] FATAL ERROR:', error);
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
