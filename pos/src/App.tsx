import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Returns from './pages/Returns';
import Suppliers from './pages/Suppliers';
import Purchases from './pages/Purchases';
import LoginPage from './pages/LoginPage';
import Orders from './pages/Orders';
import { ToastProvider } from './contexts/ToastContext';
import { DialogProvider } from './contexts/DialogContext';
import { createAppDirectories } from './services/directoryService';
import { startSyncService } from './services/syncService';
import { SyncProvider } from './contexts/SyncContext';
import OfflineIndicator from './components/OfflineIndicator';
import { initNetworkManager } from './utils/networkManager';
import { runSync } from './utils/syncManager';
import { db as firestoreDb } from './firebase/config';

// Top-level function for one-time application initialization
const initializeAppServices = async () => {
  // Remove stale cache from old service worker if present
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    const staleCaches = cacheNames.filter(name =>
      name.startsWith('ak-alheri-chemist') || name === 'ak-alheri-chemist-v4'
    );
    await Promise.all(staleCaches.map(name => caches.delete(name)));
    if (staleCaches.length > 0) {
      console.log(`[PWA] Cleared ${staleCaches.length} stale cache(s)`);
    }
  }

  await createAppDirectories();
  initNetworkManager(firestoreDb, () => {
    runSync();
  });
};


import { UserRole } from './types';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles: UserRole[] }) {
  const { currentUser } = useAuth();
  if (!currentUser || !roles.includes(currentUser.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

const ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
// @ts-ignore - used for reference or future extension
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ALL_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.CASHIER];

function AppRoutes() {
  const { currentUser } = useAuth();
  
  useEffect(() => {
    startSyncService();
  }, []);

  if (!currentUser) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/settings" element={<Settings />} />
        
        {/* Admin only routes */}
        <Route path="/inventory" element={<ProtectedRoute roles={ADMIN_ROLES}><Inventory /></ProtectedRoute>} />
        <Route path="/suppliers" element={<ProtectedRoute roles={ADMIN_ROLES}><Suppliers /></ProtectedRoute>} />
        <Route path="/purchases" element={<ProtectedRoute roles={ADMIN_ROLES}><Purchases /></ProtectedRoute>} />
        <Route path="/expenses" element={<ProtectedRoute roles={ADMIN_ROLES}><Expenses /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={ADMIN_ROLES}><Reports /></ProtectedRoute>} />
        <Route path="/returns" element={<ProtectedRoute roles={ADMIN_ROLES}><Returns /></ProtectedRoute>} />
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    initializeAppServices();
  }, []);

  return (
    <>
      <Router>
        <AuthProvider>
          <ToastProvider>
            <DialogProvider>
              <SyncProvider>
                <AppRoutes />
                <OfflineIndicator />
              </SyncProvider>
            </DialogProvider>
          </ToastProvider>
        </AuthProvider>
      </Router>
    </>
  );
}

export default App;
