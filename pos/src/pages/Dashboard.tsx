import * as React from 'react';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { DashboardMetrics } from '../components/dashboard/DashboardMetrics';
import { WeeklySalesChart } from '../components/dashboard/WeeklySalesChart';
import { QuickActions } from '../components/dashboard/QuickActions';
import { WifiOff, RefreshCw } from 'lucide-react';

const Dashboard: React.FC = () => {
    const { isAdmin } = useAuth();
    const { stats, weeklyData, loading, error, refresh } = useDashboardStats();

    return (
        <div className="space-y-4 md:space-y-8 max-w-[1600px] mx-auto p-4 md:p-6 relative">
            <div className="flex justify-between items-end">
                <h1 className="text-xl md:text-2xl font-bold text-slate-800">Business Overview</h1>
                <div className="flex flex-col items-end gap-2">
                    <div className="text-xs text-slate-500">{format(new Date(), 'EEEE, MMMM do, yyyy')}</div>
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="text-xs flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh Data
                    </button>
                </div>
            </div>

            {error ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <WifiOff className="w-16 h-16 text-slate-400 mb-4" />
                    <h2 className="text-2xl font-semibold text-slate-700 mb-2">Offline</h2>
                    <p className="text-lg">{error}</p>
                </div>
            ) : (
                <>
                    {loading && (
                        <div className="absolute top-0 left-0 right-0 bottom-0 bg-white/50 z-10 flex items-center justify-center rounded-xl min-h-[500px]">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
                        </div>
                    )}

                    <div className={loading ? 'opacity-50 pointer-events-none' : ''}>
                        <DashboardMetrics stats={stats} isAdmin={isAdmin} />

                        {/* Charts and Actions */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mt-4 md:mt-8">
                            <WeeklySalesChart weeklyData={weeklyData} />
                            <QuickActions isAdmin={isAdmin} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Dashboard;