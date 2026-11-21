/**
 * useGlobalBarcodeScanner — app-wide barcode scanner listener.
 *
 * Mount this hook ONCE in the top-level authenticated shell (Layout.tsx).
 * It listens for keydown events on `window`, accumulates characters that
 * arrive in rapid succession (< 50ms apart), and treats the sequence as a
 * barcode scan when terminated by an Enter key.
 *
 * Disabled conditions (listener yields completely, let keystrokes & Enter behave normally):
 *  a. Any modal is open:
 *     - Checked via ModalContext (`modalDepth > 0`)
 *     - Fallback DOM check for `[data-modal="true"]`, `[role="dialog"]`, `[aria-modal="true"]`
 *  b. Focus is inside an input/textarea/contenteditable where manual entry matters:
 *     - Checked generically across any element on any page
 *     - Disabled UNLESS the element explicitly has `data-scan-safe="true"`
 *  c. Any explicitly sensitive route:
 *     - Matches routes in `SCANNER_EXCLUDED_ROUTES` (e.g. `/returns`, `/login`)
 *     - Or elements/pages with `data-scanner-disabled="true"`
 *
 * Scanned barcode handling:
 *  - Matches `barcode` against products in inventory.
 *  - No match: toast "No product found for scanned code: <code>" (no navigation).
 *  - Match but out of stock: toast `"<product>" is out of stock.` (no navigation, no add).
 *  - Match in stock:
 *    - If route is NOT `/pos`: navigate to `/pos` first, then add to cart.
 *    - If already on `/pos`: add to cart directly.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Product } from '../types';
import { useModalContext } from '../contexts/ModalContext';
import { useToast } from '../contexts/ToastContext';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Maximum milliseconds between consecutive keystrokes to still count as a barcode scan */
const SCAN_GAP_MS = 100;

/**
 * Route pathnames where the scanner is completely disabled.
 * Add new route entries here to extend the exclusion list.
 */
export const SCANNER_EXCLUDED_ROUTES: string[] = [
  '/returns',   // Refund / return workflow
  '/login',     // Unauthenticated login screen
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseGlobalBarcodeScannerOptions {
  /** Live product list from Firestore */
  products: Product[];
  /** Adds a product to the cart */
  addToCart: (product: Product) => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGlobalBarcodeScanner({
  products,
  addToCart,
}: UseGlobalBarcodeScannerOptions): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { modalDepth } = useModalContext();
  const { showToast } = useToast();

  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const productsRef = useRef<Product[]>(products);
  const addToCartRef = useRef<(p: Product) => void>(addToCart);
  const locationRef = useRef(location);
  const modalDepthRef = useRef(modalDepth);
  const navigateRef = useRef(navigate);
  const showToastRef = useRef(showToast);

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { addToCartRef.current = addToCart; }, [addToCart]);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { modalDepthRef.current = modalDepth; }, [modalDepth]);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  /** Helper to determine if the scanner should be disabled given current DOM and route state */
  const isScannerDisabled = useCallback((): boolean => {
    // ── Check a: Any modal is open (via ModalContext depth counter) ──
    if (modalDepthRef.current > 0) {
      return true;
    }

    // ── Check a2: Fallback DOM check — only trust explicit ARIA/data attributes,
    //    NOT CSS class heuristics which are too fragile and match non-modal elements ──
    if (typeof document !== 'undefined') {
      const modalInDom = document.querySelector(
        '[data-modal="true"], [role="dialog"][aria-modal="true"]'
      );
      if (modalInDom) {
        return true;
      }
    }

    // ── Check b: Focus inside manual text entry not marked scan-safe ──
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName.toLowerCase();
        const inputType = (active as HTMLInputElement).type?.toLowerCase() ?? '';
        const nonTextInputs = ['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image', 'range', 'color'];
        const isTextInput = (tag === 'input' && !nonTextInputs.includes(inputType)) || tag === 'textarea' || active.isContentEditable;

        if (isTextInput && active.getAttribute('data-scan-safe') !== 'true') {
          return true;
        }
      }
    }

    // ── Check c: Excluded routes or pages with data-scanner-disabled ──
    const pathname = locationRef.current.pathname;
    if (SCANNER_EXCLUDED_ROUTES.some((route) => pathname.startsWith(route))) {
      return true;
    }
    if (typeof document !== 'undefined') {
      const disabledPage = document.querySelector('[data-scanner-disabled="true"]');
      if (disabledPage) {
        return true;
      }
    }

    return false;
  }, []);

  // Helper to cleanly clear React-controlled inputs using native setter
  const clearFocusedInput = useCallback(() => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      try {
        const valueSetter = Object.getOwnPropertyDescriptor(active, 'value')?.set;
        const prototype = Object.getPrototypeOf(active);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
          prototypeValueSetter.call(active, '');
        } else if (valueSetter) {
          valueSetter.call(active, '');
        } else {
          active.value = '';
        }
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        console.error('Error resetting input value:', err);
      }
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // If scanner is currently disabled, clear any stale buffer and let normal browser/app behavior happen
    if (isScannerDisabled()) {
      bufferRef.current = '';
      return;
    }

    const now = Date.now();
    const gap = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    const isEnter = e.key === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;

    // Reset buffer if gap between keystrokes was too long (human typing) — except when Enter arrives as suffix
    if (!isEnter && gap > SCAN_GAP_MS && bufferRef.current.length > 0) {
      bufferRef.current = '';
    }

    // Handle Enter — marks end of barcode scanner sequence
    if (isEnter) {
      const scannedCode = bufferRef.current.trim();
      bufferRef.current = '';

      // If buffer is empty, it's just a normal standalone Enter key press
      if (!scannedCode) {
        return;
      }

      // Barcode scan detected:
      // Prevent Enter from submitting forms, triggering buttons, or activating search filters
      e.preventDefault();
      e.stopPropagation();

      // Clear any focused input so scanned characters never act as a search query
      clearFocusedInput();

      // Notify UI (e.g. POS page to clear local searchQuery state)
      window.dispatchEvent(
        new CustomEvent('barcode-scanned', {
          detail: { code: scannedCode },
        })
      );

      // Look up barcode in inventory (handles numbers, strings, leading zeroes, and ID fallback)
      const codeClean = scannedCode.trim().toLowerCase();
      const codeCleanNoZero = codeClean.replace(/^0+/, '');
      const product = productsRef.current.find((p) => {
        if (p.deleted) return false;
        const rawBarcode = String(p.barcode || '').trim().toLowerCase();
        const rawId = String(p.id || '').trim().toLowerCase();
        const rawIdPrefix = rawId.slice(0, 10);
        return (
          (rawBarcode && (rawBarcode === codeClean || (codeCleanNoZero && rawBarcode.replace(/^0+/, '') === codeCleanNoZero))) ||
          (rawId && (rawId === codeClean || rawIdPrefix === codeClean))
        );
      });

      // No match found
      if (!product) {
        showToastRef.current(
          `No product found for scanned code: ${scannedCode}`,
          'info'
        );
        return;
      }

      // Match found but out of stock
      if ((product.quantity ?? 0) <= 0) {
        showToastRef.current(
          `"${product.name}" is out of stock.`,
          'error'
        );
        return;
      }

      // Match found and in stock — ONLY add to cart, nothing else!
      const currentPath = locationRef.current.pathname;
      if (currentPath !== '/pos') {
        // Navigate to /pos first, then add to cart
        navigateRef.current('/pos');
        addToCartRef.current(product);
      } else {
        // Already on /pos, add directly to cart
        addToCartRef.current(product);
      }
      return;
    }

    // Accumulate printable characters
    if (e.key.length === 1) {
      bufferRef.current += e.key;
    }
  }, [isScannerDisabled, clearFocusedInput]);

  useEffect(() => {
    // Capture phase listener to intercept scanner keystrokes cleanly
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);
}
