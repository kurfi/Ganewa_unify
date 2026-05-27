import React from 'react';
import { Package, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

import { useInventory } from '../hooks/useInventory';
import { InventoryHeader } from '../components/inventory/InventoryHeader';
import { InventoryTable } from '../components/inventory/InventoryTable';
import { InventoryMobileList } from '../components/inventory/InventoryMobileList';
import { ProductModal } from '../components/inventory/ProductModal';
import { BulkImportModal } from '../components/inventory/BulkImportModal';

export default function Inventory() {
  const { currentUser } = useAuth();

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
    handleOpenModal,
    handleDelete,
    handleSubmit,
    downloadTemplate
  } = useInventory(currentUser);

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col gap-4 max-w-7xl mx-auto p-4 md:p-6 pb-0">
      <InventoryHeader
        setIsBulkModalOpen={setIsBulkModalOpen}
        handleOpenModal={handleOpenModal}
      />

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
          />

          <InventoryMobileList
            products={products}
            handleOpenModal={handleOpenModal}
            handleDelete={handleDelete}
          />

          {products?.length === 0 && (
            <div className="p-16 flex flex-col items-center justify-center text-center text-slate-400 bg-white m-4 rounded-xl border border-dashed border-slate-200">
              <Package className="w-16 h-16 mx-auto mb-4 text-emerald-100" />
              <p className="text-lg font-medium text-slate-600">No products found</p>
              <p className="text-sm">Try adjusting your search or add a new product.</p>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}