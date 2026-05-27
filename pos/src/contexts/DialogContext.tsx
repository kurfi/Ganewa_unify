import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ConfirmDialog, { DialogType } from '../components/ConfirmDialog';

interface DialogOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  type?: DialogType;
  showCancel?: boolean;
}

interface DialogContextType {
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
  alert: (message: string, options?: DialogOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: DialogType;
    confirmText: string;
    cancelText: string;
    showCancel: boolean;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((message: string, options: DialogOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setDialogConfig({
        isOpen: true,
        title: options.title || 'Are you sure?',
        message,
        type: options.type || 'confirm',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        showCancel: options.showCancel ?? true,
        resolve,
      });
    });
  }, []);

  const alert = useCallback((message: string, options: DialogOptions = {}) => {
    return new Promise<void>((resolve) => {
      setDialogConfig({
        isOpen: true,
        title: options.title || 'Attention',
        message,
        type: options.type || 'info',
        confirmText: options.confirmText || 'OK',
        cancelText: '',
        showCancel: false,
        resolve: () => resolve(),
      });
    });
  }, []);

  const handleConfirm = () => {
    if (dialogConfig) {
      dialogConfig.resolve(true);
      setDialogConfig(null);
    }
  };

  const handleCancel = () => {
    if (dialogConfig) {
      dialogConfig.resolve(false);
      setDialogConfig(null);
    }
  };

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {dialogConfig && (
        <ConfirmDialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          type={dialogConfig.type}
          confirmText={dialogConfig.confirmText}
          cancelText={dialogConfig.cancelText}
          showCancel={dialogConfig.showCancel}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};
