import React, { useState } from 'react';
import { Package, Search, AlertTriangle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { useStockWriteOffs } from '../hooks/useStockWriteOffs';
import { InventoryHeader } from '../components/inventory/InventoryHeader';
import { InventoryTable } from '../components/inventory/InventoryTable';
import { InventoryMobileList } from '../components/inventory/InventoryMobileList';
import { ProductModal } from '../components/inventory/ProductModal';
import { BulkImportModal } from '../components/inventory/BulkImportModal';
import { ExpiredStockForm } from '../components/inventory/ExpiredStockForm';
import { ExpiredStockHistory } from '../components/inventory/ExpiredStockHistory';
import { PrintLabelModal } from '../components/inventory/PrintLabelModal';
import { Product } from '../types';

export default function Inventory() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'products' | 'expired'>('products');
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);

  const {
    isModalOpen,
    setIsModalOpen,
    isBulkModalOpen,
    setIsBulkModalOpen,
    searchTerm,
    setSearchTerm,
    editingProduct,
    formData,
    setFormData,
    products,
    loading,
    hasMore,
    loadMore,
    loadingMore,
    handleOpenModal,
    handleDelete,
    handleSubmit,
    downloadTemplate
  } = useInventory(currentUser);

  const {
    writeOffs,
    loading: loadingWriteOffs,
    isSubmitting: isSubmittingWriteOff,
    submitWriteOff,
    deleteWriteOff
  } = useStockWriteOffs(currentUser);



  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col gap-4 max-w-7xl mx-auto p-4 md:p-6 pb-0">
      <InventoryHeader
        setIsBulkModalOpen={setIsBulkModalOpen}
        handleOpenModal={handleOpenModal}
      />

      {/* Inventory Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
            activeTab === 'products'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-emerald-50 border border-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          Products
        </button>

        <button
          onClick={() => setActiveTab('expired')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
            activeTab === 'expired'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-emerald-50 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Expired Stock
        </button>
      </div>

      {activeTab === 'products' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-white z-10 sticky top-0">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search products by name, barcode, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50/30">
            <InventoryTable
              products={products}
              handleOpenModal={handleOpenModal}
              handleDelete={handleDelete}
              handleOpenLabelModal={(product) => setLabelProduct(product)}
            />

            <InventoryMobileList
              products={products}
              handleOpenModal={handleOpenModal}
              handleDelete={handleDelete}
              handleOpenLabelModal={(product) => setLabelProduct(product)}
            />

            {products?.length === 0 && !loading && (
              <div className="p-16 flex flex-col items-center justify-center text-center text-slate-400 bg-white m-4 rounded-xl border border-dashed border-slate-200">
                <Package className="w-16 h-16 mx-auto mb-4 text-emerald-100" />
                <p className="text-lg font-medium text-slate-600">No products found</p>
                <p className="text-sm">Try adjusting your search or add a new product.</p>
              </div>
            )}

            {loading && (
              <div className="py-8 text-center text-slate-500">
                Loading products...
              </div>
            )}

            {hasMore && (
              <div className="flex justify-center p-6">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-y-auto pb-6">
          <ExpiredStockForm
            onSubmitWriteOff={submitWriteOff}
            isSubmitting={isSubmittingWriteOff}
          />
          <ExpiredStockHistory
            writeOffs={writeOffs}
            onDeleteWriteOff={deleteWriteOff}
            loading={loadingWriteOffs}
          />
        </div>
      )}

      <ProductModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        editingProduct={editingProduct}
        formData={formData}
        handleSubmit={handleSubmit}
      />

      <BulkImportModal
        isBulkModalOpen={isBulkModalOpen}
        setIsBulkModalOpen={setIsBulkModalOpen}
        currentUser={currentUser}
        downloadTemplate={downloadTemplate}
      />

      <PrintLabelModal
        isOpen={!!labelProduct}
        onClose={() => setLabelProduct(null)}
        product={labelProduct}
      />
    </div>
  );
}