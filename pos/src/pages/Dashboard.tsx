import * as React from 'react';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';


import { useDashboardStats } from '../hooks/useDashboardStats';
import { DashboardMetrics } from '../components/dashboard/DashboardMetrics';
import { WeeklySalesChart } from '../components/dashboard/WeeklySalesChart';
import { QuickActions } from '../components/dashboard/QuickActions';

const Dashboard: React.FC = () => {
    const { isAdmin } = useAuth();

    const { stats, weeklyData } = useDashboardStats();

    return (
        <div className="space-y-4 md:space-y-8 max-w-[1600px] mx-auto p-4 md:p-6">
            <div className="flex justify-between items-end">
                <h1 className="text-xl md:text-2xl font-bold text-slate-800">Business Overview</h1>
                <div className="text-xs text-slate-500">{format(new Date(), 'EEEE, MMMM do, yyyy')}</div>
            </div>

            <DashboardMetrics stats={stats} isAdmin={isAdmin} />

            {/* Charts and Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                <WeeklySalesChart weeklyData={weeklyData} />
                <QuickActions isAdmin={isAdmin} />
            </div>


        </div>
    );
};

export default Dashboard;