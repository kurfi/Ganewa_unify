import React from 'react';
import { Filter, Calendar, Search } from 'lucide-react';
import { format } from 'date-fns';
import { Range } from 'react-date-range';
import { Product, User } from '../../types';

interface DamagedItemsFilterProps {
    filters: any;
    dateRange: Range[];
    allProducts: Product[] | undefined;
    allUsers: User[] | undefined;
    handleFilterChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

export function DamagedItemsFilter({
    filters,
    dateRange,
    allProducts,
    allUsers,
    handleFilterChange
}: DamagedItemsFilterProps) {
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

                {/* Product Filter */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                    <select
                        name="productId"
                        value={filters.productId}
                        onChange={handleFilterChange}
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">All Products</option>
                        {allProducts?.map(product => (
                            <option key={product.id} value={product.id}>{product.name}</option>
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

                {/* Search Keyword */}
                <div className="col-span-full xl:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Search Keyword</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            name="searchKeyword"
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Search by Product Name/Return ID"
                            value={filters.searchKeyword}
                            onChange={handleFilterChange}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
