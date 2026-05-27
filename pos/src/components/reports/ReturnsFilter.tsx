import React from 'react';
import { Filter, Calendar, Search } from 'lucide-react';
import { format } from 'date-fns';
import { Range } from 'react-date-range';
import { Customer, User, ReturnReason, PaymentMethod } from '../../types';

interface ReturnsFilterProps {
    filters: any;
    dateRange: Range[];
    allCustomers: Customer[] | undefined;
    allUsers: User[] | undefined;
    handleFilterChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

export function ReturnsFilter({
    filters,
    dateRange,
    allCustomers,
    allUsers,
    handleFilterChange
}: ReturnsFilterProps) {
    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-base md:text-lg font-semibold text-slate-700 mb-3 md:mb-4 flex items-center gap-2">
                <Filter className="w-5 h-5" /> Filters
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* Date Range Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date Range</label>
                    <div className="relative">
                        <input
                            type="text"
                            readOnly
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                            value={dateRange[0]?.startDate ? `${format(dateRange[0].startDate, 'MMM dd, yyyy')} - ${format(dateRange[0].endDate!, 'MMM dd, yyyy')}` : 'Select Date Range'}
                        />
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    </div>
                    <input
                        type="date"
                        name="startDate"
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm mt-2"
                        value={filters.startDate}
                        onChange={handleFilterChange}
                    />
                    <input
                        type="date"
                        name="endDate"
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm mt-2"
                        value={filters.endDate}
                        onChange={handleFilterChange}
                    />
                </div>

                {/* Customer Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                    <select
                        name="customerId"
                        value={filters.customerId}
                        onChange={handleFilterChange}
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">All Customers</option>
                        {allCustomers?.map(customer => (
                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                        ))}
                    </select>
                </div>

                {/* Staff Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Staff</label>
                    <select
                        name="staffId"
                        value={filters.staffId}
                        onChange={handleFilterChange}
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">All Staff</option>
                        {allUsers?.map(user => (
                            <option key={user.id} value={user.id}>{user.username}</option>
                        ))}
                    </select>
                </div>

                {/* Reason Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Return Reason</label>
                    <select
                        name="reason"
                        value={filters.reason}
                        onChange={handleFilterChange}
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">All Reasons</option>
                        {Object.values(ReturnReason).map(reason => (
                            <option key={reason} value={reason}>{reason}</option>
                        ))}
                    </select>
                </div>

                {/* Refund Method Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Refund Method</label>
                    <select
                        name="refundMethod"
                        value={filters.refundMethod}
                        onChange={handleFilterChange}
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">All Methods</option>
                        {Object.values(PaymentMethod).map(method => (
                            <option key={method} value={method}>{method}</option>
                        ))}
                    </select>
                </div>

                {/* Restock Status Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Restock Status</label>
                    <select
                        name="restockStatus"
                        value={filters.restockStatus}
                        onChange={handleFilterChange}
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">All Statuses</option>
                        <option value="restocked">Restocked</option>
                        <option value="damaged">Damaged</option>
                    </select>
                </div>

                {/* Search Keyword */}
                <div className="col-span-full xl:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Search Keyword</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            name="searchKeyword"
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Search by Customer/Sale ID/Return ID"
                            value={filters.searchKeyword}
                            onChange={handleFilterChange}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
