import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Link as LinkIcon, Unlink, CheckCircle2, UserCheck, AlertCircle, RefreshCw, Loader2, User } from 'lucide-react';
import { collection, getDocs, doc, setDoc, query } from 'firebase/firestore';
import { db, fastDb, auth, ensureSilentAuth } from '../../firebase/config';
import { Customer } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logAudit } from '../../firebase/firestoreHelpers';
import { syncCreditInfoToShopUser } from '../../utils/creditInfoSync';
import { normalizePhoneKey, getNormalizedPhoneKeys } from '../../utils/phoneNormalization';
import { customersRepo } from '../../repositories';

interface ShopUser {
  uid: string;
  displayName?: string;
  email?: string;
  phone?: string;
  linkedPosCustomerId?: string | null;
  linkedPosCustomerName?: string | null;
  creditInfo?: any;
  createdAt?: any;
}

interface OnlineAccountsTabProps {
  posCustomers: Customer[];
  onRefreshCustomers?: () => void;
}

// In-memory cache for shopUsers across tab switches
let shopUsersCache: ShopUser[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export const OnlineAccountsTab: React.FC<OnlineAccountsTabProps> = ({ posCustomers, onRefreshCustomers }) => {
  const { currentUser, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [shopUsers, setShopUsers] = useState<ShopUser[]>(shopUsersCache || []);
  const [loading, setLoading] = useState(!shopUsersCache);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unlinked' | 'linked' | 'suggested'>('all');
  
  // Selected POS Customer ID for manual mapping per shopUser UID
  const [selectedMapping, setSelectedMapping] = useState<{ [shopUid: string]: string }>({});
  const [actionLoadingUid, setActionLoadingUid] = useState<string | null>(null);

  // All POS Customers fetched directly from Firestore to decouple from pagination
  const [allPosCustomers, setAllPosCustomers] = useState<Customer[]>([]);
  const [loadingPos, setLoadingPos] = useState(true);

  // Local search filter for the dropdown select per user
  const [dropdownSearch, setDropdownSearch] = useState<{ [shopUid: string]: string }>({});

  // Helper to filter POS customers for manual select mapping
  const filteredPosCustomersForUser = useCallback((shopUid: string) => {
    const q = (dropdownSearch[shopUid] || '').toLowerCase().trim();
    if (!q) return allPosCustomers;
    return allPosCustomers.filter(c => 
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }, [allPosCustomers, dropdownSearch]);

  // Helper to get docs using ensureSilentAuth and trying fastDb first, then db fallback
  const queryShopUsersDocs = async () => {
    await ensureSilentAuth();

    let docs: any[] = [];
    try {
      // Query fastDb first for direct server response without persistent cache locks
      const qFast = query(collection(fastDb, 'shopUsers'));
      const snapFast = await getDocs(qFast);
      docs = snapFast.docs;
    } catch (e) {
      console.warn('[OnlineAccountsTab] fastDb query failed, trying db:', e);
    }

    if (docs.length === 0) {
      try {
        const q = query(collection(db, 'shopUsers'));
        const snap = await getDocs(q);
        docs = snap.docs;
      } catch (e) {
        console.warn('[OnlineAccountsTab] db query failed:', e);
      }
    }

    return docs;
  };

  // Fetch shopUsers with caching
  const fetchShopUsers = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && shopUsersCache && shopUsersCache.length > 0 && (now - cacheTimestamp < CACHE_TTL_MS)) {
      setShopUsers(shopUsersCache);
      setLoading(false);
      setFetchError(null);
      return;
    }

    if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setFetchError(null);

    try {
      const docs = await queryShopUsersDocs();
      const fetched: ShopUser[] = docs.map(d => ({ uid: d.id, ...d.data() } as ShopUser));
      console.log(`[OnlineAccountsTab] Loaded ${fetched.length} online shopUsers from Firestore.`);
      
      if (fetched.length > 0) {
        shopUsersCache = fetched;
        cacheTimestamp = Date.now();
      } else {
        shopUsersCache = null;
      }
      setShopUsers(fetched);
    } catch (err: any) {
      console.error('[OnlineAccountsTab] Failed to fetch shopUsers:', err);
      shopUsersCache = null;
      setFetchError(err.message || 'Failed to load online accounts from server.');
      showToast(err.message || 'Failed to load online accounts.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchShopUsers();
  }, [fetchShopUsers]);

  // Load all POS Customers directly from Firestore on mount to avoid pagination bugs
  useEffect(() => {
    let active = true;
    async function loadAllCustomers() {
      setLoadingPos(true);
      try {
        const list = await customersRepo.getAll();
        if (active) {
          const sorted = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setAllPosCustomers(sorted);
        }
      } catch (err) {
        console.error('[OnlineAccountsTab] Failed to load POS customers:', err);
      } finally {
        if (active) setLoadingPos(false);
      }
    }
    loadAllCustomers();
    return () => { active = false; };
  }, []);

  // Memoized POS Customer Indexes for ultra-fast match suggestions
  const { posCustomersByEmail, posCustomersByPhone } = useMemo(() => {
    const emailMap = new Map<string, Customer>();
    const phoneMap = new Map<string, Customer>();

    allPosCustomers.forEach(c => {
      if (c.email) {
        emailMap.set(c.email.trim().toLowerCase(), c);
      }
      if (c.phone) {
        // Map all normalized phone keys to handle multiple numbers (e.g. "0801 / 0802")
        const keys = getNormalizedPhoneKeys(c.phone);
        keys.forEach(key => {
          if (key) {
            phoneMap.set(key, c);
          }
        });
      }
    });

    return { posCustomersByEmail: emailMap, posCustomersByPhone: phoneMap };
  }, [allPosCustomers]);

  // Memoized match resolution per shopUser
  const userMatches = useMemo(() => {
    const matchMap = new Map<string, Customer | null>();

    shopUsers.forEach(u => {
      if (u.linkedPosCustomerId) {
        matchMap.set(u.uid, null);
        return;
      }

      // Check email match
      if (u.email) {
        const emailMatch = posCustomersByEmail.get(u.email.trim().toLowerCase());
        if (emailMatch) {
          matchMap.set(u.uid, emailMatch);
          return;
        }
      }

      // Check phone match
      if (u.phone) {
        const phoneKey = normalizePhoneKey(u.phone);
        if (phoneKey) {
          const phoneMatch = posCustomersByPhone.get(phoneKey);
          if (phoneMatch) {
            matchMap.set(u.uid, phoneMatch);
            return;
          }
        }
      }

      matchMap.set(u.uid, null);
    });

    return matchMap;
  }, [shopUsers, posCustomersByEmail, posCustomersByPhone]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return shopUsers.filter(u => {
      // Filter by search query
      if (q) {
        const nameMatch = (u.displayName || '').toLowerCase().includes(q);
        const emailMatch = (u.email || '').toLowerCase().includes(q);
        const phoneMatch = (u.phone || '').includes(q);
        const posNameMatch = (u.linkedPosCustomerName || '').toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !phoneMatch && !posNameMatch) {
          return false;
        }
      }

      // Filter by tab mode
      if (filterMode === 'linked') {
        return !!u.linkedPosCustomerId;
      }
      if (filterMode === 'unlinked') {
        return !u.linkedPosCustomerId;
      }
      if (filterMode === 'suggested') {
        return !u.linkedPosCustomerId && !!userMatches.get(u.uid);
      }

      return true;
    });
  }, [shopUsers, searchQuery, filterMode, userMatches]);

  // Action: Link online user to a POS customer
  const handleLinkUser = async (shopUser: ShopUser, targetCustomer: Customer) => {
    if (!targetCustomer?.id) return;
    setActionLoadingUid(shopUser.uid);

    try {
      await syncCreditInfoToShopUser(targetCustomer, shopUser.uid);

      await logAudit(
        'LINK_ONLINE_ACCOUNT',
        `Linked online user ${shopUser.displayName || shopUser.email || shopUser.uid} to POS customer ${targetCustomer.name} (${targetCustomer.id})`,
        currentUser?.username || 'Unknown'
      );

      // Update in-memory state & cache immediately
      const updatedList = shopUsers.map(u => 
        u.uid === shopUser.uid 
          ? { ...u, linkedPosCustomerId: targetCustomer.id, linkedPosCustomerName: targetCustomer.name } 
          : u
      );
      shopUsersCache = updatedList;
      setShopUsers(updatedList);

      showToast(`Linked ${shopUser.displayName || shopUser.email || 'Online User'} to ${targetCustomer.name}`, 'success');
      if (onRefreshCustomers) onRefreshCustomers();
    } catch (err: any) {
      console.error('[OnlineAccountsTab] Link error:', err);
      showToast(err.message || 'Failed to link account', 'error');
    } finally {
      setActionLoadingUid(null);
    }
  };

  // Action: Unlink online user
  const handleUnlinkUser = async (shopUser: ShopUser) => {
    if (!shopUser.linkedPosCustomerId) return;
    if (!window.confirm(`Unlink ${shopUser.displayName || shopUser.email} from POS customer ${shopUser.linkedPosCustomerName || ''}?`)) return;

    setActionLoadingUid(shopUser.uid);

    try {
      await setDoc(doc(db, 'shopUsers', shopUser.uid), {
        linkedPosCustomerId: null,
        linkedPosCustomerName: null,
        creditInfo: null,
      }, { merge: true });

      await logAudit(
        'UNLINK_ONLINE_ACCOUNT',
        `Unlinked online user ${shopUser.displayName || shopUser.email || shopUser.uid} from POS customer ${shopUser.linkedPosCustomerName || shopUser.linkedPosCustomerId}`,
        currentUser?.username || 'Unknown'
      );

      const updatedList = shopUsers.map(u => 
        u.uid === shopUser.uid 
          ? { ...u, linkedPosCustomerId: null, linkedPosCustomerName: null, creditInfo: null } 
          : u
      );
      shopUsersCache = updatedList;
      setShopUsers(updatedList);

      showToast('Account unlinked successfully.', 'success');
      if (onRefreshCustomers) onRefreshCustomers();
    } catch (err: any) {
      console.error('[OnlineAccountsTab] Unlink error:', err);
      showToast(err.message || 'Failed to unlink account', 'error');
    } finally {
      setActionLoadingUid(null);
    }
  };

  const counts = useMemo(() => {
    let linked = 0;
    let unlinked = 0;
    let suggested = 0;

    shopUsers.forEach(u => {
      if (u.linkedPosCustomerId) {
        linked++;
      } else {
        unlinked++;
        if (userMatches.get(u.uid)) suggested++;
      }
    });

    return { total: shopUsers.length, linked, unlinked, suggested };
  }, [shopUsers, userMatches]);

  return (
    <div className="space-y-4">
      {/* Header controls & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="flex-1 min-w-0 md:max-w-xs relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 placeholder-slate-400"
            placeholder="Search online users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              filterMode === 'all' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({counts.total})
          </button>
          <button
            onClick={() => setFilterMode('suggested')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
              filterMode === 'suggested' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Suggested Matches ({counts.suggested})
          </button>
          <button
            onClick={() => setFilterMode('unlinked')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              filterMode === 'unlinked' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            Unlinked ({counts.unlinked})
          </button>
          <button
            onClick={() => setFilterMode('linked')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              filterMode === 'linked' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            Linked ({counts.linked})
          </button>
          <button
            onClick={() => fetchShopUsers(true)}
            disabled={refreshing}
            title="Refresh Online Users"
            className="p-2 border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-all ml-1 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
          <p className="text-sm font-medium text-slate-500">Loading online store users...</p>
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-16 bg-red-50/50 rounded-xl border border-red-200 text-center p-6">
          <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
          <p className="text-red-800 font-bold text-sm mb-1">Failed to load online accounts</p>
          <p className="text-red-600 text-xs max-w-md mb-4">{fetchError}</p>
          <button
            onClick={() => fetchShopUsers(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 p-6">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-700 font-bold text-base mb-1">
            {shopUsers.length === 0 ? 'No Online Store Accounts Found' : 'No Accounts Match Your Filter'}
          </p>
          <p className="text-slate-500 text-xs max-w-md mx-auto">
            {shopUsers.length === 0
              ? 'No customers have registered an online store account on your website yet. When customers register online, their profiles will automatically show up here.'
              : 'Try clearing your search or changing the filter pills above.'}
          </p>
          {shopUsers.length > 0 && searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setFilterMode('all'); }}
              className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-all"
            >
              Clear Search & Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUsers.map((user) => {
            const isLinked = !!user.linkedPosCustomerId;
            const suggestedMatch = userMatches.get(user.uid);
            const isLoadingThis = actionLoadingUid === user.uid;

            return (
              <div
                key={user.uid}
                className={`bg-white rounded-xl p-5 border shadow-sm flex flex-col justify-between transition-all hover:shadow-md ${
                  isLinked
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : suggestedMatch
                    ? 'border-indigo-300 ring-2 ring-indigo-500/10'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  {/* Top Badge & User Header */}
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold text-base shrink-0 border border-slate-200">
                        {(user.displayName || user.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 truncate text-sm">{user.displayName || 'Unnamed User'}</h4>
                        <p className="text-xs text-slate-500 truncate">{user.email || 'No email'}</p>
                        {user.phone && <p className="text-xs text-slate-500 truncate">{user.phone}</p>}
                      </div>
                    </div>

                    {isLinked ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> Linked
                      </span>
                    ) : suggestedMatch ? (
                      <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 animate-pulse">
                        <UserCheck className="w-3 h-3" /> Match Found
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0">
                        Unlinked
                      </span>
                    )}
                  </div>

                  {/* Status Section */}
                  {isLinked ? (
                    <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Linked POS Profile</span>
                      <p className="text-xs font-bold text-emerald-950 mt-0.5">{user.linkedPosCustomerName || 'Associated Customer'}</p>
                      <p className="text-[10px] text-emerald-600">ID: {user.linkedPosCustomerId}</p>
                    </div>
                  ) : suggestedMatch ? (
                    <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">Suggested POS Match</span>
                        <span className="text-[10px] bg-indigo-200 text-indigo-900 font-bold px-1.5 py-0.5 rounded">Auto Match</span>
                      </div>
                      <p className="text-xs font-bold text-indigo-950 mt-0.5">{suggestedMatch.name}</p>
                      <p className="text-[10px] text-indigo-600">{suggestedMatch.email || suggestedMatch.phone}</p>
                    </div>
                  ) : (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                      <span className="text-[10px] font-semibold text-slate-400 block mb-0.5">Select POS Customer to Link</span>
                      <input
                        type="text"
                        placeholder="Search POS customer..."
                        value={dropdownSearch[user.uid] || ''}
                        onChange={(e) => setDropdownSearch({ ...dropdownSearch, [user.uid]: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg text-xs p-1.5 outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-400 font-medium"
                      />
                      <select
                        value={selectedMapping[user.uid] || ''}
                        onChange={(e) => setSelectedMapping({ ...selectedMapping, [user.uid]: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg text-xs p-2 text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                      >
                        <option value="">-- Choose POS Customer --</option>
                        {filteredPosCustomersForUser(user.uid).map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.phone || c.email || 'No contact'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                    {isLinked ? (
                      <button
                        onClick={() => handleUnlinkUser(user)}
                        disabled={isLoadingThis}
                        className="w-full py-2 bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        {isLoadingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Unlink className="w-3.5 h-3.5" /> Unlink Profile</>}
                      </button>
                    ) : suggestedMatch ? (
                      <button
                        onClick={() => handleLinkUser(user, suggestedMatch)}
                        disabled={isLoadingThis}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-100"
                      >
                        {isLoadingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><LinkIcon className="w-3.5 h-3.5" /> 1-Click Link to {suggestedMatch.name}</>}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const targetId = selectedMapping[user.uid];
                          const targetCustomer = allPosCustomers.find(c => c.id === targetId);
                          if (targetCustomer) {
                            handleLinkUser(user, targetCustomer);
                          } else {
                            showToast('Please select a POS customer first.', 'warning');
                          }
                        }}
                        disabled={isLoadingThis || !selectedMapping[user.uid]}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40"
                      >
                        {isLoadingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><LinkIcon className="w-3.5 h-3.5" /> Link Selected Customer</>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
