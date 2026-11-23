import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

import { SecurityProfile } from '../components/settings/SecurityProfile';
import { HardwareConfig } from '../components/settings/HardwareConfig';
import { UserManagement } from '../components/settings/UserManagement';
import { SystemLogs } from '../components/settings/SystemLogs';
import { EcommercePaymentConfig } from '../components/settings/EcommercePaymentConfig';
import { DataRepair } from '../components/settings/DataRepair';

const Settings: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-8 pb-10">
      <h1 className="text-xl md:text-2xl font-bold text-slate-800">Settings</h1>

      <SecurityProfile />

      <HardwareConfig />

      {(currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_ADMIN) && (
        <>
          <EcommercePaymentConfig />
          <DataRepair />
          <UserManagement />
          <SystemLogs />
        </>
      )}
    </div>
  );
};

export default Settings;