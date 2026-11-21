import React from 'react';
import { Calendar, PieChart as PieIcon, TrendingUp, Package, RotateCcw, ClipboardList, AlertTriangle } from 'lucide-react';

interface ReportsTabsProps {
    activeTab: 'daily' | 'overview' | 'sales' | 'inventory' | 'financials' | 'returnAnalytics' | 'returnsLog' | 'damagedItems';
    setActiveTab: (tab: 'daily' | 'overview' | 'sales' | 'inventory' | 'financials' | 'returnAnalytics' | 'returnsLog' | 'damagedItems') => void;
}

export function ReportsTabs({ activeTab, setActiveTab }: ReportsTabsProps) {
    const TabButton: React.FC<{ id: typeof activeTab, label: string, icon: React.ReactNode }> = ({ id, label, icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium ${activeTab === id
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-emerald-50'
                }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 md:pb-4">
            <TabButton id="daily" label="Daily Report" icon={<Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />} />
            <TabButton id="overview" label="Overview" icon={<PieIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />} />
            <TabButton id="sales" label="Sales" icon={<TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" />} />
            <TabButton id="inventory" label="Inventory" icon={<Package className="w-3.5 h-3.5 md:w-4 md:h-4" />} />
            <TabButton id="financials" label="Financials" icon={<span className="w-3.5 h-3.5 md:w-4 md:h-4 flex items-center justify-center font-bold text-[10px] md:text-xs">₦</span>} />
            <TabButton id="returnAnalytics" label="Returns Analytics" icon={<RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" />} />
            <TabButton id="returnsLog" label="Returns Log" icon={<ClipboardList className="w-3.5 h-3.5 md:w-4 md:h-4" />} />
            <TabButton id="damagedItems" label="Damaged Items" icon={<AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4" />} />
        </div>
    );
}

