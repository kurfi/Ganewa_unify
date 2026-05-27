import { useState } from 'react';
import { Product, SaleItem } from '../types';
import { roundTo2 } from '../utils/math';

export function useCart(isWholesaleMode: boolean = false, showToast?: (msg: string, type: 'success' | 'error' | 'info') => void) {
    const [cart, setCart] = useState<SaleItem[]>([]);

    const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.productId === product.id);
            if (existing) {
                if (existing.quantity + 1 > (product.quantity || 0)) {
                    showToast?.(`Insufficient stock for "${product.name}". Available: ${product.quantity}`, 'error');
                    return prev;
                }
                return prev.map(item =>
                    item.productId === product.id
                        ? { ...item, quantity: item.quantity + 1, total: roundTo2((item.quantity + 1) * item.price) }
                        : item
                );
            }
            if (1 > (product.quantity || 0)) {
                showToast?.(`"${product.name}" is out of stock.`, 'error');
                return prev;
            }
            const price = isWholesaleMode && product.wholesalePrice ? product.wholesalePrice : product.sellPrice;
            return [...prev, {
                productId: product.id!,
                productName: product.name,
                quantity: 1,
                price: price,
                total: price,
                stockAtAddition: product.quantity
            }];
        });
    };

    const updateQuantity = (productId: string, newQty: number) => {
        setCart(prev => prev.map(item => {
            if (item.productId === productId) {
                const validatedQty = Math.max(0, newQty);
                if (validatedQty > (item.stockAtAddition || 0)) {
                    showToast?.(`Insufficient stock for "${item.productName}". Available: ${item.stockAtAddition}`, 'error');
                    return item;
                }
                return { ...item, quantity: validatedQty, total: roundTo2(validatedQty * item.price) };
            }
            return item;
        }));
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(item => item.productId !== productId));
    };

    const calculateTotal = () => roundTo2(cart.reduce((sum, item) => sum + item.total, 0));

    const clearCart = () => setCart([]);

    return {
        cart,
        setCart,
        cartItemCount,
        addToCart,
        updateQuantity,
        removeFromCart,
        calculateTotal,
        clearCart
    };
}
