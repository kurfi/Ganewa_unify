import React, { useState, useEffect } from 'react';
import { X, Search, Link as LinkIcon, Unlink, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../auth/AuthContext';
import { logAudit } from '../../firebase/firestoreHelpers';
import { db, fastDb, ensureSilentAuth } from '../../firebase/config';
import { doc, setDoc, query, collection, where, getDocs, limit } from 'firebase/firestore';
import { Customer } from '../../types';
import { syncCreditInfoToShopUser } from '../../utils/creditInfoSync';

import { getPhoneVariants } from '../../utils/phoneNormalization';

interface LinkOnlineAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onLinkStatusChanged?: () => void;
}

export function LinkOnlineAccountModal({ isOpen, onClose, customer, onLinkStatusChanged }: LinkOnlineAccountModalProps) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [searchValue, setSearchValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [matchedUser, setMatchedUser] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  
  const [linkedUser, setLinkedUser] = useState<any | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  // Search online account helper
  const performAccountSearch = async (queryTerm: string) => {
    const searchVal = queryTerm.trim();
    if (!searchVal) return;

    setSearching(true);
    setError('');
    setMatchedUser(null);
    setWarning('');
    setConfirmOverwrite(false);

    try {
      await ensureSilentAuth();
      const isEmail = searchVal.includes('@');
      let snap;

      if (isEmail) {
        // Firestore is case-sensitive, normalize email search to lowercase
        const normalizedEmail = searchVal.toLowerCase();
        const q = query(
          collection(fastDb, 'shopUsers'),
          where('email', '==', normalizedEmail),
          limit(1)
        );
        snap = await getDocs(q);
      } else {
        // Clean phone inputs (strip formatting/whitespaces) before searching
        const normalizedPhone = searchVal.replace(/[^\d+]/g, '');
        const variants = getPhoneVariants(normalizedPhone);
        if (variants.length > 0) {
          const q = query(
            collection(fastDb, 'shopUsers'),
            where('phone', 'in', variants),
            limit(1)
          );
          snap = await getDocs(q);
        } else {
          const q = query(
            collection(fastDb, 'shopUsers'),
            where('phone', '==', searchVal),
            limit(1)
          );
          snap = await getDocs(q);
        }
      }

      if (!snap || snap.empty) {
        // Fallback: if search was e.g. a phone or email that failed, try phone variants as second chance
        if (isEmail && customer?.phone) {
          const variants = getPhoneVariants(customer.phone);
          if (variants.length > 0) {
            const qFallback = query(
              collection(fastDb, 'shopUsers'),
              where('phone', 'in', variants),
              limit(1)
            );
            const snapFallback = await getDocs(qFallback);
            if (!snapFallback.empty) {
              snap = snapFallback;
            }
          }
        }
      }

      if (!snap || snap.empty) {
        setError('No online account found for that email or phone. The customer must register an online account first.');
        return;
      }

      const userData = snap.docs[0].data();
      const matched: { uid: string; [key: string]: any } = { uid: snap.docs[0].id, ...userData };
      setMatchedUser(matched);

      // Warning checking
      if (matched.linkedPosCustomerId && matched.linkedPosCustomerId !== customer?.id) {
        setWarning(`This online account is already linked to "${matched.linkedPosCustomerName || 'another customer'}" (ID: ${matched.linkedPosCustomerId}). Linking will overwrite that link.`);
      } else if (linkedUser && linkedUser.uid !== matched.uid) {
        setWarning(`This POS customer is already linked to a different online account (${linkedUser.email || linkedUser.phone || linkedUser.uid}). Linking will overwrite that link.`);
      }
    } catch (err: any) {
      console.error('[LinkModal] Search failed:', err);
      setError(err.message || 'Failed to search online account.');
    } finally {
      setSearching(false);
    }
  };

  // Fetch existing link if any when customer changes or modal opens
  const checkExistingLink = async () => {
    if (!customer?.id) return;
    setLoadingLink(true);
    try {
      const q = query(
        collection(fastDb, 'shopUsers'),
        where('linkedPosCustomerId', '==', customer.id),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setLinkedUser({ uid: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setLinkedUser(null);
      }
    } catch (err: any) {
      console.error('[LinkModal] Error checking existing link:', err);
    } finally {
      setLoadingLink(false);
    }
  };

  useEffect(() => {
    if (isOpen && customer) {
      const initialQuery = customer.email?.trim() || customer.phone?.trim() || '';
      setSearchValue(initialQuery);
      setMatchedUser(null);
      setError('');
      setWarning('');
      setConfirmOverwrite(false);
      checkExistingLink();

      if (initialQuery) {
        performAccountSearch(initialQuery);
      }
    }
  }, [isOpen, customer]);

  if (!isOpen || !customer) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;
    await performAccountSearch(searchValue);
  };

  const handleLink = async () => {
    if (!customer || !matchedUser) return;

    setLoadingLink(true);
    try {
      // 1. If warning is present and not confirmed yet, require confirmation
      if (warning && !confirmOverwrite) {
        setConfirmOverwrite(true);
        setLoadingLink(false);
        return;
      }

      // 2. If the POS customer was previously linked to a DIFFERENT online account, clear it
      if (linkedUser && linkedUser.uid !== matchedUser.uid) {
        await setDoc(doc(db, 'shopUsers', linkedUser.uid), {
          linkedPosCustomerId: null,
          linkedPosCustomerName: null,
          creditInfo: null,
        }, { merge: true });

        await logAudit(
          'UNLINK_ONLINE_ACCOUNT',
          `Unlinked customer ${customer.name} (${customer.id}) from previous online account ${linkedUser.email || linkedUser.uid} during re-link`,
          currentUser?.username || 'Unknown'
        );
      }

      // 3. Write directly using syncCreditInfoToShopUser
      await syncCreditInfoToShopUser(customer, matchedUser.uid);

      // 4. Log audit
      await logAudit(
        'LINK_ONLINE_ACCOUNT',
        `Linked customer ${customer.name} (${customer.id}) to online account ${matchedUser.email || matchedUser.phone || matchedUser.uid}`,
        currentUser?.username || 'Unknown'
      );

      showToast(`Successfully linked customer to ${matchedUser.displayName || matchedUser.email || matchedUser.phone}`, 'success');
      onLinkStatusChanged?.();
      onClose();
    } catch (err: any) {
      console.error('[LinkModal] Linking failed:', err);
      showToast(err.message || 'Failed to link account', 'error');
    } finally {
      setLoadingLink(false);
    }
  };

  const handleUnlink = async () => {
    if (!customer || !linkedUser) return;

    if (!window.confirm(`Are you sure you want to unlink ${customer.name} from online account ${linkedUser.email || linkedUser.phone}?`)) {
      return;
    }

    setLoadingLink(true);
    try {
      await setDoc(doc(db, 'shopUsers', linkedUser.uid), {
        linkedPosCustomerId: null,
        linkedPosCustomerName: null,
        creditInfo: null,
      }, { merge: true });

      await logAudit(
        'UNLINK_ONLINE_ACCOUNT',
        `Unlinked customer ${customer.name} (${customer.id}) from online account ${linkedUser.email || linkedUser.phone || linkedUser.uid}`,
        currentUser?.username || 'Unknown'
      );

      showToast('Successfully unlinked store account', 'success');
      setLinkedUser(null);
      onLinkStatusChanged?.();
    } catch (err: any) {
      console.error('[LinkModal] Unlinking failed:', err);
      showToast(err.message || 'Failed to unlink account', 'error');
    } finally {
      setLoadingLink(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl border border-slate-100 relative flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all duration-150"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm border border-indigo-100">
            <LinkIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Link Online Account</h2>
            <p className="text-xs text-slate-500">Manage online account link for <span className="font-bold text-slate-700">{customer.name}</span></p>
          </div>
        </div>

        {/* Current Linked Account Section */}
        {loadingLink ? (
          <div className="flex items-center justify-center py-6 bg-slate-50 rounded-2xl mb-6">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="ml-2 text-sm font-medium text-slate-500">Checking link status...</span>
          </div>
        ) : linkedUser ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Linked Online Account</span>
              <p className="text-base font-black text-emerald-950 mt-1">{linkedUser.displayName || 'Unnamed Account'}</p>
              <p className="text-xs font-semibold text-emerald-700 mt-0.5">{linkedUser.email || 'No email'}</p>
              <p className="text-xs font-semibold text-emerald-700">{linkedUser.phone || 'No phone'}</p>
            </div>
            <button
              onClick={handleUnlink}
              disabled={loadingLink}
              className="w-full sm:w-auto bg-white hover:bg-red-50 text-red-500 border border-slate-200 hover:border-red-100 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Unlink className="w-3.5 h-3.5" />
              Unlink Account
            </button>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl p-4 text-xs font-medium mb-6">
            This customer profile is not linked to any online store account.
          </div>
        )}

        {/* Search for Account */}
        {!linkedUser && (
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Search Customer's Online Email or Phone
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. customer@example.com or 08012345678"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-900 placeholder-slate-400 bg-slate-50/50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !searchValue.trim()}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0 shadow-sm"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-3 text-xs font-semibold">
                {error}
              </div>
            )}

            {matchedUser && (
              <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-4 animate-in fade-in duration-200">
                <div className="border-b border-slate-200 pb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Match Found</span>
                  <p className="text-base font-black text-slate-800 mt-1">{matchedUser.displayName || 'Unnamed User'}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">{matchedUser.email || 'No email'}</p>
                  <p className="text-xs font-semibold text-slate-500">{matchedUser.phone || 'No phone'}</p>
                </div>

                {warning && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3.5 text-xs font-semibold flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{warning}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleLink}
                  disabled={loadingLink}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5 shadow-md ${
                    warning && !confirmOverwrite
                      ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-100'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100'
                  }`}
                >
                  {loadingLink ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : warning && !confirmOverwrite ? (
                    'Confirm Overwrite & Link'
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Link Account
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        )}

        <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl text-sm transition-all shadow-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
