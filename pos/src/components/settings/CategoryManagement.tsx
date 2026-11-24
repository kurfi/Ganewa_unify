import React, { useState } from 'react';
import { useCategoryManagement } from '../../hooks/useCategoryManagement';
import { Category } from '../../types';
import { dryRunUnifiedCategories, executeUnifiedCategoriesMigration, DryRunReport } from '../../services/categoryMigrationService';
import { useToast } from '../../contexts/ToastContext';
import { FolderTree, Plus, Edit2, Eye, EyeOff, Trash2, ArrowUp, ArrowDown, RefreshCw, AlertCircle, CheckCircle2, ChevronRight, X } from 'lucide-react';

export const CategoryManagement: React.FC = () => {
  const { categories, loading, addCategory, updateCategory, deleteCategory, reorderCategories, checkCategoryDependencies } = useCategoryManagement();
  const { showToast } = useToast();

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formParentId, setFormParentId] = useState<string>('');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete / Reassign dialog state
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteDepInfo, setDeleteDepInfo] = useState<{ hasChildren: boolean; childCategories: Category[]; productCount: number } | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');
  const [deleting, setDeleting] = useState(false);

  // Migration / Dry Run state
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [dryRunReport, setDryRunReport] = useState<DryRunReport | null>(null);
  const [migrationResult, setMigrationResult] = useState<{ updatedProducts: number; createdCategories: number; errors: string[] } | null>(null);
  const [confirmExecuteOpen, setConfirmExecuteOpen] = useState(false);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormName('');
    setFormSlug('');
    setFormParentId('');
    setFormActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormSlug(cat.slug);
    setFormParentId(cat.parentId || '');
    setFormActive(cat.active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Category name is required', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory, {
          name: formName.trim(),
          slug: formSlug.trim() || undefined,
          parentId: formParentId || undefined,
          active: formActive,
        });
      } else {
        await addCategory({
          name: formName.trim(),
          slug: formSlug.trim() || undefined,
          parentId: formParentId || undefined,
          active: formActive,
          sortOrder: categories.length + 1,
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      // toast shown in hook
    } finally {
      setSaving(false);
    }
  };

  const initiateDelete = async (cat: Category) => {
    if (!cat.id) return;
    setDeleting(true);
    try {
      const deps = await checkCategoryDependencies(cat.id, cat.name);
      setDeleteTarget(cat);
      setDeleteDepInfo(deps);
      setReassignTargetId('');
    } catch (err) {
      showToast('Failed to verify category usage', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const ok = await deleteCategory(deleteTarget, reassignTargetId || undefined);
      if (ok) {
        setDeleteTarget(null);
        setDeleteDepInfo(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    await reorderCategories(reordered);
  };

  const handleRunDryRun = async () => {
    setMigrationRunning(true);
    setMigrationResult(null);
    try {
      const report = await dryRunUnifiedCategories();
      setDryRunReport(report);
      showToast('Dry run analysis completed', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to run dry-run', 'error');
    } finally {
      setMigrationRunning(false);
    }
  };

  const handleExecuteMigration = async () => {
    setMigrationRunning(true);
    try {
      const res = await executeUnifiedCategoriesMigration(true);
      setMigrationResult(res);
      setConfirmExecuteOpen(false);
      // Refresh dry run report
      const report = await dryRunUnifiedCategories();
      setDryRunReport(report);
      showToast(`Migration executed: ${res.updatedProducts} products updated`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Migration execution failed', 'error');
    } finally {
      setMigrationRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-indigo-600" />
            Product Categories (Unified)
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage product categories shared across POS and E-commerce storefront.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunDryRun}
            disabled={migrationRunning}
            className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${migrationRunning ? 'animate-spin' : ''}`} />
            Migration Dry-Run
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        </div>
      </div>

      {/* Migration Dry Run Section */}
      {dryRunReport && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-slate-800 text-sm">Migration Inspection &amp; Dry-Run</h3>
            </div>
            <button
              onClick={() => setDryRunReport(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Dismiss
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500 block">Total Products</span>
              <span className="text-base font-bold text-slate-800">{dryRunReport.totalProductsScanned}</span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500 block">Needs Update</span>
              <span className="text-base font-bold text-amber-600">{dryRunReport.productsNeedingUpdate}</span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500 block">Standard Initialized</span>
              <span className="text-base font-bold text-emerald-600">{dryRunReport.standardCategoriesPresent ? 'Yes (14)' : 'Pending'}</span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500 block">Unmapped Groups</span>
              <span className="text-base font-bold text-red-600">{dryRunReport.unmappedCategoriesCount}</span>
            </div>
          </div>

          {/* Group breakdown */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-600 border border-slate-200 bg-white rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Current Value</th>
                  <th className="p-2.5">Products</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Target Category</th>
                  <th className="p-2.5">Samples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dryRunReport.distinctCategoriesFound.map((item, idx) => (
                  <tr key={idx} className={item.status === 'unmapped' ? 'bg-red-50/50' : ''}>
                    <td className="p-2.5 font-medium text-slate-800">"{item.rawCategory || '(Empty)'}"</td>
                    <td className="p-2.5 font-bold">{item.productCount}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        item.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                        item.status === 'needs_mapping' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="p-2.5 font-medium text-slate-700">
                      {item.targetCategoryName || <span className="text-red-500 italic">Unmapped (requires decision)</span>}
                    </td>
                    <td className="p-2.5 text-slate-500 truncate max-w-xs">{item.sampleProducts.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-500">
              {dryRunReport.unmappedCategoriesCount > 0
                ? '⚠️ You have unmapped legacy categories. Review before running migration.'
                : '✅ All discovered categories are safely mapped.'}
            </p>
            <button
              onClick={() => setConfirmExecuteOpen(true)}
              disabled={migrationRunning}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
            >
              Execute Migration ({dryRunReport.productsNeedingUpdate} products)
            </button>
          </div>
        </div>
      )}

      {/* Migration Result Banner */}
      {migrationResult && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>
              Migration complete! Updated {migrationResult.updatedProducts} products, created {migrationResult.createdCategories} missing standard categories.
            </span>
          </div>
          <button onClick={() => setMigrationResult(null)} className="text-xs underline text-emerald-700">Dismiss</button>
        </div>
      )}

      {/* Category List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading categories...</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            No categories defined. Click "Add Category" or run the dry-run to initialize.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {categories.map((cat, idx) => {
              const parent = categories.find(p => p.id === cat.parentId);
              return (
                <div key={cat.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveOrder(idx, 'up')}
                        disabled={idx === 0}
                        className="text-slate-300 hover:text-slate-600 disabled:opacity-20"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveOrder(idx, 'down')}
                        disabled={idx === categories.length - 1}
                        className="text-slate-300 hover:text-slate-600 disabled:opacity-20"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 text-sm">{cat.name}</span>
                        {!cat.active && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-full">
                            Hidden
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>slug: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">{cat.slug}</code></span>
                        {parent && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5 text-slate-500">
                              Subcategory of: <strong>{parent.name}</strong>
                            </span>
                          </>
                        )}
                        {cat.oldSlugs && cat.oldSlugs.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400 italic">
                              redirects: {cat.oldSlugs.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateCategory(cat, { active: !cat.active })}
                      title={cat.active ? 'Hide from storefront' : 'Show on storefront'}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        cat.active ? 'text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-400 border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      {cat.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEditModal(cat)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Edit Category"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => initiateDelete(cat)}
                      className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-semibold text-slate-800">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Beverages (Drinks & Water)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  URL Slug (Optional / Custom)
                </label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={e => setFormSlug(e.target.value)}
                  placeholder={editingCategory ? editingCategory.slug : 'auto-generated if empty'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Unique identifier used in URLs. Renaming the category keeps existing slug unless changed here.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Category</label>
                <select
                  value={formParentId}
                  onChange={e => setFormParentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">None (Top-Level Category)</option>
                  {categories
                    .filter(c => !editingCategory || c.id !== editingCategory.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activeCheckbox"
                  checked={formActive}
                  onChange={e => setFormActive(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="activeCheckbox" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Active (Visible on public storefront)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Reassign Modal */}
      {deleteTarget && deleteDepInfo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 text-base">
              Delete Category: {deleteTarget.name}
            </h3>

            {deleteDepInfo.hasChildren ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-2">
                <p className="font-bold">❌ Cannot delete this category!</p>
                <p>
                  This category has <strong>{deleteDepInfo.childCategories.length}</strong> child subcategory/categories:
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {deleteDepInfo.childCategories.map(c => <li key={c.id}>{c.name}</li>)}
                </ul>
                <p>Please delete or reassign its child categories first.</p>
              </div>
            ) : deleteDepInfo.productCount > 0 ? (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <p className="font-semibold">
                    ⚠️ {deleteDepInfo.productCount} product(s) are currently in this category.
                  </p>
                  <p className="mt-1">
                    To delete this category without leaving orphaned products, you must reassign them to another category:
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reassign products to:
                  </label>
                  <select
                    value={reassignTargetId}
                    onChange={e => setReassignTargetId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Select target category</option>
                    {categories
                      .filter(c => c.id !== deleteTarget.id)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Are you sure you want to delete this category? No products or child categories will be affected.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setDeleteDepInfo(null); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={
                  deleting ||
                  deleteDepInfo.hasChildren ||
                  (deleteDepInfo.productCount > 0 && !reassignTargetId)
                }
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Migration Execution Confirmation Modal */}
      {confirmExecuteOpen && dryRunReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Confirm Unified Categories Migration
            </h3>

            <p className="text-sm text-slate-600">
              This will update product records in batches of at most 500 writes to set their <code>categoryId</code> to the approved shared category IDs.
            </p>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
              <div>• Products to be updated: <strong>{dryRunReport.productsNeedingUpdate}</strong></div>
              <div>• Target Firestore: <strong>Connected Emulator</strong></div>
              <div>• Unmapped values: <strong>{dryRunReport.unmappedCategoriesCount}</strong></div>
            </div>

            {dryRunReport.unmappedCategoriesCount > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                ⚠️ Notice: Unmapped product categories will NOT be assigned to "Other" automatically and will remain skipped until explicitly mapped.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmExecuteOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMigration}
                disabled={migrationRunning}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                {migrationRunning ? 'Executing...' : 'Confirm & Run Migration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
