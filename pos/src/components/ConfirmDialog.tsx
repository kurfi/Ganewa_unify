import React from 'react';
import { AlertCircle, HelpCircle, Info, CheckCircle2, X } from 'lucide-react';
import { useModalRegistration } from '../contexts/ModalContext';

export type DialogType = 'info' | 'confirm' | 'warning' | 'error' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  showCancel?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'confirm',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  showCancel = true,
}) => {
  useModalRegistration(isOpen);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return <AlertCircle className="w-12 h-12 text-amber-500" />;
      case 'error':
        return <AlertCircle className="w-12 h-12 text-red-500" />;
      case 'success':
        return <CheckCircle2 className="w-12 h-12 text-emerald-500" />;
      case 'info':
        return <Info className="w-12 h-12 text-blue-500" />;
      default:
        return <HelpCircle className="w-12 h-12 text-indigo-500" />;
    }
  };

  const getConfirmButtonStyles = () => {
    switch (type) {
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700';
      case 'error':
        return 'bg-red-600 hover:bg-red-700';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700';
      case 'info':
        return 'bg-blue-600 hover:bg-blue-700';
      default:
        return 'bg-indigo-600 hover:bg-indigo-700';
    }
  };

  return (
    <div role="dialog" aria-modal="true" data-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-3 bg-slate-50 rounded-full">
              {getIcon()}
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">{title}</h3>
              <p className="mt-2 text-slate-600 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-slate-50 flex gap-3">
          {showCancel && (
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-white font-semibold rounded-xl shadow-sm transition-all active:scale-95 ${getConfirmButtonStyles()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
