import React, { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, Wifi, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSync } from '../contexts/SyncContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

const OfflineIndicator: React.FC = () => {
    const { syncStatus } = useSync();
    const [isVisible, setIsVisible] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Count pending items in sync queue
    const pendingCount = useLiveQuery(
        () => db.syncQueue.where('status').equals('pending').count(),
        []
    ) ?? 0;

    // Monitor for back-online transition
    useEffect(() => {
        if (syncStatus === 'offline' || syncStatus === 'error' || (syncStatus === 'syncing' && pendingCount > 0)) {
            setIsVisible(true);
            setShowSuccess(false);
        } else if (syncStatus === 'idle' && isVisible) {
            // Flash success state before hiding
            setShowSuccess(true);
            const timer = setTimeout(() => {
                setIsVisible(false);
                setShowSuccess(false);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [syncStatus, pendingCount, isVisible]);

    if (!isVisible && !showSuccess) return null;

    return (
        <div className="fixed bottom-20 md:bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5">
            <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border transition-all duration-500 ${showSuccess
                    ? 'bg-emerald-500 border-emerald-400 text-white'
                    : syncStatus === 'offline'
                        ? 'bg-slate-900 border-slate-800 text-slate-100'
                        : syncStatus === 'error'
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-amber-500 border-amber-400 text-slate-900'
                }`}>
                {showSuccess ? (
                    <CheckCircle2 className="w-5 h-5 animate-bounce" />
                ) : syncStatus === 'syncing' ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                ) : syncStatus === 'offline' ? (
                    <CloudOff className="w-5 h-5 text-red-400" />
                ) : syncStatus === 'error' ? (
                    <AlertCircle className="w-5 h-5" />
                ) : (
                    <Wifi className="w-5 h-5" />
                )}

                <div className="flex flex-col">
                    <span className="text-[13px] font-black uppercase tracking-widest leading-none mb-1">
                        {showSuccess ? 'All Synced' : syncStatus === 'offline' ? 'Offline Mode' : syncStatus === 'syncing' ? 'Syncing...' : 'Sync Error'}
                    </span>
                    <span className="text-[10px] font-bold opacity-80 leading-none">
                        {showSuccess
                            ? 'Local data is up to date'
                            : pendingCount > 0
                                ? `${pendingCount} item${pendingCount > 1 ? 's' : ''} waiting to sync`
                                : syncStatus === 'offline'
                                    ? 'Changes saved locally'
                                    : 'Check connection'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default OfflineIndicator;
