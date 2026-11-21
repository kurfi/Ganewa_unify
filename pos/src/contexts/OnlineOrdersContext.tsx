import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db as firestoreDb, auth } from '../firebase/config';
import { useToast } from './ToastContext';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  photo: string | null;
}

export interface OrderPayment {
  amount: number;
  method: 'transfer';
  proofUrl: string | null;
  bankAccount: { id: string; bankName: string; accountNo: string } | null;
  recordedBy: 'customer' | 'pos';
  recordedByUser?: string;
  status: 'pending' | 'confirmed';
  note?: string;
  createdAt: any;
}

export interface Order {
  id: string; // Firestore doc ID
  orderId: string; // Custom readable GW-XXXXXX ID
  userId: string | null;
  linkedPosCustomerId?: string | null;
  items: OrderItem[];
  total: number;
  customer: {
    name: string;
    phone: string;
    address: string;
    email: string | null;
  };
  method: 'pickup' | 'delivery' | 'proof' | 'credit'; // Bug 4 fix: added 'credit'
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  createdAt: any;
  proofOfPayment?: string | null;
  paidToBankAccount?: {
    id: string;
    bankName: string;
    accountNo: string;
  } | null;
  creditProcessed?: boolean;
  isPartialPayment?: boolean;
  amountPaid?: number;
  balanceRemaining?: number;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  minDepositAmount?: number | null;
  payments?: OrderPayment[];
}

interface OnlineOrdersContextType {
  orders: Order[];
  loading: boolean;
  pendingCount: number;
}

const OnlineOrdersContext = createContext<OnlineOrdersContextType | undefined>(undefined);

export const playNotificationSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator1 = audioCtx.createOscillator();
    const oscillator2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator1.type = 'sine';
    oscillator1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(880.00, audioCtx.currentTime); // A5

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

    oscillator1.start(audioCtx.currentTime);
    oscillator2.start(audioCtx.currentTime);
    oscillator1.stop(audioCtx.currentTime + 0.35);
    oscillator2.stop(audioCtx.currentTime + 0.35);
  } catch (err) {
    console.warn('AudioContext failed to play sound:', err);
  }
};

export const OnlineOrdersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const prevCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const { showToast } = useToast();

  useEffect(() => {
    const colRef = collection(firestoreDb, 'orders');
    const q = query(
      colRef,
      where('status', 'in', ['pending', 'processing'])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedOrders: Order[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          let normalizedDate = null;
          if (data.createdAt) {
            if (typeof data.createdAt.toDate === 'function') {
              normalizedDate = data.createdAt.toDate();
            } else if (data.createdAt.seconds) {
              normalizedDate = new Date(data.createdAt.seconds * 1000);
            }
          }
          return {
            id: doc.id,
            ...data,
            createdAt: normalizedDate
          } as Order;
        });

        // Sort locally to avoid needing a composite index
        fetchedOrders.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });

        setOrders(fetchedOrders);
        
        const currentPendingCount = fetchedOrders.filter(o => o.status === 'pending').length;
        setPendingCount(currentPendingCount);

        if (!isInitialLoadRef.current) {
          if (currentPendingCount > prevCountRef.current) {
            playNotificationSound();
          }
        } else {
          isInitialLoadRef.current = false;
        }

        prevCountRef.current = currentPendingCount;
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching online orders:', error);
        showToast('Failed to load online orders from server.', 'error');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [showToast]);

  return (
    <OnlineOrdersContext.Provider value={{ orders, loading, pendingCount }}>
      {children}
    </OnlineOrdersContext.Provider>
  );
};

export const useOnlineOrders = () => {
  const context = useContext(OnlineOrdersContext);
  if (context === undefined) {
    throw new Error('useOnlineOrders must be used within an OnlineOrdersProvider');
  }
  return context;
};
