import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeFirestoreDates } from '../firebase/firestoreHelpers';
import { Return, ReturnedItem, Customer, User } from '../types';
import { Range } from 'react-date-range';
import { startOfMonth, endOfDay } from 'date-fns';

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
            startDate: startOfMonth(new Date()),
            endDate: endOfDay(new Date()),
            key: 'selection',
        },
    ]);

    const [allReturns, setAllReturns] = useState<Return[]>([]);
    const [allReturnedItems, setAllReturnedItems] = useState<ReturnedItem[]>([]);
    const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
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
                returnsData,
                returnedItemsData,
                customersData,
                usersData
            ] = await Promise.all([
                fetchCol<Return>('returns', 'returnDate'),
                fetchCol<ReturnedItem>('returnedItems', 'returnDate'),
                fetchCol<Customer>('customers'),
                fetchCol<User>('users')
            ]);

            setAllReturns(returnsData);
            setAllReturnedItems(returnedItemsData);
            setAllCustomers(customersData);
            setAllUsers(usersData);
        } catch (error) {
            console.error('Failed to fetch returns data', error);
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const filteredReturns = useMemo(() => {
        if (!allReturns || !allReturnedItems) return [];

        let tempReturns = allReturns;

        if (dateRange[0]?.startDate && dateRange[0]?.endDate) {
            // Already filtered server-side, but keeping local filter for safety
            const start = dateRange[0].startDate.getTime();
            const end = dateRange[0].endDate.getTime();
            tempReturns = tempReturns.filter(ret => ret.returnDate && new Date(ret.returnDate).getTime() >= start && new Date(ret.returnDate).getTime() <= end);
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

        return returnsWithFilteredItems.sort((a, b) => {
            const timeA = a.returnDate ? new Date(a.returnDate).getTime() : 0;
            const timeB = b.returnDate ? new Date(b.returnDate).getTime() : 0;
            return timeB - timeA;
        });
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
        loading,
        refresh: fetchReports,
        handleFilterChange
    };
}
