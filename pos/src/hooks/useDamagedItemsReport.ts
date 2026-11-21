import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeFirestoreDates } from '../firebase/firestoreHelpers';
import { ReturnedItem, Product, User, Return } from '../types';
import { Range } from 'react-date-range';
import { startOfMonth, endOfDay } from 'date-fns';

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
            startDate: startOfMonth(new Date()),
            endDate: endOfDay(new Date()),
            key: 'selection',
        },
    ]);

    const [rawReturnedItems, setRawReturnedItems] = useState<ReturnedItem[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [allReturns, setAllReturns] = useState<Return[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchReports = useCallback(async () => {
        if (!dateRange[0]?.startDate || !dateRange[0]?.endDate) return;

        setLoading(true);
        try {
            const startObj = dateRange[0].startDate;
            const endObj = dateRange[0].endDate;
            endObj.setHours(23, 59, 59, 999);
            const startTimestamp = Timestamp.fromDate(startObj);
            const endTimestamp = Timestamp.fromDate(endObj);

            const fetchCol = async <T>(colName: string, dateField?: string) => {
                let qConstraints = [where('deleted', '==', false)];
                if (dateField) {
                    qConstraints.push(where(dateField, '>=', startTimestamp));
                    qConstraints.push(where(dateField, '<=', endTimestamp));
                }
                const q = query(collection(db, colName), ...qConstraints);
                const snapshot = await getDocs(q);
                return snapshot.docs.map(doc => {
                    const data = doc.data();
                    const normalized = normalizeFirestoreDates<any>(data);
                    return { ...normalized, id: doc.id } as T;
                });
            };

            const [
                returnedItemsData,
                productsData,
                usersData,
                returnsData
            ] = await Promise.all([
                fetchCol<ReturnedItem>('returnedItems', 'returnDate'),
                fetchCol<Product>('products'),
                fetchCol<User>('users'),
                fetchCol<Return>('returns', 'returnDate')
            ]);

            setRawReturnedItems(returnedItemsData);
            setAllProducts(productsData);
            setAllUsers(usersData);
            setAllReturns(returnsData);
        } catch (error) {
            console.error('Failed to fetch damaged items data', error);
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const allReturnedItems = useMemo(() => {
        return rawReturnedItems.filter(item => item.restockStatus === 'damaged');
    }, [rawReturnedItems]);

    const filteredDamagedItems = useMemo(() => {
        if (!allReturnedItems) return [];

        let tempItems = allReturnedItems;

        if (dateRange[0]?.startDate && dateRange[0]?.endDate) {
            const start = dateRange[0].startDate.getTime();
            const end = dateRange[0].endDate.getTime();

            const returnsInDateRange = allReturns
                .filter(ret => ret.returnDate && new Date(ret.returnDate).getTime() >= start && new Date(ret.returnDate).getTime() <= end)
                .map(ret => ret.id);
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
            const timeA = returnA?.returnDate ? new Date(returnA.returnDate).getTime() : 0;
            const timeB = returnB?.returnDate ? new Date(returnB.returnDate).getTime() : 0;
            return timeB - timeA;
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
        loading,
        refresh: fetchReports,
        handleFilterChange
    };
}
