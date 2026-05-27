import { useState, useMemo } from 'react';
import { db } from '../db/db';
import { Return, ReturnedItem } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { Range } from 'react-date-range';
import { format } from 'date-fns';

export function useReturnsReport() {
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        customerId: '',
        staffId: '',
        reason: '',
        refundMethod: '',
        restockStatus: '',
        searchKeyword: ''
    });

    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate: undefined,
            endDate: undefined,
            key: 'selection',
        },
    ]);

    const allReturns = useLiveQuery(() => db.returns.toArray(), []);
    const allReturnedItems = useLiveQuery(() => db.returnedItems.toArray(), []);
    const allCustomers = useLiveQuery(() => db.customers.toArray(), []);
    const allUsers = useLiveQuery(() => db.users.toArray(), []);

    const filteredReturns = useMemo(() => {
        if (!allReturns || !allReturnedItems) return [];

        let tempReturns = allReturns;

        if (dateRange[0]?.startDate && dateRange[0]?.endDate) {
            const start = dateRange[0].startDate.setHours(0, 0, 0, 0);
            const end = dateRange[0].endDate.setHours(23, 59, 59, 999);
            tempReturns = tempReturns.filter(ret => ret.returnDate.getTime() >= start && ret.returnDate.getTime() <= end);
        }

        if (filters.customerId) {
            tempReturns = tempReturns.filter(ret => ret.customerId === filters.customerId);
        }

        if (filters.staffId) {
            tempReturns = tempReturns.filter(ret => ret.staffId === filters.staffId);
        }

        if (filters.reason) {
            tempReturns = tempReturns.filter(ret => ret.reason === filters.reason);
        }

        if (filters.refundMethod) {
            tempReturns = tempReturns.filter(ret => ret.paymentMethod === filters.refundMethod);
        }

        if (filters.searchKeyword) {
            const keyword = (filters.searchKeyword || '').toLowerCase();
            tempReturns = tempReturns.filter(ret =>
                (ret.customerName || '').toLowerCase().includes(keyword) ||
                (ret.saleId?.toString() || '').includes(keyword) ||
                (ret.id?.toString() || '').includes(keyword)
            );
        }

        const returnsWithFilteredItems = tempReturns.map(ret => {
            const itemsForReturn = allReturnedItems.filter(item => item.returnId === ret.id);
            if (filters.restockStatus) {
                const filteredItems = itemsForReturn.filter(item => item.restockStatus === filters.restockStatus);
                return filteredItems.length > 0 ? { ...ret, returnedItems: filteredItems } : null;
            }
            return { ...ret, returnedItems: itemsForReturn };
        }).filter(Boolean) as (Return & { returnedItems: ReturnedItem[] })[];

        return returnsWithFilteredItems.sort((a, b) => b.returnDate.getTime() - a.returnDate.getTime());
    }, [allReturns, allReturnedItems, filters, dateRange]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    return {
        filters,
        dateRange,
        setDateRange,
        allCustomers,
        allUsers,
        filteredReturns,
        handleFilterChange
    };
}
