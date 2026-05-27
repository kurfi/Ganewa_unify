import { useState, useMemo } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Range } from 'react-date-range';
import { format } from 'date-fns';

export function useDamagedItemsReport() {
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        productId: '',
        staffId: '',
        searchKeyword: ''
    });

    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate: undefined,
            endDate: undefined,
            key: 'selection',
        },
    ]);

    const allReturnedItems = useLiveQuery(() => db.returnedItems.where('restockStatus').equals('damaged').toArray(), []);
    const allProducts = useLiveQuery(() => db.products.toArray(), []);
    const allUsers = useLiveQuery(() => db.users.toArray(), []);
    const allReturns = useLiveQuery(() => db.returns.toArray(), []);

    const filteredDamagedItems = useMemo(() => {
        if (!allReturnedItems) return [];

        let tempItems = allReturnedItems;

        if (dateRange[0]?.startDate && dateRange[0]?.endDate) {
            const start = dateRange[0].startDate.setHours(0, 0, 0, 0);
            const end = dateRange[0].endDate.setHours(23, 59, 59, 999);

            const returnsInDateRange = allReturns?.filter(ret => ret.returnDate.getTime() >= start && ret.returnDate.getTime() <= end).map(ret => ret.id) || [];
            tempItems = tempItems.filter(item => returnsInDateRange.includes(item.returnId));
        }

        if (filters.productId) {
            tempItems = tempItems.filter(item => item.productId === filters.productId);
        }

        if (filters.staffId && allReturns) {
            const returnsByStaff = allReturns.filter(ret => ret.staffId === filters.staffId).map(ret => ret.id);
            tempItems = tempItems.filter(item => returnsByStaff.includes(item.returnId));
        }

        if (filters.searchKeyword) {
            const keyword = (filters.searchKeyword || '').toLowerCase();
            tempItems = tempItems.filter(item =>
                (item.productName || '').toLowerCase().includes(keyword) ||
                (item.returnId || '').toLowerCase().includes(keyword)
            );
        }

        return tempItems.sort((a, b) => {
            const returnA = allReturns?.find(ret => ret.id === a.returnId);
            const returnB = allReturns?.find(ret => ret.id === b.returnId);
            return (returnB?.returnDate?.getTime() || 0) - (returnA?.returnDate?.getTime() || 0);
        });
    }, [allReturnedItems, filters, dateRange, allReturns]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    return {
        filters,
        dateRange,
        setDateRange,
        allProducts,
        allUsers,
        allReturns,
        filteredDamagedItems,
        handleFilterChange
    };
}
