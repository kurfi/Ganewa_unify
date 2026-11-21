import { useCartContext } from '../contexts/CartContext';
import { Product } from '../types';

/**
 * useCart hook — connects to the global CartContext so cart state is shared
 * across POS and app-wide barcode scanner.
 * 
 * Maintained with backward-compatible signature for POS component.
 */
export function useCart(
    isWholesaleMode?: boolean,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
) {
    const context = useCartContext();

    // If wholesale mode was passed and differs from context, keep context aligned
    if (isWholesaleMode !== undefined && isWholesaleMode !== context.isWholesaleMode) {
        context.setIsWholesaleMode(isWholesaleMode);
    }

    const wrappedAddToCart = (product: Product) => {
        context.addToCart(product, isWholesaleMode);
    };

    return {
        cart: context.cart,
        setCart: context.setCart,
        cartItemCount: context.cartItemCount,
        addToCart: wrappedAddToCart,
        updateQuantity: context.updateQuantity,
        removeFromCart: context.removeFromCart,
        calculateTotal: context.calculateTotal,
        clearCart: context.clearCart,
        isWholesaleMode: context.isWholesaleMode,
        setIsWholesaleMode: context.setIsWholesaleMode
    };
}
