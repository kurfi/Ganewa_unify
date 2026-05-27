import React from 'react';
import { TrendingUp, DollarSign, CreditCard, TrendingDown, Truck, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';

interface FinancialsTabProps {
    totalRevenue: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
    totalDiscounts: number;
    totalRefunds: number;
    totalSupplierDebt: number;
    totalPurchases: number;
    expenses: any[];
    loading: boolean;
}

export function FinancialsTab({
    totalRevenue, grossProfit, totalExpenses, netProfit,
    totalDiscounts, totalRefunds, totalSupplierDebt, totalPurchases,
    expenses, loading
}: FinancialsTabProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Sales</p>
                            <h3 className="text-2xl font-bold text-emerald-600 mt-1">₦{(totalRevenue || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><TrendingUp className="w-5 h-5" /></div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Gross Profit</p>
                            <h3 className="text-2xl font-bold text-blue-600 mt-1">₦{(grossProfit || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><DollarSign className="w-5 h-5" /></div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Expenses</p>
                            <h3 className="text-2xl font-bold text-red-500 mt-1">₦{(totalExpenses || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-red-100 rounded-lg text-red-600"><CreditCard className="w-5 h-5" /></div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Net Profit</p>
                            <h3 className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                ₦{(netProfit || 0).toLocaleString()}
                            </h3>
                        </div>
                        <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><span className="w-5 h-5 flex items-center justify-center font-bold text-sm">₦</span></div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Discounts Made</p>
                            <h3 className="text-2xl font-bold text-orange-500 mt-1">₦{(totalDiscounts || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><span className="w-5 h-5 flex items-center justify-center font-bold text-sm">₦</span></div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Refunds</p>
                            <h3 className="text-2xl font-bold text-rose-500 mt-1">₦{(totalRefunds || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><TrendingDown className="w-5 h-5" /></div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Purchase Costs</p>
                            <h3 className="text-2xl font-bold text-indigo-600 mt-1">₦{(totalPurchases || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><ShoppingCart className="w-5 h-5" /></div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-amber-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Supplier Debt</p>
                            <h3 className="text-2xl font-bold text-amber-600 mt-1">₦{(totalSupplierDebt || 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><Truck className="w-5 h-5" /></div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h3 className="font-bold text-slate-800">Detailed Expenses</h3>
                </div>
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="hidden md:table w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="p-4 font-medium">Date</th>
                                <th className="p-4 font-medium">Description</th>
                                <th className="p-4 font-medium">Category</th>
                                <th className="p-4 font-medium text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {expenses.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-400">
                                        {loading ? "Loading expenses..." : "No expenses recorded for this period."}
                                    </td>
                                </tr>
                            ) : (
                                expenses.map((expense) => (
                                    <tr key={expense.id} className="hover:bg-slate-50">
                                        <td className="p-4">
                                            <div className="font-medium text-slate-900">{format((expense.date as any)?.toDate?.() ?? new Date(expense.date), 'MMM dd, yyyy')}</div>
                                            <div className="text-xs text-slate-500">{format((expense.date as any)?.toDate?.() ?? new Date(expense.date), 'HH:mm')}</div>
                                        </td>
                                        <td className="p-4 text-slate-700">{expense.note}</td>
                                        <td className="p-4 text-slate-600">{expense.category}</td>
                                        <td className="p-4 text-right font-bold text-red-500">
                                            ₦{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    {/* Mobile Expenses List */}
                    <div className="md:hidden divide-y divide-slate-100 p-4 space-y-3 bg-slate-50/30">
                        {expenses.map((expense) => (
                            <div key={expense.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{format((expense.date as any)?.toDate?.() ?? new Date(expense.date), 'MMM dd, yyyy')}</p>
                                        <p className="font-bold text-slate-800 text-xs truncate">{expense.note}</p>
                                    </div>
                                    <span className="text-sm font-black text-red-500">₦{(expense.amount || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full w-fit font-bold uppercase">
                                    {expense.category}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
