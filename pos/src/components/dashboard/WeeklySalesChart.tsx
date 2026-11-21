import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface WeeklySalesChartProps {
    weeklyData: any[];
}

export function WeeklySalesChart({ weeklyData }: WeeklySalesChartProps) {
    return (
        <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4 md:mb-6">
                <h2 className="text-base md:text-lg font-semibold text-slate-800">Weekly Sales Performance</h2>
                <span className="text-[10px] md:text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">Last 7 Days</span>
            </div>
            <div className="h-64 md:h-80 w-full overflow-x-auto overflow-y-hidden">
                <div className="h-full min-w-[300px] min-h-[250px] relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={250}>
                        <BarChart data={weeklyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--slate-100)" vertical={false} />
                            <XAxis dataKey="name" stroke="var(--slate-400)" fontSize={10} axisLine={false} tickLine={false} dy={10} />
                            <YAxis stroke="var(--slate-400)" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(value) => `₦${value / 1000}k`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--white)', borderRadius: '8px', border: '1px solid var(--slate-200)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                cursor={{ fill: 'var(--slate-50)' }}
                                formatter={(value: any) => [`₦${(value || 0).toLocaleString()}`, 'Sales']}
                            />
                            <Bar dataKey="sales" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
