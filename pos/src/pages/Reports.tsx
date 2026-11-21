import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { useReportsData } from '../hooks/useReportsData';
import { ReportsHeader } from '../components/reports/ReportsHeader';
import { ReportsTabs } from '../components/reports/ReportsTabs';
import { OverviewTab } from '../components/reports/OverviewTab';
import { InventoryTab } from '../components/reports/InventoryTab';
import { SalesTab } from '../components/reports/SalesTab';
import { FinancialsTab } from '../components/reports/FinancialsTab';
import { DailyReportTab } from '../components/reports/DailyReportTab';
import ReturnAnalytics from '../components/ReturnAnalytics';
import ReturnsReport from './ReturnsReport';
import DamagedItemsReport from './DamagedItemsReport';

const Reports: React.FC = () => {
    const {
        startDate, setStartDate,
        endDate, setEndDate,
        sales, expenses, products, returns, returnedItems,
        loading,
        activePreset, handleSetPreset,
        activeTab, setActiveTab,
        salesSearchQuery, setSalesSearchQuery,
        saleSource, setSaleSource,
        totalRevenue, totalDiscounts, totalTransactions, avgOrderValue,
        totalExpenses, totalRefunds, totalValueLost,
        totalCOGS, grossProfit, netProfit,
        totalSupplierDebt, totalPurchases, totalDebtPaid,
        customerPayments, supplierPayments, purchases,
        totalSupplierDebtSettled, totalPurchasesPaid,
        filteredSales, salesByDate, salesByPayment,
        inventoryAnalysis, topProducts
    } = useReportsData();

    return (
        <div className="space-y-4 md:space-y-6 pb-20">
            <ReportsHeader
                startDate={startDate}
                endDate={endDate}
                totalRevenue={totalRevenue}
                totalRefunds={totalRefunds}
                totalValueLost={totalValueLost}
                totalCOGS={totalCOGS}
                totalExpenses={totalExpenses}
                totalDiscounts={totalDiscounts}
                grossProfit={grossProfit}
                netProfit={netProfit}
                salesByPayment={salesByPayment}
                sales={sales}
            />

            {/* Date Filter Bar - Only shown for non-daily tabs since Daily Report has its own Day Navigator */}
            {activeTab !== 'daily' && (
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-full lg:w-auto overflow-x-auto">
                            {(['today', 'week', 'month', 'year'] as const).map(preset => (
                                <button
                                    key={preset}
                                    onClick={() => handleSetPreset(preset)}
                                    className={`flex-1 lg:flex-none px-2.5 md:px-3 py-1 md:py-1.5 rounded-md text-[10px] md:text-sm font-medium capitalize transition-all ${activePreset === preset ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3 w-full lg:w-auto">
                            <div className="flex items-center gap-2 flex-1 lg:flex-none">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => { setStartDate(e.target.value); handleSetPreset('custom' as any); }}
                                    className="w-full lg:w-auto p-1.5 md:p-2 border border-slate-200 rounded-lg text-xs md:text-sm outline-none focus:border-emerald-500 font-medium text-slate-700"
                                />
                                <span className="text-slate-400">-</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => { setEndDate(e.target.value); handleSetPreset('custom' as any); }}
                                    className="w-full lg:w-auto p-1.5 md:p-2 border border-slate-200 rounded-lg text-xs md:text-sm outline-none focus:border-emerald-500 font-medium text-slate-700"
                                />
                            </div>
                            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                                <select
                                    value={saleSource}
                                    onChange={(e) => setSaleSource(e.target.value as any)}
                                    className="p-1.5 md:p-2 border border-slate-200 rounded-lg text-xs md:text-sm outline-none focus:border-emerald-500 bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300 transition-colors"
                                >
                                    <option value="all">All Channels</option>
                                    <option value="pos">POS (In-Store)</option>
                                    <option value="online">Online Shop</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ReportsTabs 
                activeTab={activeTab} 
                setActiveTab={(tab) => {
                    setActiveTab(tab);
                    if (tab === 'daily' && startDate !== endDate) {
                        handleSetPreset('today');
                    }
                }} 
            />

            {/* CONTENT AREAS */}
            {activeTab === 'daily' && (
                <DailyReportTab
                    selectedDate={startDate}
                    onDateChange={(newDate) => {
                        setStartDate(newDate);
                        setEndDate(newDate);
                        handleSetPreset('custom' as any);
                    }}
                    sales={sales}
                    expenses={expenses}
                    returns={returns}
                    customerPayments={customerPayments}
                    supplierPayments={supplierPayments}
                    purchases={purchases}
                    loading={loading}
                    totalRevenue={totalRevenue}
                    totalExpenses={totalExpenses}
                    totalRefunds={totalRefunds}
                    totalDiscounts={totalDiscounts}
                    totalDebtPaid={totalDebtPaid}
                    totalSupplierDebtSettled={totalSupplierDebtSettled}
                    totalPurchasesPaid={totalPurchasesPaid}
                    salesByPayment={salesByPayment}
                />
            )}

            {activeTab === 'overview' && (
                <OverviewTab
                    totalRevenue={totalRevenue}
                    totalCOGS={totalCOGS}
                    grossProfit={grossProfit}
                    totalExpenses={totalExpenses}
                    netProfit={netProfit}
                    totalDiscounts={totalDiscounts}
                    totalRefunds={totalRefunds}
                    totalTransactions={totalTransactions}
                    salesByDate={salesByDate}
                    salesByPayment={salesByPayment}
                    topProducts={topProducts}
                    totalDebtPaid={totalDebtPaid}
                />
            )}

            {activeTab === 'inventory' && (
                <InventoryTab inventoryAnalysis={inventoryAnalysis} />
            )}

            {activeTab === 'sales' && (
                <SalesTab
                    salesSearchQuery={salesSearchQuery}
                    setSalesSearchQuery={setSalesSearchQuery}
                    filteredSales={filteredSales}
                    loading={loading}
                />
            )}

            {activeTab === 'financials' && (
                <FinancialsTab
                    totalRevenue={totalRevenue}
                    grossProfit={grossProfit}
                    totalExpenses={totalExpenses}
                    netProfit={netProfit}
                    totalDiscounts={totalDiscounts}
                    totalRefunds={totalRefunds}
                    totalSupplierDebt={totalSupplierDebt}
                    totalPurchases={totalPurchases}
                    expenses={expenses}
                    loading={loading}
                />
            )}

            {activeTab === 'returnAnalytics' && (
                <ReturnAnalytics startDate={startDate} endDate={endDate} />
            )}

            {activeTab === 'returnsLog' && (
                <ReturnsReport />
            )}

            {activeTab === 'damagedItems' && (
                <DamagedItemsReport />
            )}
        </div>
    );
};

export default Reports;