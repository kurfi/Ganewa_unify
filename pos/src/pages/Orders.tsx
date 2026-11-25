import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useDialog } from '../contexts/DialogContext';
import { logAudit, useCollection } from '../firebase/firestoreHelpers';
import { salesRepo, productsRepo, customersRepo } from '../repositories';
import { db as firestoreDb } from '../firebase/config';
import { Sale } from '../types';
import {
  doc,
  updateDoc,
  runTransaction,
  collection,
  query,
  where,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { syncCreditInfoToShopUser } from '../utils/creditInfoSync';
import { useOnlineOrders, Order, OrderItem, OrderPayment } from '../contexts/OnlineOrdersContext';
import { emitDashboardRefresh } from '../utils/dashboardRefreshSignal';
import { fetchNextInvoiceNo } from '../services/invoiceNumberService';
import { printThermalReceipt } from '../services/printerService';
import {
  Search,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  Truck,
  Store,
  ExternalLink,
  RefreshCw,
  ShoppingBag,
  ArrowRight,
  ChevronRight,
  Info,
  History,
  ReceiptText,
  Printer,
  CreditCard,
  FileText
} from 'lucide-react';
import { PaymentMethod, SaleStatus } from '../types';
import { ImageWithFallback } from '../components/ImageWithFallback';

const Orders: React.FC = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useDialog();

  // Page-level tab: 'active' = live order management, 'history' = fulfilled online sales history
  const [activePageTab, setActivePageTab] = useState<'active' | 'history'>('active');

  const { orders: activeOrders, loading: activeLoading } = useOnlineOrders();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'cancelled'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completingPaymentMethod, setCompletingPaymentMethod] = useState<PaymentMethod | null>(null);

  // ── Lazy query for completed / cancelled orders ─────────────────────────────
  // The OnlineOrdersContext only subscribes to pending/processing for real-time
  // badge notifications. We load completed/cancelled on-demand (last 30 days)
  // to avoid paying unnecessary Firestore reads while on the active tab.
  const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const archivedUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const needsArchived = statusFilter === 'completed' || statusFilter === 'cancelled' || statusFilter === 'all';

    if (needsArchived && !archivedUnsubRef.current) {
      // Subscribe once; unsubscribe on component unmount.
      setArchivedLoading(true);
      const q = query(
        collection(firestoreDb, 'orders'),
        where('status', 'in', ['completed', 'cancelled'])
      );
      archivedUnsubRef.current = onSnapshot(
        q,
        (snap) => {
          const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
          const docs: Order[] = snap.docs
            .map((d) => {
              const data = d.data();
              let normalizedDate = null;
              if (data.createdAt) {
                if (typeof data.createdAt.toDate === 'function') {
                  normalizedDate = data.createdAt.toDate();
                } else if (data.createdAt.seconds) {
                  normalizedDate = new Date(data.createdAt.seconds * 1000);
                }
              }
              return { id: d.id, ...data, createdAt: normalizedDate } as Order;
            })
            .filter((order) => {
              if (!order.createdAt) return true;
              return new Date(order.createdAt).getTime() >= cutoffTime;
            });
          setArchivedOrders(docs);
          setArchivedLoading(false);
        },
        (err) => {
          console.error('Failed to load archived orders:', err);
          setArchivedLoading(false);
        }
      );
    }

    return () => {
      // Only unsubscribe on full component unmount, not on every filter change.
    };
  }, [statusFilter]);

  // Clean up archived subscription when component unmounts
  useEffect(() => {
    return () => {
      archivedUnsubRef.current?.();
    };
  }, []);

  // Merge active (pending/processing) + archived (completed/cancelled) into one list
  const orders = React.useMemo(() => {
    const merged = [...activeOrders, ...archivedOrders];
    merged.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
    return merged;
  }, [activeOrders, archivedOrders]);

  const loading = activeLoading || archivedLoading;

  // ── Online Sales History ───────────
  const { data: allSales, loading: salesLoading } = useCollection<Sale>('sales');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistorySale, setSelectedHistorySale] = useState<Sale | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const onlineHistory = React.useMemo(() => {
    return allSales
      .filter((s) => s.source === 'online')
      .sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });
  }, [allSales]);

  const historyLoading = salesLoading;

  // Filter and search orders
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const lowerQuery = searchQuery.toLowerCase();
    const matchesSearch =
      order.orderId.toLowerCase().includes(lowerQuery) ||
      (order.customer?.name || '').toLowerCase().includes(lowerQuery) ||
      (order.customer?.phone || '').includes(lowerQuery);
    return matchesStatus && matchesSearch;
  });

  // Count helper
  const getCount = (status: 'all' | 'pending' | 'processing' | 'completed' | 'cancelled') => {
    if (status === 'all') return orders.length;
    return orders.filter((o) => o.status === status).length;
  };

  // 1. Accept Order Flow
  const handleAcceptOrder = async (order: Order) => {
    if (
      !(await confirm(`Are you sure you want to accept Order ${order.orderId}? This changes its status to Processing.`, {
        title: 'Accept Order',
        confirmText: 'Accept'
      }))
    ) {
      return;
    }

    try {
      const orderRef = doc(firestoreDb, 'orders', order.id);
      await updateDoc(orderRef, { status: 'processing' });
      await logAudit(
        'ONLINE_ORDER_ACCEPTED',
        `Accepted online order: ${order.orderId}`,
        currentUser?.username || 'Unknown'
      );
      showToast(`✓ Order ${order.orderId} accepted (Processing)`, 'success');
      
      setSelectedOrder((prev) => (prev && prev.id === order.id ? { ...prev, status: 'processing' } : prev));
    } catch (err: any) {
      console.error('Failed to accept order:', err);
      showToast(`Failed to accept order: ${err.message || err}`, 'error');
    }
  };

  // 2. Cancel Order Flow
  const handleCancelOrder = async (order: Order) => {
    if (
      !(await confirm(
        `Are you sure you want to cancel Order ${order.orderId}? This will automatically RESTORE the product inventory quantities in the database. This action cannot be undone.`,
        {
          title: 'Cancel Order & Restore Stock',
          confirmText: 'Yes, Cancel Order',
          type: 'danger'
        }
      ))
    ) {
      return;
    }

    try {
      const orderRef = doc(firestoreDb, 'orders', order.id);

      await runTransaction(firestoreDb, async (transaction) => {
        // Bug 1 fix: ALL reads must happen BEFORE any writes in a Firestore transaction.
        // Previously, reads and writes were interleaved inside a single loop, which caused
        // Firestore to reject the entire transaction for any order with more than one product.

        // STEP 1 — Read order document
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) {
          throw new Error('Order does not exist in database.');
        }
        const orderData = orderSnap.data() as Order;
        if (orderData.status === 'cancelled') {
          throw new Error('Order is already cancelled.');
        }
        if (orderData.status === 'completed') {
          throw new Error('Cannot cancel an already completed order.');
        }

        // STEP 2 — Read ALL product documents first (no writes yet)
        const productReads: Array<{ ref: any; snap: any; finSnap: any; item: any }> = [];
        for (const item of orderData.items) {
          const productRef = doc(firestoreDb, 'products', item.id);
          const finRef = doc(firestoreDb, 'products', item.id, 'privateData', 'financials');
          const [productSnap, finSnap] = await Promise.all([
            transaction.get(productRef),
            transaction.get(finRef)
          ]);
          productReads.push({ ref: productRef, snap: productSnap, finSnap, item });
        }

        // STEP 3 — Perform ALL writes after all reads are complete
        for (const { ref, snap, finSnap, item } of productReads) {
          if (snap.exists()) {
            const dbQty = snap.data().quantity || 0;
            const finData = finSnap?.exists() ? finSnap.data() : null;
            const unitCost = finData?.buyPrice ?? finData?.costPrice ?? snap.data().buyPrice ?? 0;
            const auditLogId = `audit_order_cancel_${order.id}_${item.id}`;
            transaction.update(ref, {
              quantity: dbQty + item.quantity,
              stockValue: (dbQty + item.quantity) * unitCost,
              auditLogId
            });

            const auditRef = doc(firestoreDb, 'auditLogs', auditLogId);
            transaction.set(auditRef, {
              id: auditLogId,
              action: 'ORDER_RESTOCK',
              details: `Restocked ${item.quantity} units of ${item.name} from cancelled order ${order.orderId}`,
              date: new Date().toISOString(),
              created_at: new Date().toISOString()
            });
          }
        }

        transaction.update(orderRef, { status: 'cancelled' });
      });

      emitDashboardRefresh();

      await logAudit(
        'ONLINE_ORDER_CANCELLED',
        `Cancelled online order: ${order.orderId} and returned items to stock.`,
        currentUser?.username || 'Unknown'
      );
      showToast(`✓ Order ${order.orderId} cancelled & stock restored.`, 'success');
      
      setSelectedOrder((prev) => (prev && prev.id === order.id ? { ...prev, status: 'cancelled' } : prev));
      setIsDetailModalOpen(false);
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      showToast(`Failed to cancel order: ${err.message || err}`, 'error');
    }
  };

  const handleCompleteOrder = async (order: Order, paymentMethod: PaymentMethod) => {
    setIsCompleting(true);
    const orderRef = doc(firestoreDb, 'orders', order.id);
    let fulfillmentClaimed = false;

    try {
      // Bug 3 fix: Atomically claim the fulfillment slot to prevent race conditions
      // when two staff members click "Complete" at the same time.
      // Bug 7 fix: Capture fresh items from Firestore inside the transaction
      // rather than using the potentially stale local React state.
      let freshItems: OrderItem[] = [];
      await runTransaction(firestoreDb, async (transaction) => {
        const freshSnap = await transaction.get(orderRef);
        if (!freshSnap.exists()) throw new Error('Order not found in database.');
        const freshData = freshSnap.data()!;
        if (freshData.status === 'completed' || freshData.status === 'cancelled' || freshData.fulfillmentProcessed) {
          throw new Error('ALREADY_PROCESSED');
        }
        // Capture fresh items from Firestore (Bug 7 fix)
        freshItems = (freshData.items || []) as OrderItem[];
        // Atomically mark as being processed to prevent concurrent double-fulfilment (Bug 3 fix)
        transaction.update(orderRef, { fulfillmentProcessed: true });
      });

      fulfillmentClaimed = true;

      // Build sale items using fresh Firestore data
      const saleItems = [];
      for (const item of freshItems) {
        const localProduct = await productsRepo.getById(item.id);
        saleItems.push({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
          costPrice: localProduct ? localProduct.buyPrice : item.price
        });
      }

      let matchedCust = null;
      if (order.linkedPosCustomerId) {
        matchedCust = await customersRepo.getById(order.linkedPosCustomerId);
      }

      // Bug 2 fix: Stock deduction REMOVED from here.
      // Inventory is already deducted atomically by the ecommerce Cart.tsx
      // transaction at the moment the customer places the order.
      // Deducting again here was causing double stock removal
      // (e.g. 1 item purchased → 2 units removed from stock).

      const formattedInvoiceNo = await fetchNextInvoiceNo();

      await salesRepo.create({
        ...(matchedCust?.id ? { customerId: matchedCust.id } : {}),
        customerName: matchedCust?.name || order.customer.name || 'Online Customer',
        date: new Date(),
        totalAmount: order.total,
        discount: 0,
        finalAmount: order.total,
        paymentMethod,
        status: SaleStatus.COMPLETED,
        items: saleItems,
        invoiceNo: formattedInvoiceNo,
        source: 'online',
        onlineOrderId: order.orderId
      });

      await updateDoc(orderRef, { 
        status: 'completed'
        // fulfillmentProcessed is already set atomically in the transaction above
      });

      emitDashboardRefresh();

      await logAudit(
        'ONLINE_ORDER_COMPLETED',
        `Completed online order ${order.orderId} and recorded sale ${formattedInvoiceNo} via ${paymentMethod}`,
        currentUser?.username || 'Unknown'
      );

      showToast(`✓ Order ${order.orderId} fulfilled successfully! Recorded POS Sale ${formattedInvoiceNo}.`, 'success');
      
      setCompletingPaymentMethod(null);
      setIsDetailModalOpen(false);
    } catch (err: any) {
      if (fulfillmentClaimed) {
        try {
          await updateDoc(orderRef, { fulfillmentProcessed: false });
        } catch (rollbackErr) {
          console.error('Failed to rollback fulfillmentProcessed flag:', rollbackErr);
        }
      }
      if (err.message === 'ALREADY_PROCESSED') {
        showToast('This order has already been processed.', 'info');
        setCompletingPaymentMethod(null);
        setIsDetailModalOpen(false);
        return;
      }
      console.error('Failed to complete online order:', err);
      showToast(`Fulfillment transaction failed: ${err.message || err}`, 'error');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleApproveCreditOrder = async (order: Order) => {
    const customerId = order.linkedPosCustomerId;
    if (!customerId) {
      showToast('Error: This order is not linked to any POS customer profile.', 'error');
      return;
    }

    const initialDeposit = (order.amountPaid || 0);
    const initialBalance = order.balanceRemaining ?? (order.total - initialDeposit);

    if (
      !(await confirm(
        `Are you sure you want to APPROVE credit for Order ${order.orderId}? This will increase the customer's outstanding balance by ₦${initialBalance.toLocaleString()}${initialDeposit > 0 ? ` (Deposit of ₦${initialDeposit.toLocaleString()} paid via bank transfer)` : ''} and log the transaction.`,
        {
          title: 'Approve Credit Purchase',
          confirmText: 'Yes, Approve Credit',
          type: 'warning'
        }
      ))
    ) {
      return;
    }

    setIsCompleting(true);
    const orderRef = doc(firestoreDb, 'orders', order.id);
    let creditClaimed = false;

    try {
      let freshItems: OrderItem[] = [];
      let freshOrderData: any = null;
      await runTransaction(firestoreDb, async (transaction) => {
        const freshSnap = await transaction.get(orderRef);
        if (!freshSnap.exists()) throw new Error('Order not found in database.');
        const freshData = freshSnap.data()!;
        if (freshData.creditProcessed || freshData.status === 'completed' || freshData.status === 'cancelled') {
          throw new Error('ALREADY_PROCESSED');
        }
        freshItems = (freshData.items || []) as OrderItem[];
        freshOrderData = freshData;
        transaction.update(orderRef, { creditProcessed: true });
      });

      creditClaimed = true;

      const effectiveCustomerId = freshOrderData?.linkedPosCustomerId || customerId;
      const freshCustomer = await customersRepo.getById(effectiveCustomerId);
      if (!freshCustomer) {
        throw new Error('Customer profile not found in database.');
      }

      const depositPaid = Number(freshOrderData?.amountPaid ?? order.amountPaid) || 0;
      const isDepositOrder = (freshOrderData?.isPartialPayment ?? order.isPartialPayment) || depositPaid > 0;
      const orderTotal = Number(freshOrderData?.total ?? order.total) || 0;
      const balanceRemaining = freshOrderData?.balanceRemaining !== undefined
        ? Number(freshOrderData.balanceRemaining)
        : (order.balanceRemaining !== undefined ? Number(order.balanceRemaining) : Math.max(0, orderTotal - depositPaid));

      const currentDebt = freshCustomer.currentDebt || 0;
      const creditLimit = freshCustomer.creditLimit || 0;
      if (currentDebt + balanceRemaining > creditLimit) {
        throw new Error(`Insufficient Credit Limit. Current Debt: ₦${currentDebt.toLocaleString()}, Available Credit: ₦${Math.max(0, creditLimit - currentDebt).toLocaleString()}, Credit Balance to Charge: ₦${balanceRemaining.toLocaleString()}`);
      }

      // Build sale items using fresh Firestore data (Bug 7 fix)
      const saleItems = [];
      for (const item of freshItems) {
        const localProduct = await productsRepo.getById(item.id);
        saleItems.push({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
          costPrice: localProduct ? localProduct.buyPrice : item.price
        });
      }

      const formattedInvoiceNo = await fetchNextInvoiceNo();
      const newDebt = currentDebt + balanceRemaining;

      await customersRepo.update(freshCustomer.id!, {
        currentDebt: newDebt,
      });

      const debtInfo = {
        previousDebt: currentDebt,
        thisSaleDebt: balanceRemaining,
        newDebt: newDebt,
        creditLimit: freshCustomer.creditLimit || 0
      };

      if (isDepositOrder && depositPaid > 0) {
        await salesRepo.create({
          customerId: freshCustomer.id,
          customerName: freshCustomer.name,
          date: new Date(),
          totalAmount: orderTotal,
          discount: 0,
          finalAmount: orderTotal,
          amountPaid: depositPaid,
          debtInfo,
          paymentMethod: PaymentMethod.MULTIPAY,
          paymentMethods: [
            { method: PaymentMethod.TRANSFER, amount: depositPaid },
            { method: PaymentMethod.CREDIT, amount: balanceRemaining }
          ],
          status: SaleStatus.COMPLETED,
          items: saleItems,
          invoiceNo: formattedInvoiceNo,
          source: 'online',
          onlineOrderId: order.orderId
        });
      } else {
        await salesRepo.create({
          customerId: freshCustomer.id,
          customerName: freshCustomer.name,
          date: new Date(),
          totalAmount: orderTotal,
          discount: 0,
          finalAmount: orderTotal,
          amountPaid: 0,
          debtInfo,
          paymentMethod: PaymentMethod.CREDIT,
          status: SaleStatus.COMPLETED,
          items: saleItems,
          invoiceNo: formattedInvoiceNo,
          source: 'online',
          onlineOrderId: order.orderId
        });
      }

      const updatedCustomer = { ...freshCustomer, currentDebt: newDebt };

      await updateDoc(orderRef, {
        status: 'completed'
      });

      emitDashboardRefresh();

      // Sync credit info in background
      syncCreditInfoToShopUser(updatedCustomer);

      await logAudit(
        'ONLINE_CREDIT_ORDER_APPROVED',
        `Approved credit order ${order.orderId} (₦${orderTotal}${isDepositOrder ? ` — ₦${depositPaid} deposit, ₦${balanceRemaining} credit` : ''}) for customer ${updatedCustomer.name}. Recorded POS Sale ${formattedInvoiceNo}.`,
        currentUser?.username || 'Unknown'
      );

      showToast(`✓ Credit approved successfully! Recorded POS Sale ${formattedInvoiceNo}.`, 'success');
      setIsDetailModalOpen(false);
    } catch (err: any) {
      if (creditClaimed) {
        // Rollback creditProcessed flag so the order is not permanently bricked
        try {
          await updateDoc(orderRef, { creditProcessed: false });
        } catch (rollbackErr) {
          console.error('Failed to rollback creditProcessed flag:', rollbackErr);
        }
      }
      if (err.message === 'ALREADY_PROCESSED') {
        showToast('This order has already been processed.', 'info');
        setIsDetailModalOpen(false);
        return;
      }
      console.error('Failed to approve credit order:', err);
      showToast(`Credit approval failed: ${err.message || err}`, 'error');
    } finally {
      setIsCompleting(false);
    }
  };

  const filteredHistory = onlineHistory.filter((s) => {
    const q = historySearch.toLowerCase();
    return (
      (s.onlineOrderId || '').toLowerCase().includes(q) ||
      (s.customerName || '').toLowerCase().includes(q) ||
      (s.invoiceNo || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 md:space-y-6 pb-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-emerald-600" />
            Online Orders
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Real-time feed from ecommerce platform
          </p>
        </div>

        {/* Page Tab Switcher */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setActivePageTab('active')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
              activePageTab === 'active'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Active Orders
            {orders.filter((o) => o.status === 'pending' || o.status === 'processing').length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ml-0.5">
                {orders.filter((o) => o.status === 'pending' || o.status === 'processing').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActivePageTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
              activePageTab === 'history'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
            }`}
          >
            <History className="w-4 h-4" />
            Fulfilled History
          </button>
        </div>
      </div>

      {/* ACTIVE ORDERS TAB */}
      {activePageTab === 'active' && (
        <div className="space-y-4">
        {/* Search */}
        <div className="flex-1 min-w-0 md:max-w-xs relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            className="w-full pl-10 pr-4 py-2 md:py-2.5 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm text-slate-900 placeholder-slate-400"
            placeholder="Search by ID, customer, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center bg-white p-1 rounded-lg border border-slate-200 text-xs md:text-sm gap-1 select-none">
        {(['all', 'pending', 'processing', 'completed', 'cancelled'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-1.5 md:px-4 md:py-2 rounded-md font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${
              statusFilter === tab
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{tab}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                statusFilter === tab
                  ? 'bg-slate-800 text-slate-200'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {getCount(tab)}
            </span>
          </button>
        ))}
      </div>

      {/* Main Order Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-slate-400 mb-3" />
            <p className="text-sm font-medium">Connecting to live feed...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ShoppingBag className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-medium">No online orders found matching filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-slate-600 text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Order ID</th>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Delivery Method</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => {
                      setSelectedOrder(order);
                      setIsDetailModalOpen(true);
                    }}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">{order.orderId}</td>
                    <td className="px-6 py-4 text-slate-500">
                      {order.createdAt ? (
                        <>
                          <div className="font-semibold text-slate-800">
                            {new Date(order.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-[10px] mt-0.5 text-slate-400">
                            {new Date(order.createdAt).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-800 font-bold">{order.customer?.name}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{order.customer?.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      {order.method === 'credit' ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-50 text-violet-700 text-xs border border-violet-200 font-bold w-fit">
                            <CreditCard className="w-3.5 h-3.5" /> Buy on Credit
                          </span>
                          {order.isPartialPayment && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200 w-fit">
                              Deposit: ₦{(order.amountPaid || 0).toLocaleString()}
                            </span>
                          )}
                        </div>
                      ) : order.method === 'pickup' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-xs border border-amber-200">
                          <Store className="w-3.5 h-3.5" /> Pickup
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs border border-indigo-200">
                          <Truck className="w-3.5 h-3.5" /> Delivery
                        </span>
                      )}
                      {order.method === 'proof' && (
                        <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 uppercase">
                          Paid (Receipt)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-black text-slate-900">
                      <div>₦{order.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      {order.isPartialPayment && (
                        <div className="text-[10px] font-bold text-slate-500 mt-0.5 whitespace-nowrap">
                          <span className="text-emerald-600">₦{(order.amountPaid || 0).toLocaleString()} paid</span>
                          {' · '}
                          <span className="text-violet-600">₦{(order.balanceRemaining ?? (order.total - (order.amountPaid || 0))).toLocaleString()} credit</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold capitalize select-none ${
                          order.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : order.status === 'processing'
                            ? 'bg-blue-100 text-blue-800 animate-pulse'
                            : order.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrder(order);
                          setIsDetailModalOpen(true);
                        }}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                      >
                        <Eye className="w-4.5 h-4.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      )}

      {/* FULFILLED HISTORY TAB */}
      {activePageTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm text-slate-900 placeholder-slate-400"
                placeholder="Search by Order ID, customer name, invoice..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {historyLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-slate-300 mb-3" />
                <p className="text-sm font-medium">Loading history...</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <History className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-500">No fulfilled online orders yet.</p>
                <p className="text-xs text-slate-400 mt-1">Completed online orders will appear here with their receipts.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-slate-600 text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Online Order ID</th>
                      <th className="px-6 py-4">Invoice No.</th>
                      <th className="px-6 py-4">Date Fulfilled</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4">Payment</th>
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredHistory.map((sale) => (
                      <tr
                        key={sale.id}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                        onClick={() => { setSelectedHistorySale(sale); setIsReceiptModalOpen(true); }}
                      >
                        <td className="px-6 py-4 font-mono font-bold text-emerald-700">
                          {sale.onlineOrderId || '—'}
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-600">
                          {sale.invoiceNo || '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          <div className="font-semibold text-slate-800">
                            {new Date(sale.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-[10px] mt-0.5 text-slate-400">
                            {new Date(sale.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-slate-800 font-bold">{sale.customerName || 'Online Customer'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                            {sale.paymentMethod}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-black text-slate-900">
                          ₦{(sale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedHistorySale(sale); setIsReceiptModalOpen(true); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          >
                            <ReceiptText className="w-3.5 h-3.5" /> View Receipt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Online Sale Receipt Modal */}
      {isReceiptModalOpen && selectedHistorySale && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs p-2 md:p-4 overflow-y-auto"
          id="printable-receipt"
        >
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200 my-4">

            {/* Modal header — hidden when printing */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center no-print">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Online Sale Receipt</span>
                <h2 className="text-lg font-black font-mono tracking-tight text-white mt-0.5">
                  {selectedHistorySale.onlineOrderId || selectedHistorySale.invoiceNo}
                </h2>
              </div>
              <button
                onClick={() => { setIsReceiptModalOpen(false); setSelectedHistorySale(null); }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* ── Thermal receipt body ── */}
            <div id="receipt-content" className="p-4 md:p-6 bg-white flex justify-center">
              <div className="font-mono text-slate-800 text-xs leading-tight w-full max-w-[302px]">

                {/* Store Header */}
                <div className="text-center mb-3">
                  <h1 className="text-base font-bold mb-0.5">Ganewa Shopping Mall Kurfi</h1>
                  <p className="text-[10px] text-slate-600 uppercase">Tashan Ladan, Mamman Na'antu Street</p>
                  <p className="text-[10px] text-slate-600">GSM: 08031328041, 09121886883</p>
                  <p className="text-[10px] text-slate-600">ganewashoppingmallkurfi@gmail.com</p>
                </div>

                <div className="border-t border-dashed border-slate-400 my-2" />

                {/* Meta */}
                <div className="space-y-0.5 mb-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date:</span>
                    <span>{new Date(selectedHistorySale.date).toLocaleDateString('en-GB')} {new Date(selectedHistorySale.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice:</span>
                    <span className="font-bold">{selectedHistorySale.invoiceNo || selectedHistorySale.onlineOrderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Customer:</span>
                    <span className="uppercase font-bold">{selectedHistorySale.customerName || 'Online Customer'}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-400 my-2" />

                {/* Items */}
                <table className="w-full border-collapse text-[11px] mb-2">
                  <thead>
                    <tr className="border-b border-dashed border-slate-300 text-slate-600">
                      <th className="py-1 text-left font-bold pr-1">#</th>
                      <th className="py-1 text-left font-bold px-1">Item</th>
                      <th className="py-1 text-center font-bold px-1">Qty</th>
                      <th className="py-1 text-right font-bold pl-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedHistorySale.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-1 pr-1 text-slate-500 align-top">{idx + 1}</td>
                        <td className="py-1 px-1 align-top uppercase">{item.productName}</td>
                        <td className="py-1 px-1 text-center align-top">{item.quantity}</td>
                        <td className="py-1 pl-1 text-right align-top font-bold">
                          {(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="border-t border-dashed border-slate-400 my-2" />

                {/* Totals */}
                <div className="space-y-0.5 text-[11px] mb-2">
                  {(selectedHistorySale as any).discount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount:</span>
                      <span>-₦{((selectedHistorySale as any).discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm">
                    <span>TOTAL:</span>
                    <span>₦{(selectedHistorySale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Payment:</span>
                    <span className="uppercase font-bold">{selectedHistorySale.paymentMethod}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-400 my-2" />

                {/* Footer */}
                <div className="text-center text-slate-500 text-[10px] italic mt-2">
                  <p>Mun gode da kasuwancin ku!</p>
                </div>
              </div>
            </div>

            {/* Footer buttons — hidden when printing */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2.5 no-print">
              <button
                onClick={() => { setIsReceiptModalOpen(false); setSelectedHistorySale(null); }}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  if (!selectedHistorySale) return;
                  const saleToPrint = selectedHistorySale;
                  const res = await printThermalReceipt(saleToPrint);
                  if (res.direct) {
                    showToast("Receipt printed directly to thermal printer.", "success");
                  }
                  setIsReceiptModalOpen(false);
                  setSelectedHistorySale(null);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Printer className="w-3.5 h-3.5" /> Thermal Print
              </button>

            </div>
          </div>
        </div>
      )}


      {/* Detail Modal */}
      {isDetailModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white p-5 md:p-6 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Online Order</span>
                <h2 className="text-xl md:text-2xl font-black font-mono tracking-tight text-white mt-0.5">
                  {selectedOrder.orderId}
                </h2>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-400" />
                  <span className="text-xs md:text-sm text-slate-600 font-semibold">
                    Placed on:{' '}
                    {selectedOrder.createdAt
                      ? new Date(selectedOrder.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs md:text-sm text-slate-500 font-bold uppercase">Current Status:</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                      selectedOrder.status === 'pending'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : selectedOrder.status === 'processing'
                        ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                        : selectedOrder.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      Customer Information
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 font-semibold text-slate-700 text-xs md:text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Name</span>
                        <span className="text-slate-800 font-bold">{selectedOrder.customer?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Phone</span>
                        <a
                          href={`tel:${selectedOrder.customer?.phone}`}
                          className="text-emerald-600 hover:underline flex items-center gap-1 font-bold"
                        >
                          {selectedOrder.customer?.phone} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      {selectedOrder.customer?.email && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Email</span>
                          <span className="text-slate-800">{selectedOrder.customer.email}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Delivery Method</span>
                        <span className="text-slate-800 capitalize">
                          {selectedOrder.method === 'proof' ? 'Delivery (Bank Transfer)'
                            : selectedOrder.method === 'credit' ? (selectedOrder.isPartialPayment ? 'Buy on Credit (Partial Deposit)' : 'Buy on Credit')
                            : selectedOrder.method === 'pickup' ? 'Pick in Store'
                            : 'Pay on Delivery'}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-200">
                        <div className="text-slate-400 block mb-1">Shipping Address</div>
                        <div className="text-slate-800 font-bold flex items-start gap-1 bg-white p-2 rounded border border-slate-100 text-xs">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>{selectedOrder.customer?.address}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Credit breakdown & status */}
                  {selectedOrder.method === 'credit' && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-amber-900 uppercase tracking-widest flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                          Credit Details
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          selectedOrder.isPartialPayment
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {selectedOrder.isPartialPayment ? 'Deposit + Credit' : 'Full Store Credit'}
                        </span>
                      </div>

                      <div className="text-xs space-y-1.5 pt-1">
                        <div className="flex justify-between text-slate-600">
                          <span>Total Order Value:</span>
                          <span className="font-bold text-slate-800">₦{selectedOrder.total.toLocaleString()}</span>
                        </div>
                        {selectedOrder.isPartialPayment && (
                          <div className="flex justify-between text-emerald-700 font-medium">
                            <span>Upfront Deposit (Transfer):</span>
                            <span className="font-bold">₦{(selectedOrder.amountPaid || 0).toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-amber-800 font-bold border-t border-amber-200/60 pt-1.5">
                          <span>To Charge to Credit Limit:</span>
                          <span>₦{(selectedOrder.balanceRemaining ?? selectedOrder.total).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Proof of Payment / Proof of Deposit */}
                  {(selectedOrder.method === 'proof' || (selectedOrder.method === 'credit' && selectedOrder.isPartialPayment)) && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        {selectedOrder.method === 'credit' ? 'Proof of Deposit' : 'Proof of Payment'}
                        <span className="normal-case text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">
                          Verify receipt
                        </span>
                      </h3>

                      {(selectedOrder.paidToBankAccount || selectedOrder.payments?.[0]?.bankAccount) ? (
                        <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs space-y-1.5 mb-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-2">
                            Customer Paid Into
                          </p>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 font-semibold">Bank</span>
                            <span className="font-bold text-slate-800">{(selectedOrder.paidToBankAccount || selectedOrder.payments?.[0]?.bankAccount)?.bankName}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 font-semibold">Account No.</span>
                            <span className="font-mono font-bold text-slate-800 tracking-wide">{(selectedOrder.paidToBankAccount || selectedOrder.payments?.[0]?.bankAccount)?.accountNo}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs mb-4 flex items-center gap-2">
                          <Info className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="text-amber-700 font-semibold">No account recorded — customer may have submitted before this feature was added.</span>
                        </div>
                      )}

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center gap-3">
                        {(selectedOrder.proofOfPayment || selectedOrder.payments?.[0]?.proofUrl) ? (
                          <>
                            <ImageWithFallback
                              src={(selectedOrder.proofOfPayment || selectedOrder.payments?.[0]?.proofUrl)!}
                              alt={selectedOrder.method === 'credit' ? 'Proof of deposit' : 'Proof of payment'}
                              onClick={() => setIsProofModalOpen(true)}
                              className="max-h-48 max-w-full rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity object-contain"
                              fallback={
                                <div className="flex flex-col items-center justify-center gap-2 text-slate-400 p-4 border border-dashed border-slate-200 rounded-lg w-full bg-white h-32">
                                  <FileText className="w-8 h-8 text-slate-300" />
                                  <span className="text-xs font-medium">Receipt image failed to load</span>
                                </div>
                              }
                            />
                            <button
                              onClick={() => setIsProofModalOpen(true)}
                              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-1"
                            >
                              Click to expand receipt <ExternalLink className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2 text-slate-400 p-4 border border-dashed border-slate-200 rounded-lg w-full bg-white h-32">
                            <FileText className="w-8 h-8 text-slate-300" />
                            <span className="text-xs font-medium">No proof uploaded</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col h-full justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Items Ordered</h3>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="p-3.5 flex gap-3 items-center">
                          <ImageWithFallback
                            src={item.photo || ''}
                            alt={item.name}
                            className="w-12 h-12 rounded-lg border border-slate-100 object-cover shrink-0"
                            fallback={
                              <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                <ShoppingBag className="w-6 h-6 text-slate-400" />
                              </div>
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-slate-800 font-bold truncate text-xs md:text-sm">{item.name}</h4>
                            <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">
                              ₦{item.price.toLocaleString()} × {item.quantity}
                            </p>
                          </div>
                          <div className="text-right text-xs md:text-sm font-black text-slate-900 shrink-0">
                            ₦{(item.price * item.quantity).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 bg-slate-900 text-white p-5 rounded-2xl shadow-lg shadow-slate-900/10 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Order Amount</span>
                      <span className="text-xl md:text-2xl font-black text-emerald-400">
                        ₦
                        {selectedOrder.total.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    {selectedOrder.isPartialPayment && (
                      <div className="pt-2 border-t border-slate-800 text-xs flex justify-between items-center text-slate-300">
                        <span>Paid Deposit: <strong className="text-emerald-400 font-mono">₦{(selectedOrder.amountPaid || 0).toLocaleString()}</strong></span>
                        <span>Credit Remainder: <strong className="text-amber-400 font-mono">₦{(selectedOrder.balanceRemaining ?? selectedOrder.total).toLocaleString()}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-5 md:p-6 border-t border-slate-200 flex flex-wrap justify-end gap-3 select-none">
              {(selectedOrder.status === 'pending' || selectedOrder.status === 'processing') && (
                <button
                  onClick={() => handleCancelOrder(selectedOrder)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-1.5 transition-colors mr-auto"
                >
                  <XCircle className="w-4 h-4" /> Cancel Order
                </button>
              )}

              {selectedOrder.status === 'pending' && (
                <button
                  onClick={() => handleAcceptOrder(selectedOrder)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/15 transition-all"
                >
                  Accept Order <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {(selectedOrder.status === 'pending' || selectedOrder.status === 'processing') && (
                selectedOrder.method === 'credit' ? (
                  <button
                    disabled={isCompleting}
                    onClick={() => handleApproveCreditOrder(selectedOrder)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/15 transition-all disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" /> {isCompleting ? 'Approving...' : selectedOrder.isPartialPayment ? `Approve Credit (₦${(selectedOrder.balanceRemaining ?? selectedOrder.total).toLocaleString()} Debt)` : 'Approve Credit Order'}
                  </button>
                ) : (
                  <button
                    disabled={isCompleting}
                    onClick={() => setCompletingPaymentMethod(selectedOrder.method === 'proof' ? PaymentMethod.TRANSFER : PaymentMethod.CASH)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/15 transition-all disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" /> Fulfill / Complete
                  </button>
                )
              )}

              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-5 py-2 rounded-xl text-xs md:text-sm font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {completingPaymentMethod !== null && selectedOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <CheckCircle className="w-5.5 h-5.5 text-emerald-600" />
                Record POS Sale Payment
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Please select the actual payment method received to finalize and log this transaction in POS accounting.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {selectedOrder.method === 'proof' && (
                <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-100 flex items-start gap-2 mb-2 font-semibold">
                  <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    The customer chose Bank Transfer and uploaded a payment receipt. Verification is recommended before proceeding.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {(['CASH', 'TRANSFER', 'CARD'] as const).map((method) => {
                  const label = method === 'CASH' ? 'Cash Payment' : method === 'TRANSFER' ? 'Bank Transfer' : 'Card POS Terminal';
                  const isPreselected = selectedOrder.method === 'proof' && method === 'TRANSFER';
                  return (
                    <button
                      key={method}
                      onClick={() => setCompletingPaymentMethod(PaymentMethod[method])}
                      className={`w-full p-4 rounded-xl border flex items-center justify-between text-left transition-all ${
                        completingPaymentMethod === PaymentMethod[method]
                          ? 'border-emerald-500 bg-emerald-50/50 text-slate-900 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="font-bold text-sm">
                        {label}
                        {isPreselected && (
                          <span className="ml-2 bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 font-bold uppercase select-none">
                            Customer Selection
                          </span>
                        )}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2.5">
              <button
                onClick={() => setCompletingPaymentMethod(null)}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all"
              >
                Go Back
              </button>
              <button
                disabled={isCompleting}
                onClick={() => handleCompleteOrder(selectedOrder, completingPaymentMethod)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs md:text-sm font-black flex items-center gap-1.5 shadow-md shadow-emerald-500/15 disabled:opacity-50 transition-all"
              >
                {isCompleting ? (
                  <>
                    <RefreshCw className="w-4.5 h-4.5 animate-spin" /> Recording Sale...
                  </>
                ) : (
                  <>
                    Confirm & Complete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isProofModalOpen && selectedOrder && (selectedOrder.proofOfPayment || selectedOrder.payments?.[0]?.proofUrl) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-150">
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setIsProofModalOpen(false)}
              className="absolute -top-12 right-0 text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-all"
            >
              <XCircle className="w-8 h-8" />
            </button>
            <ImageWithFallback
              src={(selectedOrder.proofOfPayment || selectedOrder.payments?.[0]?.proofUrl)!}
              alt="Proof of Payment Full"
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl border border-white/10 object-contain"
              fallback={
                <div className="text-white text-center p-8 bg-slate-800 rounded-lg border border-white/10 shadow-2xl flex flex-col items-center gap-3">
                  <FileText className="w-12 h-12 text-slate-500" />
                  <p className="text-sm">Failed to load proof of payment receipt image.</p>
                  <p className="text-xs text-slate-400">This can happen if you are offline or the resource could not be reached.</p>
                </div>
              }
            />
            <div className="text-white text-xs font-medium text-center mt-4 bg-slate-900/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 shadow-md">
              Verification Mode — Press Esc or Click Close button to exit zoom view
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
