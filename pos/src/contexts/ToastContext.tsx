// contexts/ToastContext.tsx
import React, { createContext, useState, useContext, ReactNode, useCallback, useRef } from 'react';
import Toast from '../components/Toast';

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimeoutId = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    // Clear any existing timeout to prevent multiple toasts overlapping
    if (toastTimeoutId.current) {
      clearTimeout(toastTimeoutId.current);
    }

    setToast({ message, type });

    const id = setTimeout(() => {
      setToast(null);
      toastTimeoutId.current = null;
    }, 3000); // Toast disappears after 3 seconds
    toastTimeoutId.current = id;
  }, []);

  const closeToast = useCallback(() => {
    if (toastTimeoutId.current) {
      clearTimeout(toastTimeoutId.current);
      toastTimeoutId.current = null;
    }
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};


