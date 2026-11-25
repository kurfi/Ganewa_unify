import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { auth, db } from '../firebase/config';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updatePassword as firebaseUpdatePassword
} from 'firebase/auth';
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCashier: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          const roleFromClaim = (tokenResult.claims.role as UserRole) || undefined;

          // Fetch user metadata from Firestore
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.exists() ? userDoc.data() : {};

          const resolvedRole = roleFromClaim || (userData.role as UserRole) || UserRole.CASHIER;

          setCurrentUser({
            id: firebaseUser.uid,
            username: userData.username || firebaseUser.email?.split('@')[0] || 'staff',
            name: userData.name || firebaseUser.displayName || 'Staff Member',
            role: resolvedRole,
            active: userData.active !== false,
            created_at: userData.created_at || new Date().toISOString()
          } as User);
        } catch (err) {
          console.error('[AuthContext] Failed to load user profile:', err);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    setLoading(true);
    try {
      let email = usernameOrEmail.trim();

      // If entered a plain username, resolve email from Firestore users collection
      if (!email.includes('@')) {
        const q = query(collection(db, 'users'), where('username', '==', email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data();
          email = docData.email || `${email}@ganewa.store`;
        } else {
          email = `${email}@ganewa.store`;
        }
      }

      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error: any) {
      console.error("[AuthContext] Firebase Login failed:", error);
      return { success: false, error: error.message || 'Authentication failed. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    setCurrentUser(null);
  };

  const changePassword = async (newPassword: string) => {
    try {
      if (auth.currentUser) {
        await firebaseUpdatePassword(auth.currentUser, newPassword);
        
        // Notify backend to clear mustChangePassword custom claim
        try {
          const { getFunctions, httpsCallable } = await import('firebase/functions');
          const functions = getFunctions(undefined, 'us-central1');
          const completePasswordChangeFn = httpsCallable(functions, 'completePasswordChange');
          await completePasswordChangeFn().catch(() => {});
          // If standalone, we also update the user's Firestore doc directly
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            mustChangePassword: false
          }).catch(() => {});
        } catch (_) {}

        return { success: true };
      }
      return { success: false, error: 'Password change not supported for this user.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    logout,
    changePassword,
    isAdmin: currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_ADMIN,
    isSuperAdmin: currentUser?.role === UserRole.SUPER_ADMIN,
    isCashier: currentUser?.role === UserRole.CASHIER
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}