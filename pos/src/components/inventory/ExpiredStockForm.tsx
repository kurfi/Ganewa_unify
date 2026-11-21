import React, { useState, useRef, useEffect } from 'react';
import { Search, AlertTriangle, PackageCheck, X, FileText, CheckCircle2 } from 'lucide-react';
import { Product } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import { usePaginatedCollection } from '../../hooks/usePaginatedCollection';

interface ExpiredStockFormProps {
  onSubmitWriteOff: (productId: string, quantity: number, note?: string) => Promise<any>;
  isSubmitting: boolean;
}

export function ExpiredStockForm({
  onSubmitWriteOff,
  isSubmitting
}: ExpiredStockFormProps) {
  const { showToast } = useToast();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [quantity, setQuantity] = useState<string>('1');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load products based on user search query using paginated collection to reduce reads
  const { data: rawProducts } = usePaginatedCollection<Product>({
    collectionName: 'products',
    orderByField: 'name',
    orderDirection: 'asc',
    pageSize: 50,
    searchTerm: searchQuery,
    searchField: 'nameLower'
  });

  const filteredProducts = (rawProducts || [])
    .filter(p => !p.deleted && !!(p.name || '').trim())
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchQuery(product.name);
    setIsOpen(false);
    setLocalError(null);
    if (product.quantity > 0) {
      setQuantity('1');
    } else {
      setQuantity('0');
      setLocalError(`Product "${product.name}" has 0 stock available.`);
    }
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProduct(null);
    setSearchQuery('');
    setQuantity('1');
    setLocalError(null);
  };

  const parsedQty = parseInt(quantity, 10) || 0;
  const unitCost = selectedProduct?.buyPrice || 0;
  const totalCostImpact = parsedQty * unitCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!selectedProduct || !selectedProduct.id) {
      showToast('Please select a product to write off.', 'error');
      setLocalError('Please select a product.');
      return;
    }

    if (parsedQty <= 0) {
      showToast('Please enter a valid quantity greater than 0.', 'error');
      setLocalError('Quantity must be greater than 0.');
      return;
    }

    if (parsedQty > selectedProduct.quantity) {
      const errMsg = `Insufficient stock for "${selectedProduct.name}". Available: ${selectedProduct.quantity}`;
      showToast(errMsg, 'error');
      setLocalError(errMsg);
      return;
    }

    try {
      const result = await onSubmitWriteOff(selectedProduct.id, parsedQty, note);
      showToast(
        `✓ Expired stock written off: ${parsedQty} x ${result.productName} (Cost impact: ₦${result.costImpact.toLocaleString()})`,
        'success'
      );

      // Reset form
      setSelectedProduct(null);
      setSearchQuery('');
      setQuantity('1');
      setNote('');
      setLocalError(null);
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit stock write-off';
      showToast(msg, 'error');
      setLocalError(msg);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 mb-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base md:text-lg font-bold text-slate-800">Record Expired Stock Write-Off</h2>
          <p className="text-xs text-slate-500">
            Deduct expired items directly from inventory and record the financial cost impact.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {localError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs md:text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{localError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 1. Product Picker */}
          <div className="lg:col-span-2 relative" ref={containerRef}>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Select Product <span className="text-red-500">*</span>
            </label>
            <div
              className="relative group cursor-text"
              onClick={() => {
                setIsOpen(true);
                inputRef.current?.focus();
              }}
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 w-4 h-4 transition-colors" />
              <input
                ref={inputRef}
                type="text"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400"
                placeholder="Search product by name or category..."
                value={isOpen ? searchQuery : (selectedProduct ? selectedProduct.name : '')}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (selectedProduct) setSelectedProduct(null);
                  setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
              />

              {(selectedProduct || (isOpen && searchQuery)) && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleSelectProduct(product)}
                      className={`w-full px-4 py-2.5 text-left text-sm transition-colors border-b border-slate-50 last:border-0 flex items-center justify-between hover:bg-slate-50 ${
                        selectedProduct?.id === product.id ? 'bg-emerald-50 text-emerald-800 font-medium' : 'text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-xs md:text-sm truncate">{product.name}</p>
                        <p className="text-[10px] md:text-xs text-slate-400 truncate">{product.category}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] md:text-xs font-bold ${
                          product.quantity <= 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          Stock: {product.quantity}
                        </span>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Cost: ₦{(product.buyPrice || 0).toLocaleString()}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500 italic">
                    No products found matching "{searchQuery}"
                  </div>
                )}
              </div>
            )}

            {/* Selected Product Stock Card */}
            {selectedProduct && (
              <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-slate-700">Available Stock:</span>
                  <span className="font-bold text-slate-900">{selectedProduct.quantity} units</span>
                </div>
                <div className="text-slate-500 font-mono">
                  Unit Cost: <span className="font-semibold text-slate-800">₦{(selectedProduct.buyPrice || 0).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Quantity Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Quantity to Write Off <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max={selectedProduct ? selectedProduct.quantity : undefined}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setLocalError(null);
                }}
                disabled={!selectedProduct || selectedProduct.quantity <= 0}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                placeholder="1"
              />
            </div>
            {selectedProduct && (
              <p className="text-[11px] text-slate-500 mt-1">
                Max write-off allowed: <strong className="text-slate-700">{selectedProduct.quantity}</strong>
              </p>
            )}
          </div>
        </div>

        {/* 3. Optional Note & Cost Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Note / Reference <span className="text-slate-400 font-normal lowercase">(optional: batch no., expiry date, etc.)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Expired batch #EXP-2026-07, past shelf life"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex flex-col justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Estimated Cost Impact</span>
            <span className="text-xl font-black text-amber-900 mt-1">
              ₦{totalCostImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-amber-700 mt-0.5">
              ({parsedQty} units × ₦{(unitCost).toLocaleString()})
            </span>
          </div>
        </div>

        {/* 4. Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={!selectedProduct || parsedQty <= 0 || (selectedProduct && parsedQty > selectedProduct.quantity) || isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg font-bold text-sm shadow-sm hover:bg-red-700 focus:ring-2 focus:ring-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isSubmitting ? 'Processing Write-Off...' : 'Submit Write-Off'}
          </button>
        </div>
      </form>
    </div>
  );
}
