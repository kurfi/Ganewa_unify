import React from 'react';
import { DollarSign, AlertTriangle, TrendingDown, Wallet, CreditCard, Package, ArrowUpRight, ArrowDownRight, Truck, Banknote, Building2, Scale } from 'lucide-react';

interface DashboardMetricsProps {
    stats: any;
    isAdmin: boolean;
}

export function DashboardMetrics({ stats, isAdmin }: DashboardMetricsProps) {
    return (
        <>
            {/* SECTION 1: Daily Pulse */}
            <div>
                <h2 className="text-[10px] md:text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 md:mb-3">Daily Pulse</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center bg-gradient-to-br from-emerald-50 to-white">
                        <div>
                            <p className="text-xs md:text-sm font-medium text-slate-500">Net Sales (Today)</p>
                            <h3 className="text-xl md:text-2xl font-bold text-emerald-700">₦{(stats.netSalesToday || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <div className="flex items-center gap-1 text-[10px] md:text-xs text-emerald-600 mt-1">
                                <ArrowUpRight className="w-3 h-3" />
                                <span>Actual Cash Flow</span>
                            </div>
                        </div>
                        <div className="p-2 md:p-3 bg-emerald-100 rounded-full border border-emerald-200">
                            <Wallet className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
                        </div>
                    </div>

                    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs md:text-sm font-medium text-slate-500">Gross Sales</p>
                            <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.todaySales || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <div className="flex items-center gap-1 text-[10px] md:text-xs text-emerald-600 mt-1">
                                <ArrowUpRight className="w-3 h-3" />
                                <span>Total Revenue</span>
                            </div>
                        </div>
                        <div className="p-2 md:p-3 bg-blue-50 rounded-full">
                            <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                        </div>
                    </div>

                    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs md:text-sm font-medium text-slate-500">Today's Refunds</p>
                            <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.totalRefundAmountToday || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <div className="flex items-center gap-1 text-[10px] md:text-xs text-red-500 mt-1">
                                <ArrowDownRight className="w-3 h-3" />
                                <span>Cash Out</span>
                            </div>
                        </div>
                        <div className="p-2 md:p-3 bg-red-50 rounded-full">
                            <TrendingDown className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
                        </div>
                    </div>

                    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs md:text-sm font-medium text-slate-500">Paid Expenses</p>
                            <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.todayExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <div className="flex items-center gap-1 text-[10px] md:text-xs text-red-500 mt-1">
                                <TrendingDown className="w-3 h-3" />
                                <span>Cash Out</span>
                            </div>
                        </div>
                        <div className="p-2 md:p-3 bg-red-50 rounded-full">
                            <CreditCard className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
                        </div>
                    </div>

                    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs md:text-sm font-medium text-slate-500">Low Stock</p>
                            <h3 className="text-xl md:text-2xl font-bold text-slate-900">{stats.lowStockItems}</h3>
                            <p className="text-[10px] md:text-xs text-slate-400 mt-1">Items to order</p>
                        </div>
                        <div className="p-2 md:p-3 bg-amber-50 rounded-full">
                            <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-amber-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Everything below — admin only */}
            {isAdmin && (
                <>
                    {/* SECTION 2: Financial Status */}
                    <div>
                        <h2 className="text-[10px] md:text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 md:mb-3">Financial Status</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 md:p-2 bg-orange-100 rounded-lg text-orange-600"><ArrowDownRight className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                                        <p className="text-xs md:text-sm font-medium text-slate-600">Debt</p>
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.totalDebtToUs || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Debt customers owe us</p>
                                </div>
                            </div>

                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-rose-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 md:p-2 bg-rose-100 rounded-lg text-rose-600"><ArrowUpRight className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                                        <p className="text-xs md:text-sm font-medium text-slate-600">Unpaid Expenses</p>
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.totalDebtToPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Unpaid expenses/bills</p>
                                </div>
                            </div>

                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 md:p-2 bg-slate-100 rounded-lg text-slate-600"><CreditCard className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                                        <p className="text-xs md:text-sm font-medium text-slate-600">Total Expenses</p>
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.totalExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Lifetime paid expenses</p>
                                </div>
                            </div>

                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 md:p-2 bg-blue-100 rounded-lg text-blue-600"><Package className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                                        <p className="text-xs md:text-sm font-medium text-slate-600">Inventory Value</p>
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.inventoryValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Asset valuation (Cost)</p>
                                </div>
                            </div>

                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 md:p-2 bg-purple-100 rounded-lg text-purple-600"><TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                                        <p className="text-xs md:text-sm font-medium text-slate-600">Total Refunds (Month)</p>
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.totalRefundAmountThisMonth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Refunds issued this month</p>
                                </div>
                            </div>

                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-rose-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 md:p-2 bg-rose-100 rounded-lg text-rose-600"><AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                                        <p className="text-xs md:text-sm font-medium text-slate-600">Damaged Value (Month)</p>
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.totalValueDamagedThisMonth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Value lost from damaged returns</p>
                                </div>
                            </div>

                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 md:p-2 bg-emerald-100 rounded-lg text-emerald-600"><TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                                        <p className="text-xs md:text-sm font-medium text-slate-600">Return Rate (Month)</p>
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">{stats.returnRateThisMonth.toFixed(2)}%</h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Refunds / Total Sales</p>
                                </div>
                            </div>

                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group border-l-4 border-l-amber-500">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-amber-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 md:p-2 bg-amber-100 rounded-lg text-amber-600"><Truck className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                                        <p className="text-xs md:text-sm font-medium text-slate-600">Supplier Debt</p>
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">₦{(stats.totalSupplierDebt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Total balance owed to suppliers</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 3: Business Finances */}
                    <div>
                        <h2 className="text-[10px] md:text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 md:mb-3">Business Finances</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center bg-gradient-to-br from-green-50 to-white">
                                <div>
                                    <p className="text-xs md:text-sm font-medium text-slate-500">Cash at Hand</p>
                                    <h3 className={`text-xl md:text-2xl font-bold ${stats.cashAtHand < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                        ₦{(stats.cashAtHand || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Cash sales + repayments − expenses − refunds − supplier payments</p>
                                </div>
                                <div className="p-2 md:p-3 bg-green-100 rounded-full border border-green-200">
                                    <Banknote className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                                </div>
                            </div>

                            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center bg-gradient-to-br from-indigo-50 to-white">
                                <div>
                                    <p className="text-xs md:text-sm font-medium text-slate-500">Money in Bank</p>
                                    <h3 className={`text-xl md:text-2xl font-bold ${stats.moneyInBank < 0 ? 'text-red-600' : 'text-indigo-700'}`}>
                                        ₦{(stats.moneyInBank || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Transfer & POS sales + repayments − refunds − supplier payments</p>
                                </div>
                                <div className="p-2 md:p-3 bg-indigo-100 rounded-full border border-indigo-200">
                                    <Building2 className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
                                </div>
                            </div>

                            <div className={`bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center bg-gradient-to-br ${stats.workingCapital >= 0 ? 'from-emerald-50' : 'from-red-50'} to-white`}>
                                <div>
                                    <p className="text-xs md:text-sm font-medium text-slate-500">Working Capital</p>
                                    <h3 className={`text-xl md:text-2xl font-bold ${stats.workingCapital >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                        ₦{(stats.workingCapital || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Assets − Liabilities</p>
                                    <div className="text-[10px] md:text-xs text-slate-500 mt-1 font-medium italic">
                                        Assets: ₦{(stats.assets || 0).toLocaleString()} | Liabilities: ₦{(stats.liabilities || 0).toLocaleString()}
                                    </div>
                                </div>
                                <div className={`p-2 md:p-3 rounded-full border ${stats.workingCapital >= 0 ? 'bg-emerald-100 border-emerald-200' : 'bg-red-100 border-red-200'}`}>
                                    <Scale className={`w-5 h-5 md:w-6 md:h-6 ${stats.workingCapital >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
