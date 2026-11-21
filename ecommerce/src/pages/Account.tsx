import React, { useState, useEffect } from 'react';
import { User, Package, MapPin, Shield, Edit2, Plus, Trash2, Camera, ChevronRight, LogOut, CheckCircle2, CreditCard, ArrowUpRight, ArrowDownLeft, Clock, ReceiptText, RefreshCw } from 'lucide-react';
import { useAuth, type Address } from '../contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, Timestamp, limit, startAfter, QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function Account() {
    const { profile, user, logout, addAddress, removeAddress, setDefaultAddress, updateUserProfile, unlinkPosAccount } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'profile';
    const navigate = useNavigate();

    const [orders, setOrders] = useState<any[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
    const [hasMoreOrders, setHasMoreOrders] = useState(false);
    const [lastOrderDoc, setLastOrderDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({ displayName: '', phone: '' });

    const [unlinking, setUnlinking] = useState(false);
    const [unlinkError, setUnlinkError] = useState('');
    const [unlinkSuccess, setUnlinkSuccess] = useState('');

    const [creditOrders, setCreditOrders] = useState<any[]>([]);
    const [creditOrdersLoading, setCreditOrdersLoading] = useState(false);
    const [repayments, setRepayments] = useState<any[]>([]);
    const [repaymentsLoading, setRepaymentsLoading] = useState(false);
    const [isSyncingCredit, setIsSyncingCredit] = useState(false);

    const handleSyncCredit = async () => {
        if (!user || !profile?.linkedPosCustomerId) return;
        setIsSyncingCredit(true);
        try {
            const syncFn = httpsCallable(functions, 'syncUserCreditInfo');
            await syncFn();
        } catch (err) {
            console.error("Error syncing credit info:", err);
        } finally {
            setIsSyncingCredit(false);
        }
    };

    const PAGE_SIZE = 20;

    const handleUnlinkAccount = async () => {
        if (!window.confirm("Are you sure you want to unlink your store account? You will lose access to store history on this account.")) return;
        setUnlinking(true);
        setUnlinkError('');
        setUnlinkSuccess('');
        try {
            await unlinkPosAccount();
            setUnlinkSuccess("Account unlinked successfully.");
        } catch (err: any) {
            setUnlinkError(err.message || "Failed to unlink account");
        } finally {
            setUnlinking(false);
        }
    };

    useEffect(() => {
        if (profile) {
            setProfileForm({ 
                displayName: profile.displayName || '', 
                phone: profile.phone || '' 
            });
        }
    }, [profile]);

    useEffect(() => {
        if (activeTab === 'orders' && user) {
            fetchOrders();
        } else if (activeTab === 'credit' && user && profile?.linkedPosCustomerId) {
            fetchCreditHistory();
        }
    }, [activeTab, user, profile?.linkedPosCustomerId]);

    const fetchCreditHistory = async () => {
        if (!user || !profile?.linkedPosCustomerId) return;
        setCreditOrdersLoading(true);
        setRepaymentsLoading(true);
        try {
            // Fetch credit orders
            const qOrders = query(
                collection(db, 'orders'),
                where('userId', '==', user.uid),
                where('method', '==', 'credit'),
                orderBy('createdAt', 'desc'),
                limit(10)
            );
            const snapOrders = await getDocs(qOrders);
            setCreditOrders(snapOrders.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Error fetching credit orders:", error);
        } finally {
            setCreditOrdersLoading(false);
        }

        try {
            // Fetch repayments
            const qRepayments = query(
                collection(db, 'customerPayments'),
                where('customerId', '==', profile.linkedPosCustomerId),
                orderBy('date', 'desc'),
                limit(10)
            );
            const snapRepayments = await getDocs(qRepayments);
            setRepayments(snapRepayments.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Error fetching repayments:", error);
        } finally {
            setRepaymentsLoading(false);
        }
    };

    const fetchOrders = async () => {
        if (!user) return;
        setOrdersLoading(true);
        try {
            const q = query(
                collection(db, 'orders'), 
                where('userId', '==', user.uid),
                orderBy('createdAt', 'desc'),
                limit(PAGE_SIZE)
            );
            const snap = await getDocs(q);
            const fetchedOrders = snap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            }));
            setOrders(fetchedOrders);
            setLastOrderDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMoreOrders(snap.docs.length === PAGE_SIZE);
        } catch (error) {
            console.error("Error fetching orders:", error);
        } finally {
            setOrdersLoading(false);
        }
    };

    const fetchMoreOrders = async () => {
        if (!user || !lastOrderDoc || loadingMoreOrders || !hasMoreOrders) return;
        setLoadingMoreOrders(true);
        try {
            const q = query(
                collection(db, 'orders'),
                where('userId', '==', user.uid),
                orderBy('createdAt', 'desc'),
                startAfter(lastOrderDoc),
                limit(PAGE_SIZE)
            );
            const snap = await getDocs(q);
            const newOrders = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setOrders(prev => [...prev, ...newOrders]);
            setLastOrderDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMoreOrders(snap.docs.length === PAGE_SIZE);
        } catch (error) {
            console.error("Error fetching more orders:", error);
        } finally {
            setLoadingMoreOrders(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateUserProfile(profileForm);
            setIsEditingProfile(false);
        } catch (error) {
            alert("Failed to update profile");
        }
    };

    const formatDate = (date: any) => {
        if (!date) return '';
        const d = date instanceof Timestamp ? date.toDate() : new Date(date);
        return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const tabs = [
        { id: 'profile', label: 'My Profile', icon: <User className="w-5 h-5" /> },
        { id: 'orders', label: 'My Orders', icon: <Package className="w-5 h-5" /> },
        ...(profile?.linkedPosCustomerId ? [{ id: 'credit', label: 'Store Credit', icon: <CreditCard className="w-5 h-5" /> }] : []),
        { id: 'addresses', label: 'Addresses', icon: <MapPin className="w-5 h-5" /> },
        { id: 'security', label: 'Security', icon: <Shield className="w-5 h-5" /> },
    ];

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-slate-900 flex flex-col">
            <Navbar searchQuery="" setSearchQuery={() => {}} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-2 sm:px-4 md:px-12 py-6 sm:py-12 md:py-20">
                {/* Mobile Tab Strip (Only visible on mobile) */}
                <div className="md:hidden flex gap-2 overflow-x-auto no-scrollbar py-2 border-b border-slate-100 mb-4 sticky top-[60px] bg-[#FDFDFD] z-30">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSearchParams({ tab: tab.id })}
                            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 transition-all ${activeTab === tab.id 
                                ? 'bg-emerald-600 text-white shadow-md' 
                                : 'bg-white text-slate-500 border border-slate-100'}`}
                        >
                            {React.cloneElement(tab.icon, { className: 'w-3.5 h-3.5' })}
                            {tab.label}
                        </button>
                    ))}
                    <button
                        onClick={logout}
                        className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 bg-white text-red-500 border border-red-100"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                    </button>
                </div>

                <div className="flex flex-col md:flex-row gap-8 md:gap-12">
                    {/* Sidebar (Hidden on mobile) */}
                    <aside className="hidden md:block w-80 space-y-6">
                        <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm text-center">
                            <div className="relative inline-block mb-4">
                                {profile?.photoURL ? (
                                    <img src={profile.photoURL} alt="" className="w-24 h-24 rounded-full object-cover ring-4 ring-emerald-50" />
                                ) : (
                                    <div className="w-24 h-24 rounded-full bg-emerald-600 flex items-center justify-center text-white text-3xl font-black">
                                        {(profile?.displayName || user?.email || 'G')[0].toUpperCase()}
                                    </div>
                                )}
                                <button className="absolute bottom-0 right-0 p-2 bg-slate-900 text-white rounded-full shadow-lg hover:bg-emerald-600 transition-colors">
                                    <Camera className="w-4 h-4" />
                                </button>
                            </div>
                            <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight">{profile?.displayName || 'Ganewa User'}</h2>
                            <p className="text-slate-400 text-sm font-medium">{user?.email}</p>
                        </div>

                        <nav className="bg-white rounded-[40px] p-4 border border-slate-100 shadow-sm overflow-hidden">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setSearchParams({ tab: tab.id })}
                                    className={`w-full flex items-center justify-between px-6 py-4 rounded-3xl transition-all ${activeTab === tab.id 
                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' 
                                        : 'text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        {tab.icon}
                                        <span className="text-sm font-black uppercase tracking-widest">{tab.label}</span>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 ${activeTab === tab.id ? 'opacity-100' : 'opacity-30'}`} />
                                </button>
                            ))}
                            <div className="h-px bg-slate-50 my-2" />
                            <button
                                onClick={logout}
                                className="w-full flex items-center gap-4 px-6 py-4 rounded-3xl text-red-500 hover:bg-red-50 transition-all"
                            >
                                <LogOut className="w-5 h-5" />
                                <span className="text-sm font-black uppercase tracking-widest">Sign Out</span>
                            </button>
                        </nav>
                    </aside>

                    {/* Content Area */}
                    <div className="flex-1 w-full">
                        <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-8 md:p-12 border border-slate-100 shadow-sm min-h-[500px] sm:min-h-[600px]">
                            {/* Profile Tab */}
                            {activeTab === 'profile' && (
                                <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-center mb-6 sm:mb-10">
                                        <h3 className="text-2xl sm:text-3xl font-black text-slate-950">Settings</h3>
                                        {!isEditingProfile && (
                                            <button 
                                                onClick={() => setIsEditingProfile(true)}
                                                className="flex items-center gap-1.5 text-emerald-600 font-black uppercase text-[10px] sm:text-xs tracking-widest hover:text-emerald-700"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                                            </button>
                                        )}
                                    </div>

                                    <form onSubmit={handleUpdateProfile} className="space-y-8 max-w-xl">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Display Name</label>
                                            <input
                                                type="text"
                                                disabled={!isEditingProfile}
                                                value={profileForm.displayName}
                                                onChange={e => setProfileForm({ ...profileForm, displayName: e.target.value })}
                                                className="w-full bg-slate-50 border-none rounded-xl sm:rounded-3xl px-4 py-3 sm:px-8 sm:py-5 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-70"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email Address</label>
                                            <input
                                                type="email"
                                                disabled
                                                value={user?.email || ''}
                                                className="w-full bg-slate-50 border-none rounded-xl sm:rounded-3xl px-4 py-3 sm:px-8 sm:py-5 text-sm font-bold opacity-50 cursor-not-allowed"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Phone Number</label>
                                            <input
                                                type="tel"
                                                disabled={!isEditingProfile}
                                                value={profileForm.phone}
                                                onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                                                className="w-full bg-slate-50 border-none rounded-xl sm:rounded-3xl px-4 py-3 sm:px-8 sm:py-5 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-70"
                                            />
                                        </div>

                                        {isEditingProfile && (
                                            <div className="flex gap-4 pt-4">
                                                <button
                                                    type="submit"
                                                    className="px-8 py-4 bg-emerald-600 text-white rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all"
                                                >
                                                    Save Changes
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingProfile(false)}
                                                    className="px-8 py-4 bg-slate-100 text-slate-600 rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}
                                    </form>

                                    {/* Link POS Account Section */}
                                    <div className="mt-12 pt-10 border-t border-slate-100 max-w-xl">
                                        <h4 className="text-lg font-black text-slate-950 uppercase tracking-tight mb-4">Store Account Link</h4>
                                        {profile?.linkedPosCustomerId ? (
                                            <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-wider text-emerald-800">Linked to POS Customer Profile</p>
                                                    <p className="text-lg font-black text-emerald-950 mt-1">{profile.linkedPosCustomerName || 'Associated Customer'}</p>
                                                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-1">ID: {profile.linkedPosCustomerId}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleUnlinkAccount}
                                                    disabled={unlinking}
                                                    className="bg-white hover:bg-red-50 text-red-500 border border-slate-200 hover:border-red-100 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0"
                                                >
                                                    {unlinking ? 'Unlinking...' : 'Unlink'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 space-y-3">
                                                <p className="text-xs font-black uppercase tracking-wider text-slate-500">Not Linked</p>
                                                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                                    To track your in-store purchases and manage your store credit balance online, ask a store admin or cashier to link your online account to your in-store profile. No code needed — they can do it directly from the POS system.
                                                </p>
                                            </div>
                                        )}
                                        {unlinkError && (
                                            <p className="text-xs font-bold text-red-500 mt-3">{unlinkError}</p>
                                        )}
                                        {unlinkSuccess && (
                                            <p className="text-xs font-bold text-emerald-600 mt-3">{unlinkSuccess}</p>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* Orders Tab */}
                            {activeTab === 'orders' && (
                                <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-950 mb-6 sm:mb-10">Purchase History</h3>
                                    
                                    {ordersLoading ? (
                                        <div className="flex justify-center py-20">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
                                        </div>
                                    ) : orders.length > 0 ? (
                                        <div className="space-y-4 sm:space-y-6">
                                            {orders.map((order: any) => (
                                                <div key={order.id} className="p-4 sm:p-6 bg-slate-50 rounded-2xl sm:rounded-[30px] border border-slate-100 group hover:border-emerald-500/20 transition-all">
                                                    <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
                                                        <div>
                                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-1">Order ID</span>
                                                            <span className="text-sm font-black text-slate-900">{order.orderId}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-1">Date</span>
                                                            <span className="text-sm font-black text-slate-900">{formatDate(order.createdAt)}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-1">Status</span>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                                    order.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                                    order.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                                                                    'bg-slate-200 text-slate-700'
                                                                }`}>
                                                                    {order.status}
                                                                </span>
                                                                {order.isPartialPayment && (
                                                                    <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
                                                                        Partial — ₦{(order.amountPaid || 0).toLocaleString()} of ₦{(order.total || 0).toLocaleString()} paid, ₦{(order.balanceRemaining || 0).toLocaleString()} on credit
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-1">Total</span>
                                                            <span className="text-sm font-black text-emerald-600 italic">₦{(order.total || 0).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex -space-x-4 overflow-hidden">
                                                        {order.items?.slice(0, 5).map((item: any, idx: number) => (
                                                            <div key={idx} className="w-12 h-12 rounded-2xl bg-white border-4 border-slate-50 flex items-center justify-center overflow-hidden">
                                                                <img src={item.photo || '/favicon.ico'} className="w-full h-full object-cover" />
                                                            </div>
                                                        ))}
                                                        {order.items?.length > 5 && (
                                                            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white text-[10px] font-black flex items-center justify-center border-4 border-slate-50 relative z-10">
                                                                +{order.items.length - 5}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {hasMoreOrders && (
                                                <div className="flex justify-center pt-4">
                                                    <button
                                                        onClick={fetchMoreOrders}
                                                        disabled={loadingMoreOrders}
                                                        className="px-8 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-xl shadow-slate-200 active:scale-95 disabled:opacity-50"
                                                    >
                                                        {loadingMoreOrders ? 'Loading...' : 'Load More Orders'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center py-20 bg-slate-50 rounded-[40px] border border-dashed border-slate-200">
                                            <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">No orders found yet</p>
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* Credit Tab */}
                            {activeTab === 'credit' && profile?.linkedPosCustomerId && (
                                <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-10">
                                        <h3 className="text-2xl sm:text-3xl font-black text-slate-950">Store Credit Dashboard</h3>
                                        <div className="flex items-center gap-3">
                                            <span className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                Linked Profile: {profile.linkedPosCustomerName}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleSyncCredit}
                                                disabled={isSyncingCredit}
                                                className="px-3 py-1.5 bg-slate-950 text-white rounded-full text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 transition-all flex items-center gap-1.5 shadow-sm"
                                            >
                                                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCredit ? 'animate-spin' : ''}`} />
                                                {isSyncingCredit ? 'Syncing...' : 'Sync Credit'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Stat cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                                        <div className="bg-slate-50 p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-2">Credit Limit</span>
                                            <span className="text-2xl sm:text-3xl font-black text-slate-900 italic">₦{(profile.creditInfo?.creditLimit ?? 0).toLocaleString()}</span>
                                        </div>
                                        <div className="bg-slate-50 p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-2">Outstanding Debt</span>
                                            <span className="text-2xl sm:text-3xl font-black text-red-600 italic">₦{(profile.creditInfo?.currentDebt ?? 0).toLocaleString()}</span>
                                        </div>
                                        <div className="bg-emerald-50/50 p-6 sm:p-8 rounded-3xl border border-emerald-100/50 shadow-sm flex flex-col justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-800 block mb-2">Available Credit</span>
                                            <span className="text-2xl sm:text-3xl font-black text-emerald-600 italic">₦{(profile.creditInfo?.availableCredit ?? 0).toLocaleString()}</span>
                                        </div>
                                    </div>

                                    {/* Sub-sections: Transactions & Repayments */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                        {/* Recent Credit Purchases */}
                                        <div className="space-y-6">
                                            <h4 className="text-sm font-black uppercase tracking-[0.25em] text-slate-900 flex items-center gap-2">
                                                <ArrowUpRight className="w-4 h-4 text-red-500" /> Recent Credit Purchases
                                            </h4>

                                            {creditOrdersLoading ? (
                                                <div className="flex justify-center py-10">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-950"></div>
                                                </div>
                                            ) : creditOrders.length > 0 ? (
                                                <div className="space-y-4">
                                                    {creditOrders.map((order: any) => (
                                                        <div key={order.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                                                            <div>
                                                                <p className="text-xs font-black text-slate-900">{order.orderId}</p>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{formatDate(order.createdAt)}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-red-600">-₦{(order.total || 0).toLocaleString()}</p>
                                                                <div className="flex items-center justify-end gap-1.5 mt-1">
                                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                                                                        order.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                                                        order.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                                        'bg-slate-200 text-slate-700'
                                                                    }`}>
                                                                        {order.status}
                                                                    </span>
                                                                    {order.isPartialPayment && (
                                                                        <span className="inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
                                                                            Partial — ₦{(order.amountPaid || 0).toLocaleString()} of ₦{(order.total || 0).toLocaleString()} paid, ₦{(order.balanceRemaining || 0).toLocaleString()} on credit
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                                                    No credit purchases recorded
                                                </div>
                                            )}
                                        </div>

                                        {/* Recent Debt Repayments */}
                                        <div className="space-y-6">
                                            <h4 className="text-sm font-black uppercase tracking-[0.25em] text-slate-900 flex items-center gap-2">
                                                <ArrowDownLeft className="w-4 h-4 text-emerald-500" /> Recent Debt Repayments
                                            </h4>

                                            {repaymentsLoading ? (
                                                <div className="flex justify-center py-10">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                                                </div>
                                            ) : repayments.length > 0 ? (
                                                <div className="space-y-4">
                                                    {repayments.map((payment: any) => (
                                                        <div key={payment.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                                                            <div>
                                                                <p className="text-xs font-black text-slate-900">Debt Clearance</p>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{formatDate(payment.date)}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-emerald-600">+₦{(payment.amount || 0).toLocaleString()}</p>
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">
                                                                    via {payment.paymentMethod}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                                                    No repayments recorded yet
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Addresses Tab */}
                            {activeTab === 'addresses' && (
                                <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-center mb-6 sm:mb-10">
                                        <h3 className="text-2xl sm:text-3xl font-black text-slate-950">Address Book</h3>
                                        <button className="flex items-center gap-1.5 px-4 py-2 sm:px-6 sm:py-3 bg-slate-900 text-white rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[10px] tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-slate-100">
                                            <Plus className="w-3.5 h-3.5" /> Add New
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                        {profile?.addresses && profile.addresses.length > 0 ? (
                                            profile.addresses.map(addr => (
                                                <div key={addr.id} className={`p-4 sm:p-8 rounded-2xl sm:rounded-[35px] border-2 transition-all relative group ${addr.isDefault ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                                                    <div className="flex justify-between items-start mb-4">
                                                        <span className="px-3 py-1 bg-white border border-slate-100 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-900 shadow-sm">
                                                            {addr.label}
                                                        </span>
                                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => removeAddress(addr.id!)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-900 mb-2 leading-relaxed">{addr.street}</p>
                                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{addr.city}, {addr.state}</p>
                                                    
                                                    {addr.isDefault ? (
                                                        <span className="mt-4 inline-block text-[9px] font-black text-emerald-600 uppercase tracking-widest">Default Address</span>
                                                    ) : (
                                                        <button 
                                                            onClick={() => setDefaultAddress(addr.id!)}
                                                            className="mt-4 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600"
                                                        >
                                                            Set as Default
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="col-span-2 text-center py-20 bg-slate-50 rounded-[40px] border border-dashed border-slate-200">
                                                <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">No saved addresses</p>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* Security Tab */}
                            {activeTab === 'security' && (
                                <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-950 mb-6 sm:mb-10">Security</h3>
                                    <div className="space-y-6 sm:space-y-8 max-w-xl">
                                        <div className="p-4 sm:p-8 bg-slate-50 rounded-2xl sm:rounded-[35px] border border-slate-100">
                                            <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-widest mb-3 sm:mb-4">Account Password</h4>
                                            <p className="text-[11px] sm:text-xs font-medium text-slate-500 mb-6 sm:mb-8 leading-relaxed">It's a good idea to use a strong password that you're not using elsewhere.</p>
                                            <button className="w-full py-3.5 bg-white border border-slate-200 text-slate-900 rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[10px] tracking-widest hover:bg-slate-950 hover:text-white transition-all">
                                                Request Password Reset
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
