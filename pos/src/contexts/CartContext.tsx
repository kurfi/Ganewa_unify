import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Product, SaleItem } from '../types';
import { roundTo2 } from '../utils/math';
import { useToast } from './ToastContext';

export interface CartContextType {
  cart: SaleItem[];
  setCart: React.Dispatch<React.SetStateAction<SaleItem[]>>;
  cartItemCount: number;
  addToCart: (product: Product, overrideWholesale?: boolean) => void;
  updateQuantity: (productId: string, newQty: number) => void;
  removeFromCart: (productId: string) => void;
  calculateTotal: () => number;
  clearCart: () => void;
  isWholesaleMode: boolean;
  setIsWholesaleMode: React.Dispatch<React.SetStateAction<boolean>>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [isWholesaleMode, setIsWholesaleMode] = useState<boolean>(false);
  const { showToast } = useToast();

  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const addToCart = useCallback((product: Product, overrideWholesale?: boolean) => {
    const wholesale = overrideWholesale !== undefined ? overrideWholesale : isWholesaleMode;
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity + 1 > (product.quantity || 0)) {
          showToast(`Insufficient stock for "${product.name}". Available: ${product.quantity}`, 'error');
          return prev;
        }
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, total: roundTo2((item.quantity + 1) * item.price) }
            : item
        );
      }
      if (1 > (product.quantity || 0)) {
        showToast(`"${product.name}" is out of stock.`, 'error');
        return prev;
      }
      const price = wholesale && product.wholesalePrice ? product.wholesalePrice : product.sellPrice;
      return [
        ...prev,
        {
          productId: product.id!,
          productName: product.name,
          quantity: 1,
          price: price,
          total: price,
          stockAtAddition: product.quantity,
        },
      ];
    });
  }, [isWholesaleMode, showToast]);

  const updateQuantity = useCallback((productId: string, newQty: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const validatedQty = Math.max(0, newQty);
          if (validatedQty > (item.stockAtAddition || 0)) {
            showToast(`Insufficient stock for "${item.productName}". Available: ${item.stockAtAddition}`, 'error');
            return item;
          }
          return { ...item, quantity: validatedQty, total: roundTo2(validatedQty * item.price) };
        }
        return item;
      })
    );
  }, [showToast]);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const calculateTotal = useCallback(() => roundTo2(cart.reduce((sum, item) => sum + item.total, 0)), [cart]);

  const clearCart = useCallback(() => setCart([]), []);

  return (
    <CartContext.Provider
      value={{
        cart,
        setCart,
        cartItemCount,
        addToCart,
        updateQuantity,
        removeFromCart,
        calculateTotal,
        clearCart,
        isWholesaleMode,
        setIsWholesaleMode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCartContext = (): CartContextType => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCartContext must be used within a CartProvider');
  return ctx;
};
