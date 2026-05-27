import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    updateProfile as updateFirebaseProfile,
    type User as FirebaseUser,
} from 'firebase/auth';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

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
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const googleProvider = new GoogleAuthProvider();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

async function createOrFetchProfile(user: FirebaseUser): Promise<UserProfile> {
    const ref = doc(db, 'shopUsers', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        return snap.data() as UserProfile;
    }
    const newProfile: UserProfile = {
        uid: user.uid,
        displayName: user.displayName || '',
        email: user.email || '',
        phone: user.phoneNumber || '',
        photoURL: user.photoURL || '',
        addresses: [],
    };
    await setDoc(ref, { ...newProfile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return newProfile;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [authModal, setAuthModal] = useState<AuthModalState>({ open: false, mode: 'login' });

    // Listen to Firebase Auth state
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                try {
                    const p = await createOrFetchProfile(firebaseUser);
                    setProfile(p);
                } catch (e) {
                    console.error('Error fetching user profile:', e);
                }
            } else {
                setProfile(null);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
        setAuthModal({ open: true, mode });
    }, []);

    const closeAuthModal = useCallback(() => {
        setAuthModal(prev => ({ ...prev, open: false }));
    }, []);

    const signInWithGoogle = async () => {
        const result = await signInWithPopup(auth, googleProvider);
        await createOrFetchProfile(result.user);
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
        const newProfile: UserProfile = {
            uid: result.user.uid,
            displayName: name,
            email,
            phone,
            photoURL: '',
            addresses: [],
        };
        await setDoc(ref, { ...newProfile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        setProfile(newProfile);
        closeAuthModal();
    };

    const logout = async () => {
        await firebaseSignOut(auth);
        setProfile(null);
    };

    const updateUserProfile = async (data: Partial<Pick<UserProfile, 'displayName' | 'phone' | 'photoURL'>>) => {
        if (!user) return;
        const ref = doc(db, 'shopUsers', user.uid);
        await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
        if (data.displayName) {
            await updateFirebaseProfile(user, { displayName: data.displayName });
        }
        setProfile(prev => prev ? { ...prev, ...data } : prev);
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
        setProfile(prev => prev ? { ...prev, addresses } : prev);
    };

    const removeAddress = async (id: string) => {
        if (!user || !profile) return;
        const addresses = profile.addresses.filter(a => a.id !== id);
        const ref = doc(db, 'shopUsers', user.uid);
        await updateDoc(ref, { addresses, updatedAt: serverTimestamp() });
        setProfile(prev => prev ? { ...prev, addresses } : prev);
    };

    const setDefaultAddress = async (id: string) => {
        if (!user || !profile) return;
        const addresses = profile.addresses.map(a => ({ ...a, isDefault: a.id === id }));
        const ref = doc(db, 'shopUsers', user.uid);
        await updateDoc(ref, { addresses, updatedAt: serverTimestamp() });
        setProfile(prev => prev ? { ...prev, addresses } : prev);
    };

    return (
        <AuthContext.Provider value={{
            user, profile, loading, authModal,
            openAuthModal, closeAuthModal,
            signInWithGoogle, signInWithEmail, registerWithEmail,
            logout, updateUserProfile, addAddress, removeAddress, setDefaultAddress,
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
