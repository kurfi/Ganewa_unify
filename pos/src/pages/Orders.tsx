import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useDialog } from '../contexts/DialogContext';
import { db as dexieDb, logAudit } from '../db/db';
import { db as firestoreDb } from '../firebase/config';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  runTransaction
} from 'firebase/firestore';
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
  Info
} from 'lucide-react';
import { PaymentMethod, SaleStatus } from '../types';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  photo: string | null;
}

interface Order {
  id: string; // Firestore doc ID
  orderId: string; // Custom readable GW-XXXXXX ID
  userId: string | null;
  items: OrderItem[];
  total: number;
  customer: {
    name: string;
    phone: string;
    address: string;
    email: string | null;
  };
  method: 'pickup' | 'delivery' | 'proof'; // 'proof' represents bank transfer payment upload
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  createdAt: any;
  proofOfPayment?: string | null;
}

const Orders: React.FC = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { confirm, alert } = useDialog();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'cancelled'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completingPaymentMethod, setCompletingPaymentMethod] = useState<PaymentMethod | null>(null);

  // Subscribe to real-time order updates from Firestore
  useEffect(() => {
    setLoading(true);
    const colRef = collection(firestoreDb, 'orders');
    const q = query(colRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedOrders: Order[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          // Convert firestore timestamp
          let normalizedDate = null;
          if (data.createdAt) {
            if (typeof data.createdAt.toDate === 'function') {
              normalizedDate = data.createdAt.toDate();
            } else if (data.createdAt.seconds) {
              normalizedDate = new Date(data.createdAt.seconds * 1000);
            }
          }
          return {
            id: doc.id,
            ...data,
            createdAt: normalizedDate
          } as Order;
        });
        setOrders(fetchedOrders);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching online orders:', error);
        showToast('Failed to load online orders from server.', 'error');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

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
      
      // Update selected order in state to reflect change in detail modal
      setSelectedOrder((prev) => (prev && prev.id === order.id ? { ...prev, status: 'processing' } : prev));
    } catch (err: any) {
      console.error('Failed to accept order:', err);
      showToast(`Failed to accept order: ${err.message || err}`, 'error');
    }
  };

  // 2. Cancel Order Flow (Atomically Increments/Restores Stock in Firestore)
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

        // Increment each product's quantity back in Firestore
        for (const item of orderData.items) {
          const productRef = doc(firestoreDb, 'products', item.id);
          const productSnap = await transaction.get(productRef);
          if (productSnap.exists()) {
            const dbQty = productSnap.data().quantity || 0;
            transaction.update(productRef, {
              quantity: dbQty + item.quantity
            });
          }
        }

        // Set status to cancelled
        transaction.update(orderRef, { status: 'cancelled' });
      });

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

  // 3. Complete Order Flow (Updates Firestore & Writes Sale in local Dexie for Reporting)
  const handleCompleteOrder = async (order: Order, paymentMethod: PaymentMethod) => {
    setIsCompleting(true);

    try {
      // Step A: Read local DB products to gather cost prices (margins) for the sale report
      const saleItems = [];
      for (const item of order.items) {
        const localProduct = await dexieDb.products.get(item.id);
        saleItems.push({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
          costPrice: localProduct ? localProduct.buyPrice : item.price
        });
      }

      // Step B: Match customer by phone to record customer sales analytics if possible
      const matchedCust = await dexieDb.customers.where('phone').equals(order.customer.phone).first();

      // Step C: Run Dexie transaction to generate invoice number and add POS sale record
      const { invoiceNo } = await dexieDb.transaction(
        'rw',
        [dexieDb.sales, dexieDb.settings, dexieDb.customers, dexieDb.auditLogs],
        async () => {
          // Generate Invoice Number
          const lastInvoiceSetting = await dexieDb.settings.get('lastInvoiceNo');
          let nextInvoiceNo = 1;
          if (lastInvoiceSetting) {
            nextInvoiceNo = parseInt(lastInvoiceSetting.value) + 1;
          }
          const formattedInvoiceNo = `INV-${nextInvoiceNo.toString().padStart(6, '0')}`;
          await dexieDb.settings.put({ key: 'lastInvoiceNo', value: nextInvoiceNo.toString() });

          // Record POS Sale
          await dexieDb.sales.add({
            customerId: matchedCust?.id,
            customerName: matchedCust?.name || order.customer.name || 'Online Customer',
            date: new Date(),
            totalAmount: order.total,
            discount: 0,
            finalAmount: order.total,
            paymentMethod,
            status: SaleStatus.COMPLETED,
            items: saleItems,
            invoiceNo: formattedInvoiceNo
          });

          return { invoiceNo: formattedInvoiceNo };
        }
      );

      // Step D: Update order status to Completed in Firestore
      const orderRef = doc(firestoreDb, 'orders', order.id);
      await updateDoc(orderRef, { status: 'completed' });

      await logAudit(
        'ONLINE_ORDER_COMPLETED',
        `Completed online order ${order.orderId} and recorded sale ${invoiceNo} via ${paymentMethod}`,
        currentUser?.username || 'Unknown'
      );

      showToast(`✓ Order ${order.orderId} fulfilled successfully! Recorded POS Sale ${invoiceNo}.`, 'success');
      
      setCompletingPaymentMethod(null);
      setIsDetailModalOpen(false);
    } catch (err: any) {
      console.error('Failed to complete online order:', err);
      showToast(`Fulfillment transaction failed: ${err.message || err}`, 'error');
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-10">
      {/* Header section */}
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
                            {order.createdAt.toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-[10px] mt-0.5 text-slate-400">
                            {order.createdAt.toLocaleTimeString(undefined, {
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
                      {order.method === 'pickup' ? (
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
                      ₦{order.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      {/* Detail Modal */}
      {isDetailModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
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

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
              {/* Top Banner Status */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-400" />
                  <span className="text-xs md:text-sm text-slate-600 font-semibold">
                    Placed on:{' '}
                    {selectedOrder.createdAt
                      ? selectedOrder.createdAt.toLocaleString(undefined, {
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
                {/* Customer & Payment Detail Block */}
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
                        <span className="text-slate-800 capitalize">{selectedOrder.method === 'proof' ? 'delivery (bank transfer)' : selectedOrder.method}</span>
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

                  {/* Payment Verification Block */}
                  {selectedOrder.proofOfPayment && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        Proof of Payment
                        <span className="normal-case text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">
                          Verify receipt
                        </span>
                      </h3>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center gap-3">
                        <img
                          src={selectedOrder.proofOfPayment}
                          alt="Proof of payment"
                          onClick={() => setIsProofModalOpen(true)}
                          className="max-h-48 max-w-full rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity object-contain"
                        />
                        <button
                          onClick={() => setIsProofModalOpen(true)}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-1"
                        >
                          Click to expand receipt <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Items Ordered List */}
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Items Ordered</h3>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="p-3.5 flex gap-3 items-center">
                          {item.photo ? (
                            <img
                              src={item.photo}
                              alt={item.name}
                              className="w-12 h-12 rounded-lg border border-slate-100 object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                              <ShoppingBag className="w-6 h-6 text-slate-400" />
                            </div>
                          )}
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

                  {/* Summary Total */}
                  <div className="mt-6 bg-slate-900 text-white p-5 rounded-2xl flex justify-between items-center shadow-lg shadow-slate-900/10">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Order Amount</span>
                    <span className="text-xl md:text-2xl font-black text-emerald-400">
                      ₦
                      {selectedOrder.total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-slate-50 p-5 md:p-6 border-t border-slate-200 flex flex-wrap justify-end gap-3 select-none">
              {/* Cancel Button - Allowed for pending or processing */}
              {(selectedOrder.status === 'pending' || selectedOrder.status === 'processing') && (
                <button
                  onClick={() => handleCancelOrder(selectedOrder)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-1.5 transition-colors mr-auto"
                >
                  <XCircle className="w-4 h-4" /> Cancel Order
                </button>
              )}

              {/* Accept Button - Pending only */}
              {selectedOrder.status === 'pending' && (
                <button
                  onClick={() => handleAcceptOrder(selectedOrder)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/15 transition-all"
                >
                  Accept Order <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {/* Complete & Record Sale Button - Processing (or Pending if they skip accept) */}
              {(selectedOrder.status === 'pending' || selectedOrder.status === 'processing') && (
                <button
                  onClick={() => setCompletingPaymentMethod(selectedOrder.method === 'proof' ? PaymentMethod.TRANSFER : PaymentMethod.CASH)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/15 transition-all"
                >
                  <CheckCircle className="w-4 h-4" /> Fulfill / Complete
                </button>
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

      {/* Nested Payment Method Dialog for Order Completion */}
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

      {/* Proof of Payment Zoom Modal */}
      {isProofModalOpen && selectedOrder && selectedOrder.proofOfPayment && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-150">
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setIsProofModalOpen(false)}
              className="absolute -top-12 right-0 text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-all"
            >
              <XCircle className="w-8 h-8" />
            </button>
            <img
              src={selectedOrder.proofOfPayment}
              alt="Proof of Payment Full"
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl border border-white/10 object-contain"
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
