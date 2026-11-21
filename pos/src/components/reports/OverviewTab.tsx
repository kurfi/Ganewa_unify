import React from 'react';
import { TrendingUp, Package, DollarSign, CreditCard, TrendingDown, ShoppingBag, Banknote } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = [
  'var(--blue-500, #0088FE)', 
  'var(--teal-500, #00C49F)', 
  'var(--yellow-500, #FFBB28)', 
  'var(--orange-500, #FF8042)', 
  'var(--indigo-500, #8884d8)', 
  'var(--green-500, #82ca9d)'
];

interface OverviewTabProps {
    totalRevenue: number;
    totalCOGS: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
    totalDiscounts: number;
    totalRefunds: number;
    totalTransactions: number;
    salesByDate: any[];
    salesByPayment: any[];
    topProducts: any[];
    totalDebtPaid: number;
}

export function OverviewTab({
    totalRevenue, totalCOGS, grossProfit, totalExpenses, netProfit,
    totalDiscounts, totalRefunds, totalTransactions, salesByDate,
    salesByPayment, topProducts, totalDebtPaid
}: OverviewTabProps) {
    const remainingBalance = (totalRevenue || 0) - (totalExpenses || 0) - (totalRefunds || 0);

    return (
        <div className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Total Sales</p>
                            <h3 className="text-sm md:text-xl font-bold text-emerald-600 mt-1">₦{(totalRevenue || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-emerald-100 rounded-lg text-emerald-600"><TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Cost of Goods</p>
                            <h3 className="text-sm md:text-xl font-bold text-slate-700 mt-1">₦{(totalCOGS || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-slate-100 rounded-lg text-slate-600"><Package className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Gross Profit</p>
                            <h3 className="text-sm md:text-xl font-bold text-blue-600 mt-1">₦{(grossProfit || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-blue-100 rounded-lg text-blue-600"><DollarSign className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Total Expenses</p>
                            <h3 className="text-sm md:text-xl font-bold text-red-500 mt-1">₦{(totalExpenses || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-red-100 rounded-lg text-red-600"><CreditCard className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200 bg-gradient-to-br from-indigo-50/60 to-white">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Remaining Balance</p>
                            <h3 className={`text-sm md:text-xl font-bold mt-1 ${remainingBalance >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
                                ₦{remainingBalance.toLocaleString()}
                            </h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-indigo-100 rounded-lg text-indigo-600"><span className="w-3.5 h-3.5 md:w-4 md:h-4 flex items-center justify-center font-bold text-xs md:text-sm">₦</span></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Net Profit</p>
                            <h3 className={`text-sm md:text-xl font-bold mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                ₦{(netProfit || 0).toLocaleString()}
                            </h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-purple-100 rounded-lg text-purple-600"><span className="w-3.5 h-3.5 md:w-4 md:h-4 flex items-center justify-center font-bold text-xs md:text-sm">₦</span></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Discounts</p>
                            <h3 className="text-sm md:text-xl font-bold text-orange-500 mt-1">₦{(totalDiscounts || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-orange-100 rounded-lg text-orange-600"><span className="w-3.5 h-3.5 md:w-4 md:h-4 flex items-center justify-center font-bold text-xs md:text-sm">₦</span></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Total Refunds</p>
                            <h3 className="text-sm md:text-xl font-bold text-rose-500 mt-1">₦{(totalRefunds || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-rose-100 rounded-lg text-rose-600"><TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Transactions</p>
                            <h3 className="text-sm md:text-xl font-bold text-slate-800 mt-1">{totalTransactions}</h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-amber-100 rounded-lg text-amber-600"><ShoppingBag className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                    </div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider">Debt Collected</p>
                            <h3 className="text-sm md:text-xl font-bold text-teal-600 mt-1">₦{(totalDebtPaid || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 md:p-2 bg-teal-100 rounded-lg text-teal-600"><Banknote className="w-3.5 h-3.5 md:w-4 md:h-4" /></div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-6">Sales Trend</h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={salesByDate}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--slate-100)" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--slate-500)' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--slate-500)' }} tickFormatter={(value) => `N${value / 1000}k`} />
                                <RechartsTooltip
                                    formatter={(value: number) => [`₦${(value || 0).toLocaleString()}`, 'Revenue']}
                                    contentStyle={{ backgroundColor: 'var(--white)', borderRadius: '8px', border: '1px solid var(--slate-200)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area type="monotone" dataKey="amount" stroke="var(--accent-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-6">Payment Methods</h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={salesByPayment}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {salesByPayment.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip formatter={(value: number) => `₦${(value || 0).toLocaleString()}`} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 md:p-6 border-b border-slate-200">
                    <h3 className="font-bold text-slate-800 text-sm md:text-base">Top Selling Products</h3>
                </div>
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="p-4 font-medium">Product</th>
                                <th className="p-4 font-medium text-right">Quantity Sold</th>
                                <th className="p-4 font-medium text-right">Revenue</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {topProducts.map((p, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                    <td className="p-4 text-slate-800 font-medium">{p.name}</td>
                                    <td className="p-4 text-right text-slate-600">{p.qty}</td>
                                    <td className="p-4 text-right font-bold text-emerald-600">₦{(p.revenue || 0).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100">
                    {topProducts.map((p, i) => (
                        <div key={i} className="p-4 flex justify-between items-center">
                            <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate text-xs uppercase">{p.name}</p>
                                <p className="text-[10px] text-slate-500">Sold: {p.qty}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-emerald-600 text-sm">₦{(p.revenue || 0).toLocaleString()}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
