import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

import { SecurityProfile } from '../components/settings/SecurityProfile';
import { FilePathConfig } from '../components/settings/FilePathConfig';
import { HardwareConfig } from '../components/settings/HardwareConfig';
import { UserManagement } from '../components/settings/UserManagement';
import { SystemLogs } from '../components/settings/SystemLogs';

const Settings: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-8 pb-10">
      <h1 className="text-xl md:text-2xl font-bold text-slate-800">Settings</h1>

      <SecurityProfile />

      <FilePathConfig />

      <HardwareConfig />

      {(currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_ADMIN) && (
        <>
          <UserManagement />
          <SystemLogs />
        </>
      )}
    </div>
  );
};

export default Settings;