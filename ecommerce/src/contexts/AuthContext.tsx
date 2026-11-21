import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    updateProfile as updateFirebaseProfile,
    sendPasswordResetEmail,
    fetchSignInMethodsForEmail,
    type User as FirebaseUser,
} from 'firebase/auth';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    collection,
    query,
    where,
    getDocs,
    limit,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { CreditInfo } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Address {
    id: string;
    label: 'Home' | 'Work' | 'Other';
    street: string;
    city: string;
    state: string;
    isDefault: boolean;
}

export interface UserProfile {
    uid: string;
    displayName: string;
    email: string;
    phone: string;
    photoURL?: string;
    addresses: Address[];
    createdAt?: any;
    updatedAt?: any;
    linkedPosCustomerId?: string | null;
    linkedPosCustomerName?: string | null;
    /** Denormalized credit snapshot, written by POS via creditInfoSync.ts. Read-only in ecommerce. */
    creditInfo?: CreditInfo | null;
}

interface AuthModalState {
    open: boolean;
    mode: 'login' | 'register';
}

interface AuthContextType {
    user: FirebaseUser | null;
    profile: UserProfile | null;
    loading: boolean;
    authModal: AuthModalState;
    openAuthModal: (mode?: 'login' | 'register') => void;
    closeAuthModal: () => void;
    signInWithGoogle: () => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    registerWithEmail: (name: string, email: string, phone: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    updateUserProfile: (data: Partial<Pick<UserProfile, 'displayName' | 'phone' | 'photoURL'>>) => Promise<void>;
    addAddress: (address: Omit<Address, 'id'>) => Promise<void>;
    removeAddress: (id: string) => Promise<void>;
    setDefaultAddress: (id: string) => Promise<void>;
    unlinkPosAccount: () => Promise<void>;
    sendPasswordReset: (email: string) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const googleProvider = new GoogleAuthProvider();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

async function ensureProfileExists(user: FirebaseUser): Promise<void> {
    const ref = doc(db, 'shopUsers', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        const newProfile: Omit<UserProfile, 'creditInfo'> = {
            uid: user.uid,
            displayName: user.displayName || '',
            email: user.email || '',
            phone: user.phoneNumber || '',
            photoURL: user.photoURL || '',
            addresses: [],
        };
        await setDoc(ref, { ...newProfile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [authModal, setAuthModal] = useState<AuthModalState>({ open: false, mode: 'login' });

    // Holds the active Firestore onSnapshot unsubscribe fn for the current user's profile.
    // Stored in a ref so it doesn't trigger re-renders and is always the latest value.
    const profileUnsubRef = useRef<(() => void) | null>(null);

    /**
     * Attaches a real-time Firestore listener to shopUsers/{uid}.
     * Any update to the document (including creditInfo written by POS) is
     * immediately reflected in the profile state without a page refresh.
     */
    const attachProfileListener = useCallback((uid: string) => {
        // Detach any previous listener first.
        if (profileUnsubRef.current) {
            profileUnsubRef.current();
            profileUnsubRef.current = null;
        }

        const ref = doc(db, 'shopUsers', uid);
        const unsub = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                setProfile(snap.data() as UserProfile);
            }
        }, (error) => {
            console.error('[AuthContext] Profile snapshot error:', error);
        });

        profileUnsubRef.current = unsub;
    }, []);

    // Listen to Firebase Auth state
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                try {
                    // Ensure profile document exists (first sign-in via Google, etc.)
                    await ensureProfileExists(firebaseUser);
                    // Attach real-time listener — handles both initial load and live updates.
                    attachProfileListener(firebaseUser.uid);
                } catch (e) {
                    console.error('[AuthContext] Error setting up profile listener:', e);
                }
            } else {
                // User signed out — detach listener and clear state.
                if (profileUnsubRef.current) {
                    profileUnsubRef.current();
                    profileUnsubRef.current = null;
                }
                setProfile(null);
            }
            setLoading(false);
        });

        return () => {
            unsubscribeAuth();
            // Clean up profile listener on unmount.
            if (profileUnsubRef.current) {
                profileUnsubRef.current();
                profileUnsubRef.current = null;
            }
        };
    }, [attachProfileListener]);

    const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
        setAuthModal({ open: true, mode });
    }, []);

    const closeAuthModal = useCallback(() => {
        setAuthModal(prev => ({ ...prev, open: false }));
    }, []);

    const signInWithGoogle = async () => {
        const result = await signInWithPopup(auth, googleProvider);
        await ensureProfileExists(result.user);
        closeAuthModal();
    };

    const signInWithEmail = async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
        closeAuthModal();
    };

    const registerWithEmail = async (name: string, email: string, phone: string, password: string) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateFirebaseProfile(result.user, { displayName: name });
        const ref = doc(db, 'shopUsers', result.user.uid);
        const newProfile: Omit<UserProfile, 'creditInfo'> = {
            uid: result.user.uid,
            displayName: name,
            email,
            phone,
            photoURL: '',
            addresses: [],
        };
        await setDoc(ref, { ...newProfile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        // The onSnapshot listener attached by onAuthStateChanged will pick up the new doc.
        closeAuthModal();
    };

    const logout = async () => {
        await firebaseSignOut(auth);
        // onAuthStateChanged callback handles detaching the listener and clearing state.
    };

    const updateUserProfile = async (data: Partial<Pick<UserProfile, 'displayName' | 'phone' | 'photoURL'>>) => {
        if (!user) return;
        const ref = doc(db, 'shopUsers', user.uid);
        await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
        if (data.displayName) {
            await updateFirebaseProfile(user, { displayName: data.displayName });
        }
        // onSnapshot will update profile state automatically.
    };

    const addAddress = async (address: Omit<Address, 'id'>) => {
        if (!user || !profile) return;
        const newAddress: Address = { ...address, id: generateId() };
        let addresses = [...profile.addresses];
        if (address.isDefault) {
            addresses = addresses.map(a => ({ ...a, isDefault: false }));
        }
        addresses.push(newAddress);
        const ref = doc(db, 'shopUsers', user.uid);
        await updateDoc(ref, { addresses, updatedAt: serverTimestamp() });
        // onSnapshot updates state.
    };

    const removeAddress = async (id: string) => {
        if (!user || !profile) return;
        const addresses = profile.addresses.filter(a => a.id !== id);
        const ref = doc(db, 'shopUsers', user.uid);
        await updateDoc(ref, { addresses, updatedAt: serverTimestamp() });
    };

    const setDefaultAddress = async (id: string) => {
        if (!user || !profile) return;
        const addresses = profile.addresses.map(a => ({ ...a, isDefault: a.id === id }));
        const ref = doc(db, 'shopUsers', user.uid);
        await updateDoc(ref, { addresses, updatedAt: serverTimestamp() });
    };


    const unlinkPosAccount = async () => {
        if (!user || !profile) throw new Error("Not authenticated");

        const userRef = doc(db, 'shopUsers', user.uid);
        await updateDoc(userRef, {
            linkedPosCustomerId: null,
            linkedPosCustomerName: null,
            creditInfo: null,
            updatedAt: serverTimestamp()
        });
        // onSnapshot propagates the change.
    };

    const sendPasswordReset = async (email: string) => {
        const cleanEmail = email.trim();
        let isRegistered = false;

        // Step 1: Check using Firebase Auth sign-in methods
        try {
            const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
            if (methods && methods.length > 0) {
                isRegistered = true;
            }
        } catch (authErr: any) {
            console.warn('[sendPasswordReset] Auth check failed or operation-not-allowed:', authErr);
            // If the email is invalid, propagate immediately
            if (authErr.code === 'auth/invalid-email') {
                throw authErr;
            }
        }

        // Step 2: If auth check didn't confirm registration, try Firestore fallback
        if (!isRegistered) {
            try {
                const q = query(
                    collection(db, 'shopUsers'),
                    where('email', '==', cleanEmail),
                    limit(1)
                );
                const querySnap = await getDocs(q);
                if (!querySnap.empty) {
                    isRegistered = true;
                }
            } catch (dbErr: any) {
                console.warn('[sendPasswordReset] Firestore fallback check blocked/failed:', dbErr);
                // If blocked by security rules, we assume true to allow normal sendPasswordResetEmail behavior
                // (so we don't block legitimate users if Firestore rules are strict).
                isRegistered = true; 
            }
        }

        // Step 3: If definitely not registered, throw the user-not-found error
        if (!isRegistered) {
            const notFoundError = new Error('No account found with this email address.');
            (notFoundError as any).code = 'auth/user-not-found';
            throw notFoundError;
        }

        // Step 4: Proceed with sending password reset email
        await sendPasswordResetEmail(auth, cleanEmail);
    };

    return (
        <AuthContext.Provider value={{
            user, profile, loading, authModal,
            openAuthModal, closeAuthModal,
            signInWithGoogle, signInWithEmail, registerWithEmail,
            logout, updateUserProfile, addAddress, removeAddress, setDefaultAddress,
            unlinkPosAccount, sendPasswordReset
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
