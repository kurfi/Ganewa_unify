import React, { useState, useEffect } from 'react';

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'error' | 'idle';

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const useSync = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(navigator.onLine ? 'idle' : 'offline');

  useEffect(() => {
    const handleOnline = () => setSyncStatus('idle');
    const handleOffline = () => setSyncStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { syncStatus };
};
