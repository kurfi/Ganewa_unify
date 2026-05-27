import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { ClipboardList, Calendar, Download, Trash2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { savePdf } from '../../services/pdfService';
import { useToast } from '../../contexts/ToastContext';
import { clearAuditLogs } from '../../db/db';
import ConfirmDialog from '../ConfirmDialog';

export function SystemLogs() {
    const auditLogs = useLiveQuery(() => db.auditLogs.reverse().limit(50).toArray());
    const { showToast } = useToast();

    const [logStartDate, setLogStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [logEndDate, setLogEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [isExportingLogs, setIsExportingLogs] = useState(false);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    const exportAuditLogs = async () => {
        setIsExportingLogs(true);
        try {
            const start = parseISO(logStartDate);
            start.setHours(0, 0, 0, 0);
            const end = parseISO(logEndDate);
            end.setHours(23, 59, 59, 999);

            const logs = await db.auditLogs
                .where('timestamp')
                .between(start, end)
                .reverse()
                .toArray();

            if (logs.length === 0) {
                showToast('No logs found for the selected period.', 'info');
                return;
            }

            const doc = new jsPDF();
            doc.setFontSize(18);
            doc.text("Ganewa Shopping Mall Kurfi - System Audit Logs", 14, 22);
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Period: ${logStartDate} to ${logEndDate}`, 14, 30);

            autoTable(doc, {
                startY: 40,
                head: [['Timestamp', 'Action', 'Details', 'User']],
                body: logs.map(log => [
                    format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'),
                    log.action,
                    log.details,
                    log.user
                ]),
                headStyles: { fillColor: [71, 85, 105] },
                styles: { fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 35 },
                    1: { cellWidth: 35 },
                    2: { cellWidth: 'auto' },
                    3: { cellWidth: 25 }
                }
            });

            const fileName = `Audit_Logs_${logStartDate}_to_${logEndDate}.pdf`;
            await savePdf(doc, fileName, 'reports');
            showToast(`Audit logs exported successfully!`, 'success');
        } catch (error) {
            console.error("Failed to export audit logs:", error);
            showToast("Failed to export audit logs.", "error");
        } finally {
            setIsExportingLogs(false);
        }
    };

    const handleClearLogs = async () => {
        setIsClearing(true);
        try {
            await clearAuditLogs();
            showToast('System logs cleared successfully!', 'success');
            setIsClearConfirmOpen(false);
        } catch (error) {
            console.error('Failed to clear system logs:', error);
            showToast('Failed to clear system logs.', 'error');
        } finally {
            setIsClearing(false);
        }
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="p-2.5 md:p-3 bg-slate-100 rounded-full">
                        <ClipboardList className="w-5 h-5 md:w-6 md:h-6 text-slate-600" />
                    </div>
                    <div>
                        <h2 className="text-base md:text-lg font-bold text-slate-900">System Logs</h2>
                        <p className="text-slate-500 text-xs md:text-sm">Audit logs of activities.</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 md:gap-2">
                        <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400" />
                        <input
                            type="date"
                            value={logStartDate}
                            onChange={(e) => setLogStartDate(e.target.value)}
                            className="bg-transparent text-[10px] md:text-sm border-none focus:ring-0 p-0 w-24 md:w-28"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                            type="date"
                            value={logEndDate}
                            onChange={(e) => setLogEndDate(e.target.value)}
                            className="bg-transparent text-[10px] md:text-sm border-none focus:ring-0 p-0 w-24 md:w-28"
                        />
                    </div>
                    <button
                        onClick={exportAuditLogs}
                        disabled={isExportingLogs}
                        className="flex-1 md:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-[10px] md:text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {isExportingLogs ? (
                            <>Exporting...</>
                        ) : (
                            <>
                                <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                Export PDF
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => setIsClearConfirmOpen(true)}
                        disabled={isClearing}
                        className="flex-1 md:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 py-1.5 bg-rose-100 text-rose-600 rounded-md hover:bg-rose-200 text-[10px] md:text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        Clear All
                    </button>
                </div>
            </div>

            {/* System Logs Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                        <tr>
                            <th className="p-3 font-medium">Timestamp</th>
                            <th className="p-3 font-medium">Action</th>
                            <th className="p-3 font-medium">Details</th>
                            <th className="p-3 font-medium text-right">User</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {auditLogs?.map(log => (
                            <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 text-slate-500 whitespace-nowrap text-xs">
                                    {format(log.timestamp, 'MMM dd, HH:mm:ss')}
                                </td>
                                <td className="p-3 font-bold text-slate-700 text-xs capitalize">{log.action.replace('_', ' ')}</td>
                                <td className="p-3 text-slate-600 text-xs max-w-xs truncate" title={log.details}>{log.details}</td>
                                <td className="p-3 text-right text-slate-500 text-xs font-medium">{log.user}</td>
                            </tr>
                        ))}
                        {(!auditLogs || auditLogs.length === 0) && (
                            <tr>
                                <td colSpan={4} className="p-10 text-center text-slate-400 text-xs italic">No logs found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* System Logs Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
                {auditLogs?.map(log => (
                    <div key={log.id} className="py-3 px-1">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{format(log.timestamp, 'HH:mm:ss • MMM dd')}</span>
                            <span className="text-[10px] font-bold text-indigo-600">{log.user}</span>
                        </div>
                        <p className="text-xs font-black text-slate-800 mb-1">{log.action.replace('_', ' ')}</p>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{log.details}</p>
                    </div>
                ))}
                {(!auditLogs || auditLogs.length === 0) && (
                    <div className="p-10 text-center text-slate-400 text-xs italic">No logs found.</div>
                )}
            </div>
            <p className="text-[10px] text-slate-400 mt-4 italic text-center border-t border-slate-50 pt-4">Displaying last 50 events. Use Export to view more.</p>

            <ConfirmDialog
                isOpen={isClearConfirmOpen}
                title="Clear System Logs"
                message="Are you sure you want to delete all system audit logs? This action cannot be undone."
                type="warning"
                confirmText={isClearing ? 'Clearing...' : 'Clear All'}
                onConfirm={handleClearLogs}
                onCancel={() => setIsClearConfirmOpen(false)}
            />
        </div>
    );
}
