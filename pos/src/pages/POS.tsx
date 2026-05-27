import * as React from 'react';
import { useState, useRef } from 'react';
import { db } from '../db/db';
import { Product, Customer, SaleStatus, PaymentMethod } from '../types';
import { Search } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateReceiptBuffer, printRawReceipt } from '../services/printerService';
import { requestUSBPrinter, printRawUSB, isPrinterConnected } from '../services/webUsbPrinterService';
import { savePdf, saveElementAsImage, getElementAsFile, generateAndSavePdfFromHtml, copyElementToClipboard } from '../services/pdfService';


import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../hooks/useCart';
import { usePOS } from '../hooks/usePOS';

import { ProductGrid } from '../components/pos/ProductGrid';
import { CartPanel } from '../components/pos/CartPanel';
import { PaymentModal } from '../components/pos/PaymentModal';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import { PosHeader } from '../components/pos/PosHeader';
import { PosTabs } from '../components/pos/PosTabs';
import { HeldSalesPanel } from '../components/pos/HeldSalesPanel';
import { HistoryPanel } from '../components/pos/HistoryPanel';

import '../print.css';

const isMobileDevice = (): boolean => {
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0);
};

export default function POS() {
    const { currentUser, isAdmin } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const receiptRef = useRef<HTMLDivElement>(null);
    const [isMultipayOpen, setIsMultipayOpen] = useState(false);
    const [multipayEntries, setMultipayEntries] = useState<{ method: PaymentMethod; amount: string }[]>([]);
    const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
    const [discount, setDiscount] = useState<number>(0);
    const [isWholesaleMode, setIsWholesaleMode] = useState(false);
    const [historySortOrder, setHistorySortOrder] = useState<'asc' | 'desc'>('desc');
    const { showToast } = useToast();

    // UI state
    const [activeTab, setActiveTab] = useState<'cart' | 'held' | 'history'>('cart');
    const [mobileView, setMobileView] = useState<'catalog' | 'checkout'>('catalog');

    // Customers
    const customers = useLiveQuery(() =>
        db.customers.filter(c => c.name !== 'Walk-in Customer').toArray()
    );

    // Hooks
    const cartManager = useCart(isWholesaleMode, showToast);
    const posManager = usePOS({
        cart: cartManager.cart,
        clearCart: cartManager.clearCart,
        calculateTotal: cartManager.calculateTotal,
        discount,
        setDiscount,
        selectedCustomer,
        setSelectedCustomer,
        currentUser,
        isAdmin,
        showToast,
        setActiveTab,
        setIsPaymentModalOpen,
        setIsMultipayOpen,
        setMultipayEntries,
        setMobileView
    });

    // Queries
    const productsWithStock = useLiveQuery(async () => {
        if (posManager.isProcessing) return null;

        const prods = searchQuery.length === 0
            ? await db.products.limit(100).toArray()
            : await db.products
                .where('name').startsWithIgnoreCase(searchQuery)
                .limit(100)
                .toArray();

        return prods.map(p => ({
            ...p,
            totalStock: p.quantity,
            validStock: p.quantity,
            isOutOfStock: p.quantity <= 0,
            hasExpiredStock: false
        }));
    }, [searchQuery, posManager.isProcessing]);

    const recentSales = useLiveQuery(async () => {
        if (!historySearchQuery) {
            const sales = await db.sales
                .orderBy('date')
                .reverse()
                .filter(s => s.status === SaleStatus.COMPLETED)
                .limit(50)
                .toArray();
            return historySortOrder === 'desc' ? sales : sales.reverse();
        }
        const q = (historySearchQuery || '').toLowerCase();
        const sales = await db.sales
            .where('status').equals(SaleStatus.COMPLETED)
            .filter(sale =>
                (sale.customerName || '').toLowerCase().includes(q) ||
                (sale.id?.toString() || '').includes(q)
            )
            .sortBy('date');
        const result = historySortOrder === 'desc' ? sales.reverse() : sales;
        return result.slice(0, 50);
    }, [historySearchQuery, historySortOrder]);

    const heldSales = useLiveQuery(() =>
        db.sales.where('status').equals(SaleStatus.HELD).sortBy('date').then(res => res.reverse())
    );

    // Helpers for Receipt sharing/printing
    const handleShareImage = async () => {
        if (!receiptRef.current || !posManager.receiptSale) return;
        const fileName = `receipt-${posManager.receiptSale.id}.png`;
        receiptRef.current.classList.add('bg-white');
        try {
            const file = await getElementAsFile(receiptRef.current, fileName);
            if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: `Receipt #${posManager.receiptSale.id}` });
            } else {
                await saveElementAsImage(receiptRef.current, fileName);
                showToast("Sharing not supported. Image downloaded.", "info");
            }
        } catch (error) {
            console.error("Error sharing receipt:", error);
            showToast("Failed to share receipt.", "error");
        } finally {
            if (receiptRef.current) receiptRef.current.classList.remove('bg-white');
        }
    };

    const handleShareWhatsApp = async () => {
        if (!posManager.receiptSale || !receiptRef.current) return;

        const sale = posManager.receiptSale;
        const fileName = `receipt-${sale.invoiceNo || sale.id}.png`;

        // Build the fallback text summary (used on desktop and as share title on mobile)
        const textSummary = [
            `*Ganewa Shopping Mall Kurfi*`,
            `Receipt: ${sale.invoiceNo || sale.id}`,
            `Customer: ${sale.customerName}`,
            `Total: ₦${(sale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Payment: ${sale.paymentMethod}`,
            `Date: ${new Date(sale.date).toLocaleString()}`,
            `Thank you for your business!`
        ].join('\n');

        receiptRef.current.classList.add('bg-white');

        try {
            if (isMobileDevice()) {
                // --- MOBILE PATH: share image via native share sheet ---
                const file = await getElementAsFile(receiptRef.current, fileName);

                if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: `Receipt ${sale.invoiceNo || sale.id}`,
                        text: textSummary,
                    });
                } else {
                    // Fallback: Web Share API not available on this mobile browser
                    const waUrl = `whatsapp://send?text=${encodeURIComponent(textSummary)}`;
                    window.open(waUrl, '_blank');
                    showToast('WhatsApp opened. Image sharing not supported on this browser.', 'info');
                }
            } else {
                // --- DESKTOP PATH: copy image to clipboard + open WhatsApp Web with text ---
                const [imageCopied] = await Promise.allSettled([
                    copyElementToClipboard(receiptRef.current),
                    Promise.resolve(
                        window.open(
                            `https://web.whatsapp.com/send?text=${encodeURIComponent(textSummary)}`,
                            '_blank'
                        )
                    )
                ]);

                const copied = imageCopied.status === 'fulfilled' && imageCopied.value === true;
                if (copied) {
                    showToast('WhatsApp Web opened. Receipt image copied — paste it in the chat.', 'success');
                } else {
                    showToast('WhatsApp Web opened with receipt text.', 'info');
                }
            }
        } catch (error: any) {
            // User cancelled the share sheet — not a real error
            if (error?.name === 'AbortError') return;
            console.error('WhatsApp share error:', error);
            showToast('Failed to share receipt.', 'error');
        } finally {
            if (receiptRef.current) receiptRef.current.classList.remove('bg-white');
        }
    };

    const handleDownloadImage = async () => {
        if (!receiptRef.current || !posManager.receiptSale) return;
        await saveElementAsImage(receiptRef.current, `receipt-${posManager.receiptSale.id}.png`);
        showToast("Receipt image downloaded.", "success");
    };

    const handleDownloadReceipt = async () => {
        if (!receiptRef.current || !posManager.receiptSale) return;
        await generateAndSavePdfFromHtml(receiptRef.current, `receipt-${posManager.receiptSale.id}.pdf`);
        showToast("Receipt PDF downloaded.", "success");
    };

    const handlePrintRaw = async () => {
        if (!posManager.receiptSale) return;
        try {
            if (!isPrinterConnected()) await requestUSBPrinter();
            const buffer = generateReceiptBuffer(posManager.receiptSale, {}, posManager.receiptCustomerDebt);
            await printRawUSB(buffer);
            showToast("Receipt sent to thermal printer.", "success");
        } catch (error: any) {
            console.error('Print Error:', error);
            showToast(`Thermal printing failed: ${error.message || 'Unknown error'}`, 'error');
        }
    };


    return (
        <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] flex flex-col md:p-4 gap-4 max-w-[1600px] mx-auto overflow-hidden">
            {/* Header Section */}
            <PosHeader
                cartItemCount={cartManager.cartItemCount}
                isWholesaleMode={isWholesaleMode}
                setIsWholesaleMode={setIsWholesaleMode}
                setMobileView={setMobileView}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col lg:flex-row gap-0 md:gap-4 overflow-hidden relative">

                {/* Left Panel: Catalog */}
                <div className={`
                    flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col no-print
                    ${mobileView === 'catalog' ? 'flex' : 'hidden lg:flex'}
                `}>
                    <div className="p-3 md:p-4 border-b border-slate-200 sticky top-0 bg-white z-10 flex gap-2 w-full">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 md:w-5 md:h-5" />
                            <input
                                type="text"
                                placeholder="Search products or scan barcode..."
                                className="w-full pl-9 md:pl-10 pr-4 py-2 md:py-2.5 text-sm md:text-base border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    {posManager.isProcessing ? (
                        <div className="flex-1 flex justify-center items-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                        </div>
                    ) : (
                        <ProductGrid
                            products={productsWithStock}
                            isWholesaleMode={isWholesaleMode}
                            addToCart={cartManager.addToCart}
                        />
                    )}
                </div>

                {/* Right Panel: Tabs, Cart, Held, History */}
                <div className={`
                    flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col no-print
                    w-full lg:w-[400px] lg:flex-none h-full overflow-hidden
                    ${mobileView === 'checkout' ? 'flex absolute inset-0 z-20 md:relative md:inset-auto md:z-auto' : 'hidden lg:flex'}
                `}>
                    <PosTabs
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        heldSalesCount={heldSales?.length || 0}
                        setMobileView={setMobileView}
                    />

                    {activeTab === 'cart' && (
                        <div className="flex flex-col h-full overflow-hidden">
                            <CartPanel
                                cart={cartManager.cart}
                                customers={customers}
                                selectedCustomer={selectedCustomer}
                                setSelectedCustomer={setSelectedCustomer}
                                updateQuantity={cartManager.updateQuantity}
                                removeFromCart={cartManager.removeFromCart}
                                calculateTotal={cartManager.calculateTotal}
                                discount={discount}
                                setDiscount={setDiscount}
                                handleHoldSale={posManager.handleHoldSale}
                                setIsPaymentModalOpen={setIsPaymentModalOpen}
                                isAdmin={isAdmin}
                            />
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <HistoryPanel
                            recentSales={recentSales}
                            historySearchQuery={historySearchQuery}
                            setHistorySearchQuery={setHistorySearchQuery}
                        setReceiptSale={async (sale) => {
                            if (!sale.debtInfo && sale.customerId) {
                                try {
                                    const customer = await db.customers.get(sale.customerId);
                                    if (customer) {
                                        const thisSaleDebt = sale.paymentMethods
                                            ? sale.paymentMethods.find(m => m.method === PaymentMethod.CREDIT)?.amount || 0
                                            : sale.paymentMethod === PaymentMethod.CREDIT
                                                ? (sale.finalAmount || 0)
                                                : 0;

                                        const currentDebt = customer.currentDebt || 0;
                                        const previousDebt = Math.max(0, currentDebt - thisSaleDebt);

                                        posManager.setReceiptCustomerDebt({
                                            previousDebt,
                                            thisSaleDebt,
                                            newDebt: previousDebt + thisSaleDebt,
                                            creditLimit: customer.creditLimit || 0
                                        });
                                    } else {
                                        posManager.setReceiptCustomerDebt(null);
                                    }
                                } catch (e) {
                                    console.error("Error fetching customer for history receipt:", e);
                                    posManager.setReceiptCustomerDebt(null);
                                }
                            } else {
                                posManager.setReceiptCustomerDebt(null);
                            }
                            posManager.setReceiptSale(sale);
                        }}
                            historySortOrder={historySortOrder}
                            setHistorySortOrder={setHistorySortOrder}
                        />
                    )}

                    {activeTab === 'held' && (
                        <HeldSalesPanel
                            heldSales={heldSales}
                            handleResumeSale={(sale) => posManager.handleResumeSale(sale, cartManager.setCart)}
                        />
                    )}
                </div>
            </div>

            {/* Modals */}
            <PaymentModal
                isPaymentModalOpen={isPaymentModalOpen}
                setIsPaymentModalOpen={setIsPaymentModalOpen}
                isMultipayOpen={isMultipayOpen}
                setIsMultipayOpen={setIsMultipayOpen}
                multipayEntries={multipayEntries}
                setMultipayEntries={setMultipayEntries}
                calculateTotal={cartManager.calculateTotal}
                discount={discount}
                selectedCustomer={selectedCustomer}
                isProcessing={posManager.isProcessing}
                handleCheckout={posManager.handleCheckout}
                isAdmin={isAdmin}
            />

            <ReceiptModal
                receiptSale={posManager.receiptSale}
                setReceiptSale={posManager.setReceiptSale}
                paperSize={paperSize}
                setPaperSize={setPaperSize}
                receiptRef={receiptRef}
                receiptCustomerDebt={posManager.receiptCustomerDebt}
                handleShareWhatsAppWeb={handleShareWhatsApp}
                handleShareImage={handleShareImage}
                handlePrintRaw={handlePrintRaw}
                handleDownloadImage={handleDownloadImage}
                handleDownloadReceipt={handleDownloadReceipt}
            />
        </div>
    );
}