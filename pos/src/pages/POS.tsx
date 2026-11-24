import { useState, useRef, useMemo, useEffect } from 'react';
import { Product, Customer, SaleStatus, PaymentMethod, Sale } from '../types';
import { Search } from 'lucide-react';
import { printThermalReceipt } from '../services/printerService';
import { saveElementAsImage, getElementAsFile, generateAndSavePdfFromHtml, copyElementToClipboard } from '../services/pdfService';
import { where, limit, orderBy } from 'firebase/firestore';
import { searchCustomerSalesPOS } from '../services/customerSalesService';
import { normalizeFirestoreDates, useCollection } from '../firebase/firestoreHelpers';
import { customersRepo } from '../repositories';

import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../hooks/useCart';
import { usePOS } from '../hooks/usePOS';
import { useAuthStatus } from '../hooks/useAuthStatus';

import { ProductGrid } from '../components/pos/ProductGrid';
import { CartPanel } from '../components/pos/CartPanel';
import { PaymentModal } from '../components/pos/PaymentModal';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import { PosHeader } from '../components/pos/PosHeader';
import { PosTabs } from '../components/pos/PosTabs';
import { HeldSalesPanel } from '../components/pos/HeldSalesPanel';
import { HistoryPanel } from '../components/pos/HistoryPanel';


const isMobileDevice = (): boolean => {
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0);
};

export default function POS() {
    const { currentUser, isAdmin } = useAuth();
    const authStatus = useAuthStatus();
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
    const [customerSalesResults, setCustomerSalesResults] = useState<Sale[]>([]);
    const [isSearchingCustomerSales, setIsSearchingCustomerSales] = useState(false);
    const { showToast } = useToast();

    // UI state
    const [activeTab, setActiveTab] = useState<'cart' | 'held' | 'history'>('cart');
    const [mobileView, setMobileView] = useState<'catalog' | 'checkout'>('catalog');

    // Firestore Real-time subscriptions (scoped to prevent reading all historical sales)
    const { data: rawCustomers } = useCollection<Customer>('customers');
    const { data: rawProducts } = useCollection<Product>('products');
    // Query the isolated 'heldSales' collection instead of mixing into completed sales
    const { data: heldSalesDocs } = useCollection<Sale>('heldSales', useMemo(() => [where('status', '==', SaleStatus.HELD)], []));
    const { data: recentSalesDocs } = useCollection<Sale>('sales', useMemo(() => [where('status', '==', SaleStatus.COMPLETED), orderBy('date', 'desc'), limit(100)], []));

    const customers = useMemo(() => {
        return rawCustomers.filter(c => {
            if (c.deleted) return false;
            if (!c.name || c.name.trim() === '' || c.name === 'Walk-in Customer') return false;
            return true;
        });
    }, [rawCustomers]);

    // Fetch customer sales via Cloud Function when the operator searches in the POS History tab.
    // The function does a server-side prefix match on `nameLower` and returns up to 50 sales
    // per matched customer (max 5 customers) with per-customer aggregate totals.
    useEffect(() => {
        const searchTrimmed = historySearchQuery.trim();
        if (!searchTrimmed || searchTrimmed.length < 2) {
            setCustomerSalesResults([]);
            setIsSearchingCustomerSales(false);
            return;
        }

        let cancelled = false;
        setIsSearchingCustomerSales(true);

        const fetchCustomerSales = async () => {
            try {
                const result = await searchCustomerSalesPOS(searchTrimmed);
                if (!cancelled) {
                    // Dates arrive as ISO strings — parse them to Date for downstream filters
                    const parsedSales = result.sales.map(s => ({
                        ...s,
                        date: s.date ? new Date(s.date as any) : new Date(),
                    })) as Sale[];
                    setCustomerSalesResults(parsedSales);
                }
            } catch (error) {
                console.error('[POS] Error fetching customer sales via Cloud Function:', error);
                if (!cancelled) setCustomerSalesResults([]);
            } finally {
                if (!cancelled) setIsSearchingCustomerSales(false);
            }
        };

        const timer = setTimeout(fetchCustomerSales, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [historySearchQuery]);

    // Clear POS product search box when a barcode is scanned
    useEffect(() => {
        const handleBarcodeScanned = () => {
            setSearchQuery('');
        };
        window.addEventListener('barcode-scanned', handleBarcodeScanned);
        return () => {
            window.removeEventListener('barcode-scanned', handleBarcodeScanned);
        };
    }, []);

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

    const productsWithStock = useMemo(() => {
        if (posManager.isProcessing) return null;

        const queryLower = (searchQuery || '').trim().toLowerCase();
        let filtered = rawProducts.filter(p => !p.deleted && (p.name || '').trim().length > 0);

        if (queryLower) {
            filtered = filtered.filter(p =>
                (p.name || '').toLowerCase().includes(queryLower) ||
                (p.category || '').toLowerCase().includes(queryLower)
            );
        }

        return filtered.slice(0, 100).map(p => ({
            ...p,
            totalStock: p.quantity,
            validStock: p.quantity,
            isOutOfStock: p.quantity <= 0,
            hasExpiredStock: false
        }));
    }, [rawProducts, searchQuery, posManager.isProcessing]);

    const recentSales = useMemo(() => {
        const completed = recentSalesDocs.filter(s => !s.deleted);

        // If customer sales were fetched from Firestore via search query, merge them
        if (historySearchQuery.trim() && customerSalesResults.length > 0) {
            const map = new Map<string, Sale>();

            customerSalesResults.forEach(s => {
                if (s.id) map.set(s.id, s);
            });

            const q = historySearchQuery.toLowerCase();
            completed.forEach(sale => {
                if (sale.id) {
                    if (
                        (sale.customerName || '').toLowerCase().includes(q) ||
                        (sale.id || '').toLowerCase().includes(q) ||
                        (sale.invoiceNo || '').toLowerCase().includes(q)
                    ) {
                        map.set(sale.id, sale);
                    }
                }
            });

            const sorted = Array.from(map.values()).sort((a, b) => {
                const timeA = a.date ? new Date(a.date).getTime() : 0;
                const timeB = b.date ? new Date(b.date).getTime() : 0;
                return historySortOrder === 'desc' ? timeB - timeA : timeA - timeB;
            });

            return sorted.slice(0, 50);
        }

        let filtered = completed;
        if (historySearchQuery) {
            const q = historySearchQuery.toLowerCase();
            filtered = completed.filter(sale =>
                (sale.customerName || '').toLowerCase().includes(q) ||
                (sale.id?.toString() || '').includes(q) ||
                (sale.invoiceNo?.toString() || '').includes(q)
            );
        }

        const sorted = [...filtered].sort((a, b) => {
            const timeA = a.date ? new Date(a.date).getTime() : 0;
            const timeB = b.date ? new Date(b.date).getTime() : 0;
            return historySortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });

        return sorted.slice(0, 50);
    }, [recentSalesDocs, historySearchQuery, historySortOrder, customerSalesResults]);

    const heldSales = useMemo(() => {
        return heldSalesDocs
            .filter(s => !s.deleted)
            .sort((a, b) => {
                const timeA = a.date ? new Date(a.date).getTime() : 0;
                const timeB = b.date ? new Date(b.date).getTime() : 0;
                return timeB - timeA;
            });
    }, [heldSalesDocs]);

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
                const file = await getElementAsFile(receiptRef.current, fileName);

                if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: `Receipt ${sale.invoiceNo || sale.id}`,
                        text: textSummary,
                    });
                } else {
                    const waUrl = `whatsapp://send?text=${encodeURIComponent(textSummary)}`;
                    window.open(waUrl, '_blank');
                    showToast('WhatsApp opened. Image sharing not supported on this browser.', 'info');
                }
            } else {
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
        const currentSale = posManager.receiptSale;
        const currentDebt = posManager.receiptCustomerDebt;

        const res = await printThermalReceipt(currentSale, currentDebt, { paperSize });
        if (res.direct) {
            showToast("Receipt printed directly to thermal printer.", "success");
        }
        // Close the receipt window after print execution completes
        posManager.setReceiptSale(null);
    };



    return (
        <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] flex flex-col md:p-4 gap-4 max-w-[1600px] mx-auto overflow-hidden">

            {/* ── Firebase Auth Status Banner ── */}
            {authStatus === 'failed' && (
                <div
                    id="pos-auth-error-banner"
                    role="alert"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-white text-sm font-medium shadow-lg"
                    style={{ background: 'linear-gradient(90deg,#dc2626,#b91c1c)', flexShrink: 0 }}
                >
                    <span style={{ fontSize: '1.25rem' }}>&#x26A0;&#xFE0F;</span>
                    <span>
                        <strong>POS Server Connection Lost.</strong>{' '}
                        Sales cannot be processed right now. Check your internet connection and refresh the page.
                        If this persists, contact your administrator — the store password may need to be updated.
                    </span>
                </div>
            )}
            {authStatus === 'pending' && (
                <div
                    id="pos-auth-pending-banner"
                    role="status"
                    className="flex items-center gap-3 px-4 py-2 rounded-lg text-white text-sm shadow-md"
                    style={{ background: 'linear-gradient(90deg,#d97706,#b45309)', flexShrink: 0 }}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            width: 16,
                            height: 16,
                            border: '2px solid rgba(255,255,255,0.4)',
                            borderTopColor: '#fff',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                            flexShrink: 0
                        }}
                    />
                    Connecting to server, please wait…
                </div>
            )}

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
                                placeholder="Search products by name or category..."
                                className="w-full pl-9 md:pl-10 pr-4 py-2 md:py-2.5 text-sm md:text-base border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                                data-scan-safe="true"
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
                            isLoading={isSearchingCustomerSales}
                            setReceiptSale={async (sale) => {
                                if (sale.debtInfo) {
                                    posManager.setReceiptCustomerDebt(sale.debtInfo);
                                } else if (sale.customerId) {
                                    try {
                                        const customer = await customersRepo.getById(sale.customerId);
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