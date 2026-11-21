import React from 'react';
import { useDialog } from '../../contexts/DialogContext';
import { format } from 'date-fns';
import { RotateCcw, Trash2, PauseCircle } from 'lucide-react';
import { salesRepo } from '../../repositories';
import { Sale } from '../../types';

interface HeldSalesPanelProps {
    heldSales: Sale[] | undefined;
    handleResumeSale: (sale: Sale) => void;
}

export function HeldSalesPanel({ heldSales, handleResumeSale }: HeldSalesPanelProps) {
    const { confirm } = useDialog();
    return (
        <div data-modal="true" className="flex-1 overflow-y-auto bg-white">
            <div className="divide-y divide-slate-100">
                {heldSales && heldSales.length > 0 ? (
                    heldSales.map(sale => (
                        <div key={sale.id} className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <p className="font-bold text-slate-800">₦{(sale.finalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <p className="text-xs text-slate-500 mt-1">{format((sale.date as any)?.toDate?.() ?? new Date(sale.date), 'MMM dd, HH:mm')} • {(sale.items || []).length} Items</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 mb-2">{sale.customerName}</p>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={() => handleResumeSale(sale)}
                                    className="flex-1 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" /> Resume
                                </button>
                                <button
                                    onClick={async () => {
                                        if (await confirm('Discard this held sale?', { type: 'warning', confirmText: 'Discard' })) await salesRepo.delete(sale.id!);
                                    }}
                                    className="py-1.5 px-3 bg-red-50 text-red-600 text-xs font-bold rounded border border-red-200 hover:bg-red-100"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                        <PauseCircle className="w-8 h-8 opacity-20" />
                        <p>No sales on hold.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
