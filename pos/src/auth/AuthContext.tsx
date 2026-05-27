import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { db } from '../db/db';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCashier: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedUser = sessionStorage.getItem('ganewa_auth_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(false);

  const login = async (username: string, password: string) => {
    setLoading(true);
    try {

      // 2. Check local Dexie 'users' table
      const user = await db.users.where('username').equalsIgnoreCase(username).first();
      
      if (user && user.password === password) {
        setCurrentUser(user);
        sessionStorage.setItem('ganewa_auth_user', JSON.stringify(user));
        return { success: true };
      }

      return { success: false, error: 'Invalid username or password' };
    } catch (error: any) {
      console.error("Login failed:", error);
      return { success: false, error: 'Authentication failed. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setCurrentUser(null);
    sessionStorage.removeItem('ganewa_auth_user');
  };

  const changePassword = async (newPassword: string) => {
    try {
      if (currentUser && currentUser.id) {
        await db.users.update(currentUser.id, { password: newPassword });
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