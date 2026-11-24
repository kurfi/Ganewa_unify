import React, { useState, useEffect } from 'react';
import { ShoppingBag, Trash2, Minus, Plus, ChevronLeft, CreditCard, MapPin, Store, Receipt, Upload, CheckCircle2, User, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { uploadToCloudinary } from '../utils/cloudinary';
import { doc, getDoc, collection, serverTimestamp, runTransaction, query, where, documentId, getDocs } from 'firebase/firestore';
import type { Product } from '../types';

const getProductPrice = (item: any, quantity: number): number => {
    if (!item.onlineDiscountTiers || item.onlineDiscountTiers.length === 0) {
        return item.sellPrice || 0;
    }
    const sortedTiers = [...item.onlineDiscountTiers].sort((a, b) => b.minQuantity - a.minQuantity);
    const applicableTier = sortedTiers.find(tier => quantity >= tier.minQuantity);
    return applicableTier ? applicableTier.pricePerUnit : (item.sellPrice || 0);
};

const getNextTierMessage = (item: any, quantity: number): { message: string; savings: number } | null => {
    if (!item.onlineDiscountTiers || item.onlineDiscountTiers.length === 0) {
        return null;
    }
    const sortedTiers = [...item.onlineDiscountTiers].sort((a, b) => a.minQuantity - b.minQuantity);
    const nextTier = sortedTiers.find(tier => tier.minQuantity > quantity);
    if (!nextTier) return null;

    const remaining = nextTier.minQuantity - quantity;
    const currentCostForNextQty = nextTier.minQuantity * (item.sellPrice || 0);
    const discountedCostForNextQty = nextTier.minQuantity * nextTier.pricePerUnit;
    const savings = currentCostForNextQty - discountedCostForNextQty;

    return {
        message: `Add ${remaining} more to unlock "${nextTier.name}" price of ₦${nextTier.pricePerUnit.toLocaleString()}/unit!`,
        savings
    };
};

interface CartItemWithDetails extends Product {
    cartQuantity: number;
}

const MIN_DEPOSIT_PERCENT = 0.3;
const MIN_DEPOSIT_FLOOR = 1000;
const getMinDeposit = (total: number) => {
    if (total <= 1) return 1;
    const computed = Math.round(total * MIN_DEPOSIT_PERCENT);
    const floor = Math.min(MIN_DEPOSIT_FLOOR, Math.round(total * 0.5));
    return Math.min(total - 1, Math.max(floor, computed));
};

export default function Cart() {
    const { cart, removeFromCart, updateQuantity, clearCart } = useCart();
    const { user, profile, openAuthModal } = useAuth();
    const navigate = useNavigate();
    const [cartItems, setCartItems] = useState<CartItemWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [checkoutStep, setCheckoutStep] = useState<'cart' | 'details' | 'success'>('cart');
    const [missingItemIds, setMissingItemIds] = useState<string[]>([]);
    const [checkoutMethod, setCheckoutMethod] = useState<'delivery' | 'pickup' | 'proof' | 'credit'>('delivery'); // Bug 5 fix: renamed 'pod' → 'delivery' to match POS/Firestore expectations
    const [isPartialPayment, setIsPartialPayment] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        address: '',
        email: ''
    });
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [orderId, setOrderId] = useState('');
    const [checkOutInitiated, setCheckOutInitiated] = useState(false);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [bankAccountsError, setBankAccountsError] = useState<string | null>(null);
    const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
    const [submittedBankAccount, setSubmittedBankAccount] = useState<{ id: string; bankName: string; accountNo: string; accountName?: string } | null>(null);
    const [pendingCreditTotal, setPendingCreditTotal] = useState(0);
    const [isSyncingCredit, setIsSyncingCredit] = useState(false);

    // On-demand credit sync trigger if user is linked but creditInfo is missing
    useEffect(() => {
        if (checkoutStep === 'details' && user && profile?.linkedPosCustomerId && !profile?.creditInfo) {
            const triggerCreditSync = async () => {
                setIsSyncingCredit(true);
                try {
                    const syncFn = httpsCallable(functions, 'syncUserCreditInfo');
                    await syncFn();
                } catch (err) {
                    console.error("On-demand credit sync failed:", err);
                } finally {
                    setIsSyncingCredit(false);
                }
            };
            triggerCreditSync();
        }
    }, [checkoutStep, user, profile?.linkedPosCustomerId, profile?.creditInfo]);

    const handleRefreshCredit = async () => {
        if (!user || !profile?.linkedPosCustomerId) return;
        setIsSyncingCredit(true);
        try {
            const syncFn = httpsCallable(functions, 'syncUserCreditInfo');
            await syncFn();
        } catch (err) {
            console.error("Manual credit sync error:", err);
        } finally {
            setIsSyncingCredit(false);
        }
    };

    useEffect(() => {
        if (!user) {
            setPendingCreditTotal(0);
            return;
        }
        const fetchPendingCreditTotal = async () => {
            try {
                // Fetch user orders and filter credit pending/processing status in memory (avoids composite index requirement)
                const qPending = query(
                    collection(db, 'orders'),
                    where('userId', '==', user.uid)
                );
                const snap = await getDocs(qPending);
                const total = snap.docs.reduce((acc, doc) => {
                    const data = doc.data();
                    if (data.method === 'credit' && (data.status === 'pending' || data.status === 'processing')) {
                        return acc + (data.balanceRemaining ?? data.total ?? 0);
                    }
                    return acc;
                }, 0);
                setPendingCreditTotal(total);
            } catch (err) {
                console.error("Error fetching pending credit total:", err);
            }
        };
        fetchPendingCreditTotal();
    }, [user, checkoutStep]);

    useEffect(() => {
        const fetchBankAccounts = async () => {
            if (!user) return; // Wait until authenticated
            try {
                const q = query(
                    collection(db, 'bankAccounts'),
                    where('active', '==', true)
                );
                const snap = await getDocs(q);
                const accounts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (accounts.length === 0) {
                    setBankAccountsError('No active bank accounts are configured. Please contact the store.');
                } else {
                    setBankAccounts(accounts);
                    setBankAccountsError(null);
                }
            } catch (error: any) {
                console.error("Error fetching bank accounts:", error);
                setBankAccountsError('Unable to load payment accounts. Please refresh and try again.');
            }
        };
        fetchBankAccounts();
    }, [user]);

    // Reset account selection and deposit state when checkout method changes
    useEffect(() => {
        if (checkoutMethod !== 'proof' && checkoutMethod !== 'credit') {
            setSelectedBankAccountId(null);
        }
        if (checkoutMethod !== 'credit') {
            setIsPartialPayment(false);
            setDepositAmount('');
        }
    }, [checkoutMethod]);

    useEffect(() => {
        const fetchCartItems = async () => {
            if (cart.length === 0) {
                setCartItems([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const itemIds = cart.map(item => item.id);

                // Bug 6 fix: Firestore 'in' queries are capped at 30 IDs per call.
                // Chunk the IDs and run parallel queries, then merge the results.
                const CHUNK_SIZE = 30;
                const chunks: string[][] = [];
                for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
                    chunks.push(itemIds.slice(i, i + CHUNK_SIZE));
                }
                const querySnapshots = await Promise.all(
                    chunks.map(chunk =>
                        getDocs(query(collection(db, 'products'), where(documentId(), 'in', chunk)))
                    )
                );
                const allDocs = querySnapshots.flatMap(snap => snap.docs);

                const items: CartItemWithDetails[] = allDocs.map(doc => {
                    const cartItem = cart.find(ci => ci.id === doc.id);
                    return {
                        id: doc.id,
                        ...doc.data(),
                        cartQuantity: cartItem?.quantity || 0
                    } as CartItemWithDetails;
                });

                // Detect cart items whose products no longer exist in Firestore
                const fetchedIds = new Set(allDocs.map(doc => doc.id));
                const missing = itemIds.filter(id => !fetchedIds.has(id));
                setMissingItemIds(missing);

                setCartItems(items);
            } catch (error) {
                console.error("Error fetching cart items:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCartItems();
    }, [cart, checkoutStep]);

    const hasStockIssues = cartItems.some(item => item.cartQuantity > (item.quantity || 0)) || missingItemIds.length > 0;

    useEffect(() => {
        if (profile) {
            setFormData((prev: any) => ({
                ...prev,
                name: profile.displayName || prev.name,
                phone: profile.phone || prev.phone,
                address: profile.addresses?.find((a: any) => a.isDefault)?.street || profile.addresses?.[0]?.street || prev.address,
                email: profile.email || prev.email
            }));
        }
    }, [profile]);

    useEffect(() => {
        if (user && checkOutInitiated && checkoutStep === 'cart') {
            setCheckoutStep('details');
            setCheckOutInitiated(false);
        }
    }, [user, checkOutInitiated, checkoutStep]);

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCheckingOut(true);

        try {
            const allowsPartial = checkoutMethod === 'credit';
            const wantsPartial = allowsPartial && isPartialPayment;
            const minDeposit = getMinDeposit(subtotal);
            const parsedDeposit = parseFloat(depositAmount);

            // Guard: bank transfer orders must have an account selected
            if (checkoutMethod === 'proof' && !selectedBankAccountId) {
                alert('Please select a bank account before submitting.');
                setIsCheckingOut(false);
                return;
            }

            // Guard: credit partial payment must have bank account selected & valid deposit amount
            if (checkoutMethod === 'credit' && wantsPartial) {
                if (!selectedBankAccountId) {
                    alert('Please select a bank account for your deposit before submitting.');
                    setIsCheckingOut(false);
                    return;
                }
                if (isNaN(parsedDeposit) || parsedDeposit < minDeposit || parsedDeposit >= subtotal) {
                    alert(`Deposit amount must be at least ₦${minDeposit.toLocaleString()} and less than the order total (₦${subtotal.toLocaleString()}).`);
                    setIsCheckingOut(false);
                    return;
                }
            }

            const needsProof = checkoutMethod === 'proof' || (checkoutMethod === 'credit' && wantsPartial);
            let proofUrl = null;
            if (needsProof) {
                if (!proofFile) {
                    alert(wantsPartial ? 'Please upload Proof of Deposit.' : 'Please upload Proof of Payment.');
                    setIsCheckingOut(false);
                    return;
                }
                if (proofFile.size > 2 * 1024 * 1024) {
                    alert("File is too large. Maximum size is 2MB.");
                    setIsCheckingOut(false);
                    return;
                }
                try {
                    proofUrl = await uploadToCloudinary(proofFile);
                } catch (uploadError) {
                    console.error("Proof upload failed:", uploadError);
                    alert(`Failed to upload ${wantsPartial ? 'Proof of Deposit' : 'Proof of Payment'}. Please try again.`);
                    setIsCheckingOut(false);
                    return;
                }
            }

            const amountPaidNow = checkoutMethod === 'proof' ? subtotal : (wantsPartial ? parsedDeposit : 0);
            const balanceRemaining = Math.max(0, subtotal - amountPaidNow);
            const paymentStatus: 'unpaid' | 'partial' | 'paid' = checkoutMethod === 'proof' ? 'paid' : (wantsPartial ? 'partial' : 'unpaid');

            const now = new Date();
            const datePart = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const uniquePart = `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
            const newOrderId = `GW-${datePart}-${uniquePart}`;

            // Fetch pending credit orders client-side (filtered from single-field userId index) to subtract from availableCredit
            let dbPendingCreditTotal = 0;
            if (checkoutMethod === 'credit') {
                if (!user) throw new Error('NOT_AUTHENTICATED');
                const qPending = query(
                    collection(db, 'orders'),
                    where('userId', '==', user.uid)
                );
                const snapPending = await getDocs(qPending);
                dbPendingCreditTotal = snapPending.docs.reduce((acc, doc) => {
                    const data = doc.data();
                    if (data.method === 'credit' && (data.status === 'pending' || data.status === 'processing')) {
                        return acc + (data.balanceRemaining ?? data.total ?? 0);
                    }
                    return acc;
                }, 0);
            }

            // Call the secure server-side createOrder Cloud Function
            const createOrderFn = httpsCallable<any, { success: boolean; orderId: string; id: string; total: number }>(functions, 'createOrder');
            const result = await createOrderFn({
                items: cartItems.map(item => ({
                    id: item.id!,
                    quantity: item.cartQuantity
                })),
                customer: {
                    name: formData.name,
                    phone: formData.phone,
                    address: checkoutMethod === 'pickup' ? 'PICKUP' : formData.address,
                    email: formData.email || undefined
                },
                method: checkoutMethod,
                notes: `Checkout via ${checkoutMethod}`,
                amountPaidNow,
                proofUrl: proofUrl || null,
                selectedBankAccountId: selectedBankAccountId || null,
                wantsPartial
            });

            const confirmedOrderId = result.data.orderId;

            // Persist the selected account for the success screen before clearing state
            if ((checkoutMethod === 'proof' || wantsPartial) && selectedBankAccountId) {
                const acc = bankAccounts.find(a => a.id === selectedBankAccountId);
                if (acc) setSubmittedBankAccount({ id: acc.id, bankName: acc.bankName, accountNo: acc.accountNo, accountName: acc.accountName });
            }
            setOrderId(confirmedOrderId);
            clearCart();
            setIsPartialPayment(false);
            setDepositAmount('');
            setCheckoutStep('success');
        } catch (error: any) {
            console.error("Error creating order:", error);
            if (error.message && error.message.startsWith('INSUFFICIENT_STOCK:')) {
                const parts = error.message.split(':');
                const name = parts[1];
                const available = parts[2];
                alert(`Sorry, "${name}" only has ${available} items in stock. Please adjust your cart and try again.`);
            } else if (error.message && error.message.startsWith('PRODUCT_NOT_FOUND:')) {
                const name = error.message.split(':')[1];
                alert(`Sorry, the product "${name}" is no longer available in our store.`);
            } else if (error.message === 'USER_PROFILE_NOT_FOUND') {
                alert("User profile not found. Please sign in again.");
            } else if (error.message === 'NOT_LINKED') {
                alert("Your account is not linked to a store profile. Please link your account in settings.");
            } else if (error.message === 'CREDIT_NOT_ENABLED') {
                alert("Credit purchases are not enabled on your store profile. Please contact cashier.");
            } else if (error.message && error.message.startsWith('INSUFFICIENT_CREDIT:')) {
                const available = parseFloat(error.message.split(':')[1]) || 0;
                alert(`Insufficient credit balance. Available: ₦${available.toLocaleString()}. Please remove some items or clear outstanding balance.`);
            } else {
                alert("Failed to place order. Please try again.");
            }
        } finally {
            setIsCheckingOut(false);
        }
    };

    const originalSubtotal = cartItems.reduce((acc: number, item: any) => acc + ((item.sellPrice || 0) * item.cartQuantity), 0);
    const subtotal = cartItems.reduce((acc: number, item: any) => acc + (getProductPrice(item, item.cartQuantity) * item.cartQuantity), 0);
    const discountApplied = originalSubtotal - subtotal;

    const handleProceedToCheckout = () => {
        if (!user) {
            setCheckOutInitiated(true);
            openAuthModal('login');
        } else {
            setCheckoutStep('details');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
            </div>
        );
    }

    if (checkoutStep === 'success') {
        const successConfig = {
            delivery: {
                title: 'Order Confirmed!',
                message: "Your order has been placed. Please have your payment ready when our delivery agent arrives at your address.",
                icon: <MapPin className="w-16 h-16" />,
                status: 'Payment on Delivery'
            },
            pickup: {
                title: 'Ready for Pickup!',
                message: "Your order is being prepared for pickup. Please visit Ganewa Shopping Mall Kurfi with your Order ID.",
                icon: <Store className="w-16 h-16" />,
                status: 'Pick in Store'
            },
            proof: {
                title: 'Payment Received!',
                message: "We've received your proof of payment. Our team will verify it and dispatch your items shortly.",
                icon: <CheckCircle2 className="w-16 h-16" />,
                status: 'Pending Verification'
            },
            credit: {
                title: 'Order Submitted!',
                message: "Your credit order has been submitted and is awaiting approval by the store admin. You can track its status in your account profile.",
                icon: <CreditCard className="w-16 h-16" />,
                status: 'Credit Purchase Pending Approval'
            }
        }[checkoutMethod];

        return (
            <div className="min-h-screen bg-[#FDFDFD] text-slate-900 flex flex-col items-center justify-center px-4 py-20">
                <div className="bg-white p-5 sm:p-8 md:p-12 rounded-3xl sm:rounded-[40px] border border-slate-100 shadow-2xl flex flex-col items-center text-center max-w-lg w-full animate-in zoom-in fade-in duration-500">
                    <div className="bg-emerald-100 text-emerald-600 p-5 sm:p-8 rounded-full mb-6 sm:mb-8">
                        {successConfig.icon}
                    </div>
                    <h1 className="text-4xl font-black text-slate-950 mb-4 tracking-tight">{successConfig.title}</h1>
                    <p className="text-slate-500 font-medium mb-10">{successConfig.message}</p>
                    <div className="bg-slate-50 w-full p-4 sm:p-6 rounded-2xl sm:rounded-3xl mb-6 sm:mb-10 text-left">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                            <span>Order ID</span>
                            <span className="text-slate-950 font-black">{orderId}</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                            <span>Method</span>
                            <span className="text-emerald-600">{successConfig.status}</span>
                        </div>
                    </div>
                    {checkoutMethod === 'proof' && submittedBankAccount && (
                        <div className="bg-emerald-50/40 border border-emerald-100/50 w-full p-5 rounded-2xl sm:rounded-3xl mb-6 sm:mb-10 text-left">
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800 mb-3">If you haven't completed your transfer, please pay into:</p>
                            <div className="text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-900">{submittedBankAccount.bankName}</span>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(submittedBankAccount.accountNo);
                                            alert("Account number copied!");
                                        }}
                                        className="text-[9px] font-black text-emerald-600 uppercase tracking-widest"
                                    >
                                        Copy
                                    </button>
                                </div>
                                <p className="font-mono text-slate-700 font-bold mt-0.5">{submittedBankAccount.accountNo}</p>
                                {submittedBankAccount.accountName && (
                                    <p className="text-[10px] text-slate-400 font-medium">{submittedBankAccount.accountName}</p>
                                )}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => navigate('/')}
                        className="w-full py-4 sm:py-6 bg-slate-950 text-white rounded-2xl sm:rounded-[30px] font-black uppercase text-xs tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-slate-200"
                    >
                        Continue Shopping
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-slate-900 flex flex-col">
            <nav className="glass-nav sticky top-0 px-4 py-4 md:px-12 flex items-center justify-between border-b border-slate-100 z-50">
                <Link to="/" className="flex items-center gap-2.5 group cursor-pointer">
                    <div className="bg-emerald-600 p-2.5 rounded-2xl text-white shadow-lg shadow-emerald-200 group-hover:rotate-12 transition-transform">
                        <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                        <span className="text-xl font-black block leading-none tracking-tight text-slate-900">GANEWA</span>
                        <span className="text-[10px] font-black text-emerald-600 tracking-[0.2em] uppercase block mt-1">Shopping Mall</span>
                    </div>
                </Link>
                {checkoutStep === 'details' ? (
                    <button
                        onClick={() => setCheckoutStep('cart')}
                        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-600 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back to Cart
                    </button>
                ) : (
                    <Link to="/" className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-600 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                        Back to Store
                    </Link>
                )}
            </nav>

            <main className="flex-1 max-w-7xl mx-auto w-full px-2 sm:px-4 md:px-12 py-6 sm:py-12 md:py-20">
                <div className="flex items-center gap-3 mb-10">
                    <div className="h-px w-8 bg-emerald-600"></div>
                    <h1 className="text-4xl md:text-6xl font-black text-slate-950">
                        {checkoutStep === 'cart' ? 'Your Cart.' : 'Checkout.'}
                    </h1>
                </div>

                {cartItems.length === 0 && checkoutStep === 'cart' ? (
                    <div className="text-center py-12 sm:py-24 bg-white rounded-3xl sm:rounded-[50px] border border-slate-100 shadow-sm flex flex-col items-center px-4">
                        <div className="bg-slate-50 p-6 sm:p-10 rounded-full mb-6 sm:mb-8 text-slate-200">
                            <ShoppingBag className="w-12 h-12 sm:w-20 sm:h-20" />
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black text-slate-950 mb-3">Cart is empty.</h2>
                        <p className="text-slate-500 max-w-sm text-sm font-medium">Looks like you haven't added anything to your cart yet.</p>
                        <Link to="/" className="mt-6 sm:mt-10 px-6 sm:px-8 py-3.5 sm:py-4 bg-slate-950 text-white rounded-2xl sm:rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-slate-200">
                            Start Shopping
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                        {/* Main Content Area */}
                        <div className="lg:col-span-2 space-y-6">
                            {checkoutStep === 'cart' ? (
                                <>
                                    {!user && cartItems.length > 0 && (
                                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl sm:rounded-[30px] p-4 sm:p-6 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 sm:gap-4">
                                                <div className="bg-emerald-100 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl text-emerald-600">
                                                    <User className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-xs sm:text-[13px] font-black text-slate-900 uppercase tracking-widest">Returning customer?</p>
                                                    <p className="text-[10px] sm:text-xs font-medium text-slate-500">Sign in to speed up your checkout process.</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => openAuthModal('login')}
                                                className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 bg-emerald-600 text-white rounded-xl sm:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md shadow-emerald-50"
                                            >
                                                Sign In Now
                                            </button>
                                        </div>
                                    )}
                                    {/* Unavailable / deleted products */}
                                    {missingItemIds.map((id) => (
                                        <div key={id} className="premium-card rounded-2xl sm:rounded-[40px] p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 border-2 border-red-200 bg-red-50/30">
                                            <div className="w-24 h-24 sm:w-32 sm:h-32 bg-red-50 rounded-xl sm:rounded-[32px] overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                <AlertTriangle className="w-10 h-10 text-red-300" />
                                            </div>
                                            <div className="flex-1 text-center sm:text-left w-full">
                                                <h3 className="text-lg sm:text-xl font-black text-red-600 uppercase tracking-tight">Unavailable Product</h3>
                                                <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">This product has been removed from our store</p>
                                                <div className="bg-red-50 text-red-600 border border-red-100 rounded-2xl px-4 py-2.5 text-xs font-bold mb-4 flex items-center gap-2 animate-pulse justify-center sm:justify-start">
                                                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                                                    <span>No longer available — please remove from cart</span>
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(id)}
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-all active:scale-95"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {cartItems.map((item: any) => (
                                        <div key={item.id} className="premium-card rounded-2xl sm:rounded-[40px] p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 group hover:border-emerald-500/30 transition-all">
                                            <div className="w-24 h-24 sm:w-32 sm:h-32 bg-slate-50 rounded-xl sm:rounded-[32px] overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                {item.photo ? (
                                                    <img src={item.photo} alt={item.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <ShoppingBag className="w-10 h-10 text-slate-200" />
                                                )}
                                            </div>

                                            <div className="flex-1 text-center sm:text-left w-full">
                                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-2 mb-1 sm:mb-2">
                                                    <div>
                                                        <h3 className="text-lg sm:text-xl font-black text-slate-950 group-hover:text-emerald-600 transition-colors uppercase tracking-tight">{item.name}</h3>
                                                        {/* Applied Discount Badge */}
                                                        {(() => {
                                                            const itemPrice = getProductPrice(item, item.cartQuantity);
                                                            if (itemPrice < (item.sellPrice || 0) && item.onlineDiscountTiers) {
                                                                const appliedTier = [...item.onlineDiscountTiers]
                                                                    .sort((a, b) => b.minQuantity - a.minQuantity)
                                                                    .find(t => item.cartQuantity >= t.minQuantity);
                                                                if (appliedTier) {
                                                                    return (
                                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 mt-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                                                            {appliedTier.name} Discount Applied (₦{appliedTier.pricePerUnit.toLocaleString()}/unit)
                                                                        </span>
                                                                    );
                                                                }
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                    <div className="text-right">
                                                        {getProductPrice(item, item.cartQuantity) < (item.sellPrice || 0) ? (
                                                            <>
                                                                <p className="text-xl sm:text-2xl font-black text-emerald-600 italic">₦{(getProductPrice(item, item.cartQuantity) * item.cartQuantity).toLocaleString()}</p>
                                                                <p className="text-xs font-bold text-slate-400 line-through">₦{((item.sellPrice || 0) * item.cartQuantity).toLocaleString()}</p>
                                                            </>
                                                        ) : (
                                                            <p className="text-xl sm:text-2xl font-black text-slate-950 italic">₦{((item.sellPrice || 0) * item.cartQuantity).toLocaleString()}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 sm:mb-4">{item.category}</p>
                                                
                                                {/* Next Tier Upsell Hint */}
                                                {(() => {
                                                    const nextTierInfo = getNextTierMessage(item, item.cartQuantity);
                                                    if (nextTierInfo) {
                                                        return (
                                                            <p className="text-xs font-medium text-emerald-600 mb-3 bg-emerald-50/50 px-3 py-1.5 rounded-xl border border-emerald-100/50 inline-block animate-pulse">
                                                                💡 {nextTierInfo.message}
                                                            </p>
                                                        );
                                                    }
                                                    return null;
                                                })()}

                                                {item.cartQuantity > (item.quantity || 0) && (
                                                    <div className="bg-red-50 text-red-600 border border-red-100 rounded-2xl px-4 py-2.5 text-xs font-bold mb-4 flex items-center gap-2 animate-pulse justify-center sm:justify-start">
                                                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                                                        <span>
                                                            {(item.quantity || 0) <= 0 
                                                                ? "Out of Stock — please remove from cart" 
                                                                : `Insufficient Stock — only ${item.quantity} available`}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-center sm:justify-start gap-6">
                                                    <div className="flex items-center bg-slate-100 rounded-2xl p-1 gap-1">
                                                        <button
                                                            onClick={() => updateQuantity(item.id!, item.cartQuantity - 1, item.quantity || 0)}
                                                            className="p-2 hover:bg-white hover:text-emerald-600 rounded-xl transition-all active:scale-90"
                                                        >
                                                            <Minus className="w-4 h-4" />
                                                        </button>
                                                        <span className="w-10 text-center font-black text-sm">{item.cartQuantity}</span>
                                                        <button
                                                            disabled={item.cartQuantity >= (item.quantity || 0)}
                                                            onClick={() => updateQuantity(item.id!, item.cartQuantity + 1, item.quantity || 0)}
                                                            className="p-2 hover:bg-white hover:text-emerald-600 rounded-xl transition-all active:scale-90 disabled:opacity-30 disabled:hover:text-slate-400 disabled:cursor-not-allowed"
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <button
                                                        onClick={() => removeFromCart(item.id!)}
                                                        className="text-slate-400 hover:text-red-500 transition-colors p-2"
                                                        aria-label="Remove item"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        onClick={clearCart}
                                        className="text-slate-400 hover:text-slate-900 text-[10px] font-black uppercase tracking-[0.3em] ml-2 transition-colors"
                                    >
                                        Clear Shopping Cart
                                    </button>
                                </>
                            ) : (
                                <form id="checkout-form" onSubmit={handleCheckout} className="space-y-4 sm:space-y-8">
                                    <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-8 border border-slate-100 shadow-sm">
                                        <h2 className="text-lg sm:text-xl font-black mb-4 sm:mb-6 flex items-center gap-2">
                                            <span className="w-6 h-6 sm:w-8 sm:h-8 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] sm:text-xs">1</span>
                                            Delivery Method
                                        </h2>
                                        {(() => {
                                            const isLinked = !!profile?.linkedPosCustomerId;
                                            const creditLimit = profile?.creditInfo?.creditLimit ?? 0;
                                            const hasCreditEnabled = creditLimit > 0;
                                            const effectiveAvailableCredit = Math.max(0, (profile?.creditInfo?.availableCredit ?? 0) - pendingCreditTotal);
                                            const canBuyOnCredit = hasCreditEnabled && effectiveAvailableCredit > 0;

                                            const methods = [
                                                { id: 'delivery', label: 'Pay on Delivery', icon: <MapPin className="w-5 h-5" /> },
                                                { id: 'pickup', label: 'Pick in Store', icon: <Store className="w-5 h-5" /> },
                                                { id: 'proof', label: 'Bank Transfer', icon: <Receipt className="w-5 h-5" /> }
                                            ];

                                            if (isLinked && hasCreditEnabled) {
                                                methods.push({
                                                    id: 'credit',
                                                    label: 'Buy on Credit',
                                                    icon: <CreditCard className="w-5 h-5" />
                                                });
                                            }

                                            return (
                                                <div className="space-y-4">
                                                    <div className={`grid grid-cols-1 ${isLinked && hasCreditEnabled ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
                                                        {methods.map((method) => {
                                                             const isCredit = method.id === 'credit';
                                                             const isDisabled = isCredit && !canBuyOnCredit;

                                                            return (
                                                                <div
                                                                    key={method.id}
                                                                    onClick={() => {
                                                                        if (isDisabled) return;
                                                                        setCheckoutMethod(method.id as any);
                                                                    }}
                                                                    className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 text-center ${
                                                                        isDisabled 
                                                                            ? 'opacity-50 bg-slate-100 border-slate-200 cursor-not-allowed'
                                                                            : 'cursor-pointer'
                                                                    } ${
                                                                        checkoutMethod === method.id
                                                                            ? 'border-emerald-500 bg-emerald-50/30 shadow-md shadow-emerald-50'
                                                                            : isDisabled
                                                                                ? ''
                                                                                : 'border-slate-50 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-100'
                                                                    }`}
                                                                >
                                                                    <div className={`${checkoutMethod === method.id ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                                        {method.icon}
                                                                    </div>
                                                                    <span className={`text-xs font-black uppercase tracking-widest ${checkoutMethod === method.id ? 'text-emerald-950' : 'text-slate-500'}`}>
                                                                        {method.label}
                                                                    </span>
                                                                    {isCredit && (
                                                                        <div className="mt-1">
                                                                            <span className={`text-[10px] font-black block ${effectiveAvailableCredit >= subtotal ? 'text-emerald-600' : effectiveAvailableCredit > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                                                                                Avail: ₦{effectiveAvailableCredit.toLocaleString()}
                                                                            </span>
                                                                            {pendingCreditTotal > 0 && (
                                                                                <span className="text-[9px] text-slate-400 font-bold block">
                                                                                    (₦{pendingCreditTotal.toLocaleString()} pending)
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Explanatory Banners for Credit Buying Status */}
                                                    {isLinked && hasCreditEnabled && effectiveAvailableCredit <= 0 && (
                                                        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl text-xs font-medium flex items-start gap-3">
                                                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                                            <div>
                                                                <p className="font-bold text-amber-950">No Available Store Credit</p>
                                                                <p className="mt-0.5">
                                                                    Your available credit balance is <span className="font-bold">₦0</span>. 
                                                                    {pendingCreditTotal > 0 && ` You also have ₦${pendingCreditTotal.toLocaleString()} in pending credit orders.`}
                                                                    Please adjust your cart items or pay off existing debt to use Store Credit.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {isLinked && !hasCreditEnabled && (
                                                        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-2xl text-xs font-medium flex items-center justify-between gap-3">
                                                            <div className="flex items-start gap-3">
                                                                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                                                <div>
                                                                    <p className="font-bold text-blue-950">Store Credit Not Activated</p>
                                                                    <p className="mt-0.5">
                                                                        Your account is linked to <span className="font-bold">{profile.linkedPosCustomerName}</span>, but store credit limit is currently ₦0. Ask store staff or admin to activate a credit limit for your profile.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={handleRefreshCredit}
                                                                disabled={isSyncingCredit}
                                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 transition-all shrink-0 flex items-center gap-1.5"
                                                            >
                                                                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCredit ? 'animate-spin' : ''}`} />
                                                                {isSyncingCredit ? 'Checking...' : 'Check Status'}
                                                            </button>
                                                        </div>
                                                    )}

                                                    {!isLinked && (
                                                        <div className="bg-slate-50 border border-slate-200 text-slate-700 p-4 rounded-2xl text-xs font-medium flex items-start gap-3">
                                                            <CreditCard className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                                                            <div>
                                                                <p className="font-bold text-slate-900">Want to Buy on Credit?</p>
                                                                <p className="mt-0.5">
                                                                    If you have an in-store credit line with Ganewa Shopping Mall, ask a cashier or store admin to link your online account (<span className="font-bold">{profile?.email || profile?.phone || 'your profile'}</span>) to your store customer profile!
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Credit Payment Option Card (Only for 'credit' method) */}
                                    {checkoutMethod === 'credit' && (
                                        <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-8 border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                                            <h2 className="text-lg sm:text-xl font-black mb-4 sm:mb-6 flex items-center gap-2">
                                                <span className="w-6 h-6 sm:w-8 sm:h-8 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] sm:text-xs">2</span>
                                                Credit Payment Option
                                            </h2>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsPartialPayment(false)}
                                                    className={`p-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 text-center ${
                                                        !isPartialPayment
                                                            ? 'border-emerald-500 bg-emerald-50/40 shadow-sm shadow-emerald-50'
                                                            : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className={`p-2 rounded-xl ${!isPartialPayment ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        <CreditCard className="w-5 h-5" />
                                                    </div>
                                                    <span className={`text-xs font-black uppercase tracking-wider ${!isPartialPayment ? 'text-emerald-950' : 'text-slate-700'}`}>
                                                        Pay in Full
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-bold">
                                                        Full ₦{subtotal.toLocaleString()} charged to store credit
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setIsPartialPayment(true)}
                                                    className={`p-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 text-center ${
                                                        isPartialPayment
                                                            ? 'border-emerald-500 bg-emerald-50/40 shadow-sm shadow-emerald-50'
                                                            : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className={`p-2 rounded-xl ${isPartialPayment ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        <Receipt className="w-5 h-5" />
                                                    </div>
                                                    <span className={`text-xs font-black uppercase tracking-wider ${isPartialPayment ? 'text-emerald-950' : 'text-slate-700'}`}>
                                                        Pay a Deposit
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-bold">
                                                        Pay deposit now via transfer, remainder on credit
                                                    </span>
                                                </button>
                                            </div>

                                            {isPartialPayment && (
                                                <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in">
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between items-center ml-1">
                                                            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                                Deposit Amount (₦)
                                                            </label>
                                                            <span className="text-[10px] font-bold text-emerald-600">
                                                                Min Deposit: ₦{getMinDeposit(subtotal).toLocaleString()} (30%)
                                                            </span>
                                                        </div>
                                                        <div className="relative">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">₦</span>
                                                            <input
                                                                type="number"
                                                                min={getMinDeposit(subtotal)}
                                                                max={subtotal - 1}
                                                                value={depositAmount}
                                                                onChange={(e) => setDepositAmount(e.target.value)}
                                                                placeholder={`Enter at least ${getMinDeposit(subtotal).toLocaleString()}`}
                                                                className="w-full bg-slate-50 border-none rounded-xl sm:rounded-2xl pl-10 pr-4 py-3 sm:py-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-300"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Validation and Balance Breakdown */}
                                                    {(() => {
                                                        const parsed = parseFloat(depositAmount);
                                                        const minDep = getMinDeposit(subtotal);
                                                        if (depositAmount && !isNaN(parsed)) {
                                                            if (parsed < minDep) {
                                                                return (
                                                                    <p className="text-[11px] text-red-500 font-bold flex items-center gap-1.5 ml-1">
                                                                        <AlertTriangle className="w-3.5 h-3.5" /> Deposit must be at least ₦{minDep.toLocaleString()}
                                                                    </p>
                                                                );
                                                            }
                                                            if (parsed >= subtotal) {
                                                                return (
                                                                    <p className="text-[11px] text-red-500 font-bold flex items-center gap-1.5 ml-1">
                                                                        <AlertTriangle className="w-3.5 h-3.5" /> Deposit must be less than order total (₦{subtotal.toLocaleString()}). Use Bank Transfer to pay in full.
                                                                    </p>
                                                                );
                                                            }
                                                            const bal = Math.max(0, subtotal - parsed);
                                                            return (
                                                                <div className="bg-emerald-50 border border-emerald-100 p-3.5 rounded-2xl text-xs space-y-1">
                                                                    <div className="flex justify-between font-bold text-slate-700">
                                                                        <span>Deposit to pay now (via transfer):</span>
                                                                        <span className="text-emerald-700 font-black">₦{parsed.toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="flex justify-between font-bold text-slate-700">
                                                                        <span>Remaining to charge to store credit:</span>
                                                                        <span className="text-violet-700 font-black">₦{bal.toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}

                                                    <div className="bg-blue-50 border border-blue-100 text-blue-900 p-4 rounded-2xl text-xs font-medium flex items-start gap-2.5">
                                                        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="font-bold text-blue-950">How Partial Credit Payment Works</p>
                                                            <p className="mt-0.5 leading-relaxed text-blue-800">
                                                                Pay your deposit by bank transfer below and upload your receipt. Once approved by our store team, <span className="font-bold">only the remaining balance</span> (not the full order total) will be charged to your store credit account.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-8 border border-slate-100 shadow-sm">
                                        <h2 className="text-lg sm:text-xl font-black mb-4 sm:mb-6 flex items-center gap-2">
                                            <span className="w-6 h-6 sm:w-8 sm:h-8 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] sm:text-xs">
                                                {checkoutMethod === 'credit' ? '3' : '2'}
                                            </span>
                                            {checkoutMethod === 'pickup' ? 'Contact Details' : 'Delivery Details'}
                                        </h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Full Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={formData.name}
                                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                    placeholder="Enter your name"
                                                    className="w-full bg-slate-50 border-none rounded-xl sm:rounded-2xl px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-300"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Phone Number</label>
                                                <input
                                                    type="tel"
                                                    required
                                                    value={formData.phone}
                                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                                    placeholder="Enter your number"
                                                    className="w-full bg-slate-50 border-none rounded-xl sm:rounded-2xl px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-300"
                                                />
                                            </div>
                                            <div className={`md:col-span-2 space-y-1.5 transition-all ${checkoutMethod === 'pickup' ? 'hidden opacity-0 h-0 overflow-hidden' : 'block opacity-100 h-auto'}`}>
                                                <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Home Address</label>
                                                <textarea
                                                    required={checkoutMethod !== 'pickup'}
                                                    value={formData.address}
                                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                                    placeholder="Apartment, suite, street, etc."
                                                    className="w-full bg-slate-50 border-none rounded-xl sm:rounded-2xl px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-300 min-h-[80px] sm:min-h-[100px]"
                                                ></textarea>
                                            </div>
                                            <div className="md:col-span-2 space-y-1.5">
                                                <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email (Optional)</label>
                                                <input
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                    placeholder="For order tracking"
                                                    className="w-full bg-slate-50 border-none rounded-xl sm:rounded-2xl px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-300"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {(checkoutMethod === 'proof' || (checkoutMethod === 'credit' && isPartialPayment)) && (
                                        <div className="bg-emerald-50/50 rounded-2xl sm:rounded-[40px] p-4 sm:p-8 border border-emerald-100/50 shadow-sm animate-in fade-in slide-in-from-top-2">
                                            <h2 className="text-lg sm:text-xl font-black mb-4 sm:mb-6 flex items-center gap-2">
                                                <span className="w-6 h-6 sm:w-8 sm:h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[10px] sm:text-xs">
                                                    {checkoutMethod === 'credit' ? '4' : '3'}
                                                </span>
                                                {checkoutMethod === 'credit' ? 'Proof of Deposit' : 'Proof of Payment'}
                                            </h2>

                                            {/* Bank Accounts — error state */}
                                            {bankAccountsError ? (
                                                <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6 flex items-start gap-3">
                                                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-xs font-black uppercase tracking-widest text-red-700 mb-1">Could Not Load Payment Accounts</p>
                                                        <p className="text-xs text-red-600 font-medium">{bankAccountsError}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Bank Accounts — radio selection */
                                                <div className="mb-6">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">1. Select the account you transferred to:</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {bankAccounts.map((account) => {
                                                            const isSelected = selectedBankAccountId === account.id;
                                                            return (
                                                                <button
                                                                    key={account.id}
                                                                    type="button"
                                                                    onClick={() => setSelectedBankAccountId(account.id)}
                                                                    className={`text-left p-4 rounded-2xl border-2 transition-all flex flex-col relative ${
                                                                        isSelected
                                                                            ? 'border-emerald-500 bg-emerald-50/60 shadow-sm shadow-emerald-100'
                                                                            : 'border-slate-100 bg-white hover:border-emerald-200 hover:bg-slate-50'
                                                                    }`}
                                                                >
                                                                    {isSelected && (
                                                                        <span className="absolute top-3 right-3 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                                                                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                                                        </span>
                                                                    )}
                                                                    <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md self-start mb-3 ${
                                                                        isSelected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                                                                    }`}>{account.bankName}</span>
                                                                    <div className="mt-1">
                                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Account Number</span>
                                                                        <div className="flex items-center gap-2 mt-0.5">
                                                                            <span className="text-sm font-black font-mono text-slate-900 select-all">{account.accountNo}</span>
                                                                            <span
                                                                                role="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    navigator.clipboard.writeText(account.accountNo);
                                                                                    alert("Account number copied!");
                                                                                }}
                                                                                className="text-[9px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 p-1 bg-white hover:bg-slate-100 rounded border border-slate-100 transition-colors cursor-pointer"
                                                                            >
                                                                                Copy
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-2">
                                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Account Name</span>
                                                                        <span className="text-xs font-bold text-slate-700 truncate block mt-0.5">{account.accountName}</span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    {!selectedBankAccountId && (
                                                        <p className="text-[10px] text-amber-600 font-bold mt-2 flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3" /> Please select an account above before uploading your receipt.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* File Upload */}
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">2. Upload your transfer receipt:</p>
                                            <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-dashed border-emerald-200 flex flex-col items-center text-center gap-4 transition-all hover:bg-emerald-50 group">
                                                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Upload className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-widest text-slate-900 mb-1">
                                                        {checkoutMethod === 'credit' ? 'Click to upload deposit receipt' : 'Click to upload transfer receipt'}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">JPG, PNG or PDF (Max 2MB)</p>
                                                </div>
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    id="proof-upload"
                                                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                                                />
                                                <label
                                                    htmlFor="proof-upload"
                                                    className="mt-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-100 active:scale-95 transition-all"
                                                >
                                                    {proofFile ? `Attached: ${proofFile.name}` : 'Choose File'}
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </form>
                            )}
                        </div>

                        {/* Order Summary */}
                        <div className="lg:col-span-1">
                            <div className="bg-slate-950 text-white rounded-2xl sm:rounded-[40px] p-6 sm:p-10 shadow-2xl sticky top-[120px]">
                                <h2 className="text-xl sm:text-2xl font-black mb-6 sm:mb-8 tracking-tight">Summary.</h2>

                                <div className="space-y-4 mb-8 pb-8 border-b border-white/10">
                                    <div className="flex justify-between items-center text-slate-400">
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Subtotal</span>
                                        <span className="text-base font-black text-white">₦{(originalSubtotal || 0).toLocaleString()}</span>
                                    </div>
                                    {discountApplied > 0 && (
                                        <div className="flex justify-between items-center text-emerald-400">
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Quantity Discounts</span>
                                            <span className="text-base font-black text-emerald-400">-₦{(discountApplied || 0).toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-slate-400">
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Processing Fee</span>
                                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Free</span>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mb-10">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Total Price</span>
                                    <span className="text-3xl font-black italic text-emerald-400">₦{(subtotal || 0).toLocaleString()}</span>
                                </div>

                                {checkoutMethod === 'credit' && isPartialPayment && (() => {
                                    const parsed = parseFloat(depositAmount);
                                    const minDep = getMinDeposit(subtotal);
                                    if (!isNaN(parsed) && parsed >= minDep && parsed < subtotal) {
                                        return (
                                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 space-y-2 text-xs">
                                                <div className="flex justify-between text-slate-300">
                                                    <span>Deposit (Bank Transfer):</span>
                                                    <span className="font-black text-emerald-400">₦{parsed.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-300">
                                                    <span>Charged to Store Credit:</span>
                                                    <span className="font-black text-violet-400">₦{(subtotal - parsed).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                                
                                {discountApplied > 0 && (
                                    <div className="bg-emerald-950/60 border border-emerald-500/20 text-emerald-200 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest mb-6 text-center">
                                         🔥 Sweet Deal! You saved ₦{discountApplied.toLocaleString()} with bulk discounts.
                                    </div>
                                )}

                                {checkoutStep === 'cart' ? (
                                    <div className="space-y-4 w-full">
                                        {hasStockIssues && (
                                            <div className="bg-red-950/60 border border-red-500/20 text-red-200 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-start gap-2.5 text-left leading-normal">
                                                <AlertTriangle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                                                <span>
                                                    Some items in your cart are out of stock or have insufficient quantity. Please adjust your cart to proceed.
                                                </span>
                                            </div>
                                        )}
                                        <button
                                            disabled={hasStockIssues}
                                            onClick={handleProceedToCheckout}
                                            className="w-full py-6 bg-emerald-500 text-slate-950 rounded-[30px] font-black uppercase text-xs tracking-[0.2em] hover:bg-white hover:scale-[1.02] transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:hover:scale-100 disabled:hover:bg-emerald-500 disabled:cursor-not-allowed"
                                        >
                                            <CreditCard className="w-5 h-5" />
                                            Proceed to Checkout
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 w-full">
                                        {hasStockIssues && (
                                            <div className="bg-red-950/60 border border-red-500/20 text-red-200 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-start gap-2.5 text-left leading-normal">
                                                <AlertTriangle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                                                <span>
                                                    Inventory changed. Some items are now out of stock. Please adjust your cart.
                                                </span>
                                            </div>
                                        )}
                                        {(() => {
                                            const needsProofNow = checkoutMethod === 'proof' || (checkoutMethod === 'credit' && isPartialPayment);
                                            if (needsProofNow && !bankAccountsError && !selectedBankAccountId) {
                                                return (
                                                    <div className="bg-amber-950/30 border border-amber-500/20 text-amber-200 p-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-start gap-2 text-left leading-normal">
                                                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                                        <span>Select a bank account before placing your order.</span>
                                                    </div>
                                                );
                                            }
                                            if (needsProofNow && selectedBankAccountId && !proofFile) {
                                                return (
                                                    <div className="bg-amber-950/30 border border-amber-500/20 text-amber-200 p-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-start gap-2 text-left leading-normal">
                                                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                                        <span>Please upload your transfer receipt before placing your order.</span>
                                                    </div>
                                                );
                                            }
                                            if (checkoutMethod === 'credit') {
                                                const effectiveAvailable = Math.max(0, (profile?.creditInfo?.availableCredit ?? 0) - pendingCreditTotal);
                                                if (isPartialPayment) {
                                                    const parsed = parseFloat(depositAmount);
                                                    const minDep = getMinDeposit(subtotal);
                                                    if (isNaN(parsed) || parsed < minDep || parsed >= subtotal) {
                                                        return (
                                                            <div className="bg-amber-950/30 border border-amber-500/20 text-amber-200 p-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-start gap-2 text-left leading-normal">
                                                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                                                <span>Enter a deposit amount of at least ₦{minDep.toLocaleString()} (below total ₦{subtotal.toLocaleString()}).</span>
                                                            </div>
                                                        );
                                                    }
                                                    const remainder = subtotal - parsed;
                                                    if (effectiveAvailable < remainder) {
                                                        return (
                                                            <div className="bg-amber-950/30 border border-amber-500/20 text-amber-200 p-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-start gap-2 text-left leading-normal">
                                                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                                                <span>Credit balance (₦{remainder.toLocaleString()}) exceeds your available credit (₦{effectiveAvailable.toLocaleString()}). Increase your deposit.</span>
                                                            </div>
                                                        );
                                                    }
                                                } else {
                                                    if (effectiveAvailable < subtotal) {
                                                        return (
                                                            <div className="bg-amber-950/30 border border-amber-500/20 text-amber-200 p-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-start gap-2 text-left leading-normal">
                                                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                                                <span>Available credit (₦{effectiveAvailable.toLocaleString()}) is less than order total. Choose "Pay a Deposit" to proceed.</span>
                                                            </div>
                                                        );
                                                    }
                                                }
                                            }
                                            return null;
                                        })()}
                                        {(() => {
                                            const minDep = getMinDeposit(subtotal);
                                            const parsedDep = parseFloat(depositAmount);
                                            const needsProofNow = checkoutMethod === 'proof' || (checkoutMethod === 'credit' && isPartialPayment);
                                            const isDepositInvalid = checkoutMethod === 'credit' && isPartialPayment && (isNaN(parsedDep) || parsedDep < minDep || parsedDep >= subtotal);
                                            const effectiveAvail = Math.max(0, (profile?.creditInfo?.availableCredit ?? 0) - pendingCreditTotal);
                                            const balanceReq = checkoutMethod === 'credit' ? (isPartialPayment ? Math.max(0, subtotal - (parsedDep || 0)) : subtotal) : 0;
                                            const isCreditInsufficient = checkoutMethod === 'credit' && (effectiveAvail < balanceReq);
                                            const isProofMissing = needsProofNow && (!proofFile || !selectedBankAccountId || !!bankAccountsError);

                                            return (
                                                <button
                                                    form="checkout-form"
                                                    type="submit"
                                                    disabled={isCheckingOut || hasStockIssues || isProofMissing || isDepositInvalid || isCreditInsufficient}
                                                    className="w-full py-6 bg-emerald-500 text-slate-950 rounded-[30px] font-black uppercase text-xs tracking-[0.2em] hover:bg-white hover:scale-[1.02] transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed"
                                                >
                                                    {isCheckingOut ? (
                                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-950"></div>
                                                    ) : (
                                                        <>
                                                            <CheckCircle2 className="w-5 h-5" />
                                                            Place Order
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        })()}
                                    </div>
                                )}

                                <p className="text-center mt-8 text-[9px] text-slate-500 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                                    <CreditCard className="w-3 h-3" /> Secure Payment System
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
