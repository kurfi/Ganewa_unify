import React, { useState, useMemo } from 'react';
import { StockWriteOff } from '../../types';
import { Calendar, Trash2, Search, Filter, ShieldAlert, History, TrendingDown, DollarSign } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { useToast } from '../../contexts/ToastContext';

interface ExpiredStockHistoryProps {
  writeOffs: StockWriteOff[];
  onDeleteWriteOff: (id: string) => Promise<void>;
  loading: boolean;
}

export function ExpiredStockHistory({
  writeOffs,
  onDeleteWriteOff,
  loading
}: ExpiredStockHistoryProps) {
  const { isAdmin } = useAuth();
  const { confirm } = useDialog();
  const { showToast } = useToast();

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('all');

  const handleSetPreset = (preset: 'today' | 'week' | 'month' | 'all') => {
    setActivePreset(preset);
    const now = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }

    if (preset === 'today') {
      setStartDate(formatDate(now));
      setEndDate(formatDate(now));
      return;
    }

    if (preset === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      setStartDate(formatDate(start));
      setEndDate(formatDate(now));
      return;
    }

    if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatDate(start));
      setEndDate(formatDate(now));
      return;
    }
  };

  // Filter write-offs
  const filteredWriteOffs = useMemo(() => {
    return writeOffs.filter((item) => {
      // Exclude deleted
      if (item.deleted) return false;

      // Filter by Date
      if (startDate) {
        const itemDate = new Date(item.date).getTime();
        const start = new Date(startDate).setHours(0, 0, 0, 0);
        if (itemDate < start) return false;
      }
      if (endDate) {
        const itemDate = new Date(item.date).getTime();
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        if (itemDate > end) return false;
      }

      // Filter by Product
      if (selectedProductId && item.productId !== selectedProductId) {
        return false;
      }

      // Search keyword (Product Name, Note, Staff Name)
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (item.productName || '').toLowerCase().includes(q);
        const noteMatch = (item.note || '').toLowerCase().includes(q);
        const staffMatch = (item.staffName || '').toLowerCase().includes(q);
        if (!nameMatch && !noteMatch && !staffMatch) return false;
      }

      return true;
    });
  }, [writeOffs, startDate, endDate, selectedProductId, searchQuery]);

  // Compute metrics
  const totalCostImpact = useMemo(() => {
    return filteredWriteOffs.reduce((sum, w) => sum + (w.costImpact || 0), 0);
  }, [filteredWriteOffs]);

  const totalUnitsWrittenOff = useMemo(() => {
    return filteredWriteOffs.reduce((sum, w) => sum + (w.quantity || 0), 0);
  }, [filteredWriteOffs]);

  const uniqueProductsFromWriteOffs = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    
    writeOffs.forEach((w) => {
      if (w.deleted) return;
      if (w.productId && !seen.has(w.productId)) {
        seen.add(w.productId);
        list.push({ id: w.productId, name: w.productName || 'Unknown Product' });
      }
    });
    
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [writeOffs]);

  const handleDelete = async (item: StockWriteOff) => {
    if (!item.id) return;
    const confirmed = await confirm(
      `Are you sure you want to soft-delete the write-off record for "${item.productName}" (${item.quantity} units)?\n\nNote: This deletes the history log but will NOT restore the inventory stock automatically.`,
      {
        title: 'Delete Write-Off Record',
        confirmText: 'Delete Record',
        type: 'danger'
      }
    );

    if (confirmed) {
      try {
        await onDeleteWriteOff(item.id);
        showToast('Write-off record deleted successfully.', 'success');
      } catch (err: any) {
        showToast(err?.message || 'Failed to delete write-off record', 'error');
      }
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
      {/* 1. Cost Impact Banner */}
      <div className="p-4 md:p-6 bg-gradient-to-r from-red-950 via-slate-900 to-red-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-red-300 font-semibold text-xs uppercase tracking-wider mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span>Total Expired Cost Impact</span>
          </div>
          <div className="text-2xl md:text-3xl font-black tracking-tight text-white">
            ₦{totalCostImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Total of <strong className="text-white">{totalUnitsWrittenOff} units</strong> lost to expiry in selected filter range.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-lg border border-white/10 text-xs">
          <History className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{filteredWriteOffs.length} write-off events</span>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Preset buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg overflow-x-auto">
            {(['all', 'today', 'week', 'month'] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => handleSetPreset(preset)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                  activePreset === preset
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset === 'all' ? 'All Time' : preset}
              </button>
            ))}
          </div>

          {/* Date range pickers */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="w-full sm:w-auto p-1.5 px-3 border border-slate-300 rounded-lg text-xs outline-none focus:border-emerald-500 bg-white"
              />
            </div>
            <span className="text-slate-400 text-xs">to</span>
            <div className="relative flex-1 sm:flex-none">
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="w-full sm:w-auto p-1.5 px-3 border border-slate-300 rounded-lg text-xs outline-none focus:border-emerald-500 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Product & Search Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by product, note, or staff name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div className="relative">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full py-1.5 px-3 bg-white rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">All Products</option>
              {uniqueProductsFromWriteOffs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. History Data Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading write-off history...</div>
        ) : filteredWriteOffs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white m-4 rounded-xl border border-dashed border-slate-200">
            <History className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-base font-semibold text-slate-600">No write-off records found</p>
            <p className="text-xs text-slate-400 mt-1">Try clearing your filters or submit a new expired stock write-off.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-xs text-slate-600 uppercase font-semibold text-[10px] md:text-xs tracking-wider border-b border-slate-200 z-10">
              <tr>
                <th className="p-3 md:p-4">Date & Time</th>
                <th className="p-3 md:p-4">Product Name</th>
                <th className="p-3 md:p-4 text-center">Qty Removed</th>
                <th className="p-3 md:p-4 text-right">Cost Impact</th>
                <th className="p-3 md:p-4">Staff Member</th>
                <th className="p-3 md:p-4">Note / Reason</th>
                {isAdmin && <th className="p-3 md:p-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredWriteOffs.map((item) => {
                const formattedDate = item.date
                  ? new Date(item.date).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })
                  : 'N/A';

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 md:p-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td className="p-3 md:p-4 font-semibold text-slate-800">
                      {item.productName}
                    </td>
                    <td className="p-3 md:p-4 text-center font-bold text-slate-900">
                      <span className="inline-block px-2 py-0.5 bg-red-50 text-red-700 rounded-md font-mono">
                        -{item.quantity}
                      </span>
                    </td>
                    <td className="p-3 md:p-4 text-right font-black text-red-600 font-mono whitespace-nowrap">
                      ₦{(item.costImpact || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 md:p-4 text-slate-600 font-medium">
                      {item.staffName || 'System'}
                    </td>
                    <td className="p-3 md:p-4 text-slate-500 text-xs italic max-w-xs truncate">
                      {item.note || '—'}
                    </td>
                    {isAdmin && (
                      <td className="p-3 md:p-4 text-center">
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Soft delete record (Admin only)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
