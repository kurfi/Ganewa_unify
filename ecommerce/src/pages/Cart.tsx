import React, { useState, useEffect } from 'react';
import { ShoppingBag, Trash2, Minus, Plus, ChevronLeft, CreditCard, MapPin, Store, Receipt, Upload, CheckCircle2, User, AlertTriangle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { uploadToCloudinary } from '../utils/cloudinary';
import { doc, getDoc, collection, serverTimestamp, runTransaction, query, where, documentId, getDocs } from 'firebase/firestore';
import type { Product } from '../types';

interface CartItemWithDetails extends Product {
    cartQuantity: number;
}

export default function Cart() {
    const { cart, removeFromCart, updateQuantity, clearCart } = useCart();
    const navigate = useNavigate();
    const [cartItems, setCartItems] = useState<CartItemWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [checkoutStep, setCheckoutStep] = useState<'cart' | 'details' | 'success'>('cart');
    const [checkoutMethod, setCheckoutMethod] = useState<'pod' | 'pickup' | 'proof'>('pod');
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        address: '',
        email: ''
    });
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [orderId, setOrderId] = useState('');

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
                // Firestore 'in' query limit is 30, but carts usually stay below that
                const q = query(collection(db, 'products'), where(documentId(), 'in', itemIds));
                const querySnapshot = await getDocs(q);
                
                const items: CartItemWithDetails[] = querySnapshot.docs.map(doc => {
                    const cartItem = cart.find(ci => ci.id === doc.id);
                    return {
                        id: doc.id,
                        ...doc.data(),
                        cartQuantity: cartItem?.quantity || 0
                    } as CartItemWithDetails;
                });

                setCartItems(items);
            } catch (error) {
                console.error("Error fetching cart items:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCartItems();
    }, [cart, checkoutStep]);

    const { user, profile, openAuthModal } = useAuth();
    const hasStockIssues = cartItems.some(item => item.cartQuantity > (item.quantity || 0));

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

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCheckingOut(true);

        try {
            let proofUrl = null;
            if (proofFile && checkoutMethod === 'proof') {
                try {
                    proofUrl = await uploadToCloudinary(proofFile);
                } catch (uploadError) {
                    console.error("Proof upload failed:", uploadError);
                    alert("Failed to upload Proof of Payment. Please try again.");
                    setIsCheckingOut(false);
                    return;
                }
            }

            const now = new Date();
            const datePart = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const uniquePart = `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
            const newOrderId = `GW-${datePart}-${uniquePart}`;

            // Create a reference for the new order document (auto-generated ID)
            const orderDocRef = doc(collection(db, 'orders'));

            // Run stock validation and order creation inside a transaction
            await runTransaction(db, async (transaction) => {
                const productUpdates = [];

                // 1. Read all product documents first
                for (const item of cartItems) {
                    const productRef = doc(db, 'products', item.id!);
                    const productSnap = await transaction.get(productRef);
                    
                    if (!productSnap.exists()) {
                        throw new Error(`PRODUCT_NOT_FOUND:${item.name}`);
                    }
                    
                    const dbQty = productSnap.data().quantity || 0;
                    if (dbQty < item.cartQuantity) {
                        throw new Error(`INSUFFICIENT_STOCK:${item.name}:${dbQty}`);
                    }

                    productUpdates.push({
                        ref: productRef,
                        newQty: dbQty - item.cartQuantity
                    });
                }

                // 2. Perform all updates and write the order
                for (const update of productUpdates) {
                    transaction.update(update.ref, { quantity: update.newQty });
                }

                transaction.set(orderDocRef, {
                    orderId: newOrderId,
                    userId: user?.uid || null,
                    items: cartItems.map((item: any) => ({
                        id: item.id,
                        name: item.name,
                        price: item.sellPrice,
                        quantity: item.cartQuantity,
                        photo: item.photo || null
                    })),
                    total: subtotal,
                    customer: {
                        name: formData.name,
                        phone: formData.phone,
                        address: checkoutMethod === 'pickup' ? 'PICKUP' : formData.address,
                        email: formData.email || null
                    },
                    method: checkoutMethod,
                    status: 'pending',
                    createdAt: serverTimestamp(),
                    proofOfPayment: proofUrl
                });
            });

            setOrderId(newOrderId);
            clearCart();
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
            } else {
                alert("Failed to place order. Please try again.");
            }
        } finally {
            setIsCheckingOut(false);
        }
    };

    const subtotal = cartItems.reduce((acc: number, item: any) => acc + (item.sellPrice * item.cartQuantity), 0);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
            </div>
        );
    }

    if (checkoutStep === 'success') {
        const successConfig = {
            pod: {
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
                                                    <h3 className="text-lg sm:text-xl font-black text-slate-950 group-hover:text-emerald-600 transition-colors uppercase tracking-tight">{item.name}</h3>
                                                    <p className="text-xl sm:text-2xl font-black text-slate-950 italic">₦{((item.sellPrice || 0) * item.cartQuantity).toLocaleString()}</p>
                                                </div>
                                                <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 sm:mb-4">{item.category}</p>

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
                                                            onClick={() => updateQuantity(item.id!, item.cartQuantity - 1)}
                                                            className="p-2 hover:bg-white hover:text-emerald-600 rounded-xl transition-all active:scale-90"
                                                        >
                                                            <Minus className="w-4 h-4" />
                                                        </button>
                                                        <span className="w-10 text-center font-black text-sm">{item.cartQuantity}</span>
                                                        <button
                                                            onClick={() => updateQuantity(item.id!, item.cartQuantity + 1)}
                                                            className="p-2 hover:bg-white hover:text-emerald-600 rounded-xl transition-all active:scale-90"
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
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {[
                                                { id: 'pod', label: 'Pay on Delivery', icon: <MapPin className="w-5 h-5" /> },
                                                { id: 'pickup', label: 'Pick in Store', icon: <Store className="w-5 h-5" /> },
                                                { id: 'proof', label: 'Bank Transfer', icon: <Receipt className="w-5 h-5" /> }
                                            ].map((method) => (
                                                <div
                                                    key={method.id}
                                                    onClick={() => setCheckoutMethod(method.id as any)}
                                                    className={`cursor-pointer p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 text-center ${checkoutMethod === method.id
                                                        ? 'border-emerald-500 bg-emerald-50/30'
                                                        : 'border-slate-50 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-100'
                                                        }`}
                                                >
                                                    <div className={`${checkoutMethod === method.id ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                        {method.icon}
                                                    </div>
                                                    <span className={`text-xs font-black uppercase tracking-widest ${checkoutMethod === method.id ? 'text-emerald-950' : 'text-slate-500'}`}>
                                                        {method.label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-8 border border-slate-100 shadow-sm">
                                        <h2 className="text-lg sm:text-xl font-black mb-4 sm:mb-6 flex items-center gap-2">
                                            <span className="w-6 h-6 sm:w-8 sm:h-8 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] sm:text-xs">2</span>
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

                                    {checkoutMethod === 'proof' && (
                                        <div className="bg-emerald-50/50 rounded-2xl sm:rounded-[40px] p-4 sm:p-8 border border-emerald-100/50 shadow-sm animate-in fade-in slide-in-from-top-2">
                                            <h2 className="text-lg sm:text-xl font-black mb-4 sm:mb-6 flex items-center gap-2">
                                                <span className="w-6 h-6 sm:w-8 sm:h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[10px] sm:text-xs">3</span>
                                                Proof of Payment
                                            </h2>
                                            <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-dashed border-emerald-200 flex flex-col items-center text-center gap-4 transition-all hover:bg-emerald-50 group">
                                                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Upload className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-widest text-slate-900 mb-1">Click to upload transfer receipt</p>
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
                                        <span className="text-base font-black text-white">₦{(subtotal || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-400">
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Processing Fee</span>
                                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Free</span>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mb-10">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Total Price</span>
                                    <span className="text-3xl font-black italic">₦{(subtotal || 0).toLocaleString()}</span>
                                </div>

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
                                            onClick={() => setCheckoutStep('details')}
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
                                        <button
                                            form="checkout-form"
                                            type="submit"
                                            disabled={isCheckingOut || hasStockIssues || (checkoutMethod === 'proof' && !proofFile)}
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
