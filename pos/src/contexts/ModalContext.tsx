/**
 * ModalContext — tracks how many modals/dialogs are currently mounted.
 *
 * Any component that represents a full overlay modal should call
 * `useModalRegistration()` at the top of its body. The hook
 * increments the depth counter on mount and decrements it on unmount,
 * so the barcode scanner (and any future global listener) can gate
 * on `modalDepth > 0` to know a modal is open.
 *
 * Usage in a modal component:
 *   import { useModalRegistration } from '../../contexts/ModalContext';
 *   export function MyModal({ isOpen, ... }) {
 *     useModalRegistration(isOpen); // pass the open boolean
 *     if (!isOpen) return null;
 *     ...
 *   }
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

interface ModalContextType {
  /** Number of modals currently open. > 0 means at least one modal is active. */
  modalDepth: number;
  /** Internal: called by useModalRegistration — do not call directly. */
  _openModal: () => void;
  /** Internal: called by useModalRegistration — do not call directly. */
  _closeModal: () => void;
}

const defaultModalContext: ModalContextType = {
  modalDepth: 0,
  _openModal: () => {},
  _closeModal: () => {},
};

const ModalContext = createContext<ModalContextType>(defaultModalContext);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalDepth, setModalDepth] = useState(0);

  const _openModal = useCallback(() => {
    setModalDepth((d) => d + 1);
  }, []);

  const _closeModal = useCallback(() => {
    setModalDepth((d) => Math.max(0, d - 1));
  }, []);

  return (
    <ModalContext.Provider value={{ modalDepth, _openModal, _closeModal }}>
      {children}
    </ModalContext.Provider>
  );
};

/**
 * Returns the raw modal context (depth + helpers).
 * Prefer `useModalRegistration` in modal components.
 */
export const useModalContext = (): ModalContextType => {
  const ctx = useContext(ModalContext);
  return ctx || defaultModalContext;
};

/**
 * Drop this call at the top of any modal/dialog component.
 *
 * @param isOpen - The boolean that controls whether the modal is rendered/visible.
 *                 When true the depth counter increments; when it flips to false
 *                 (or the component unmounts) the counter decrements.
 */
export function useModalRegistration(isOpen: boolean): void {
  const { _openModal, _closeModal } = useModalContext();

  useEffect(() => {
    if (!isOpen) return;
    _openModal();
    return () => {
      _closeModal();
    };
  }, [isOpen, _openModal, _closeModal]);
}
