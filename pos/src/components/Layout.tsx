import React, { useState, useMemo } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useGlobalBarcodeScanner } from '../hooks/useGlobalBarcodeScanner';
import { useCart } from '../hooks/useCart';
import { useCollection } from '../firebase/firestoreHelpers';
import { Product } from '../types';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Fetch ALL products (includeDeleted=true) and filter client-side, the same way
  // POS.tsx does it. This prevents the Firestore `deleted == false` constraint from
  // excluding products that simply don't have a `deleted` field stored.
  const { data: allProducts } = useCollection<Product>('products', [], true);
  const products = useMemo(
    () => allProducts.filter((p) => !p.deleted && !!(p.name || '').trim()),
    [allProducts]
  );

  const { addToCart } = useCart();

  // App-wide barcode scanner listener mounted once for the entire session
  useGlobalBarcodeScanner({
    products,
    addToCart,
  });

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden flex-col md:flex-row">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 md:pb-8 scroll-smooth relative">
        {/* Mobile Header with Hamburger */}
        <div className="md:hidden flex items-center justify-between mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 p-1.5 rounded-lg">
              <Menu className="w-5 h-5 text-white cursor-pointer" onClick={() => setIsSidebarOpen(true)} />
            </div>
            <h1 className="text-sm font-bold text-slate-800">Ganewa Shopping Mall Kurfi</h1>
          </div>
        </div>

        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Bottom Navigation for Mobile */}
      <BottomNav />
    </div>
  );
};

export default Layout;
