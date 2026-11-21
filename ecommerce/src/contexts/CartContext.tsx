import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const CART_STORAGE_KEY = 'ganewa_cart';

export interface CartItem {
    id: string;
    quantity: number;
}

interface CartContextType {
    cart: CartItem[];
    addToCart: (id: string, maxQuantity?: number) => void;
    removeFromCart: (id: string) => void;
    updateQuantity: (id: string, quantity: number, maxQuantity?: number) => void;
    clearCart: () => void;
    totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function loadCart(): CartItem[] {
    try {
        const saved = localStorage.getItem(CART_STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
}

function saveCart(cart: CartItem[]) {
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
        // ignore storage errors
    }
}

export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>(loadCart);

    // Persist cart to localStorage on every change
    useEffect(() => {
        saveCart(cart);
    }, [cart]);

    const addToCart = (id: string, maxQuantity?: number) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === id);
            if (existing) {
                // If maxQuantity is provided, cap at that limit
                if (maxQuantity !== undefined && existing.quantity >= maxQuantity) {
                    return prev; // Already at max — do nothing
                }
                return prev.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            // Don't add if max stock is 0
            if (maxQuantity !== undefined && maxQuantity <= 0) {
                return prev;
            }
            return [...prev, { id, quantity: 1 }];
        });
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const updateQuantity = (id: string, quantity: number, maxQuantity?: number) => {
        if (quantity <= 0) {
            removeFromCart(id);
            return;
        }
        // Cap at maxQuantity if provided
        const clampedQty = maxQuantity !== undefined ? Math.min(quantity, maxQuantity) : quantity;
        setCart(prev => prev.map(item => item.id === id ? { ...item, quantity: clampedQty } : item));
    };

    const clearCart = () => {
        setCart([]);
        localStorage.removeItem(CART_STORAGE_KEY);
    };

    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, totalItems }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
