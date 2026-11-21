import { useState, useCallback, useEffect } from 'react';
import { collection, query, limit, startAfter, getDocs, orderBy, where, QueryConstraint, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeFirestoreDates } from '../firebase/firestoreHelpers';

interface PaginationOptions {
    collectionName: string;
    pageSize?: number;
    orderByField?: string;
    orderDirection?: 'asc' | 'desc';
    extraConstraints?: QueryConstraint[];
    searchTerm?: string;
    searchField?: string | string[];
}

export function usePaginatedCollection<T = any>({
    collectionName,
    pageSize = 20,
    orderByField = 'created_at',
    orderDirection = 'desc',
    extraConstraints = [],
    searchTerm = '',
    searchField
}: PaginationOptions) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

    // Deep comparison of extra constraints using stringify as done in useCollection
    const constraintsHash = JSON.stringify(extraConstraints);
    const searchFieldHash = JSON.stringify(searchField);

    const loadInitial = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const term = (searchTerm || '').trim().toLowerCase();

            if (term && searchField) {
                if (typeof searchField === 'string') {
                    // Single field prefix search
                    let qConstraints = [
                        where('deleted', '==', false),
                        ...extraConstraints,
                        where(searchField, '>=', term),
                        where(searchField, '<=', term + '\uf8ff'),
                        orderBy(searchField, 'asc'),
                        limit(pageSize)
                    ];
                    
                    const q = query(collection(db, collectionName), ...qConstraints);
                    const snapshot = await getDocs(q);
                    
                    const items = snapshot.docs.map(doc => {
                        const normalized = normalizeFirestoreDates<any>(doc.data());
                        return { ...normalized, id: doc.id } as T;
                    });
                    
                    setData(items);
                    setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
                    setHasMore(snapshot.docs.length === pageSize);
                } else {
                    // Multiple fields search (run queries in parallel, merge, sort)
                    const promises = searchField.map(async (field) => {
                        let qConstraints = [
                            where('deleted', '==', false),
                            ...extraConstraints,
                            where(field, '>=', term),
                            where(field, '<=', term + '\uf8ff'),
                            orderBy(field, 'asc'),
                            limit(pageSize)
                        ];
                        const q = query(collection(db, collectionName), ...qConstraints);
                        const snapshot = await getDocs(q);
                        return snapshot.docs.map(doc => {
                            const normalized = normalizeFirestoreDates<any>(doc.data());
                            return { ...normalized, id: doc.id } as T;
                        });
                    });

                    const results = await Promise.all(promises);
                    const mergedMap = new Map<string, T>();
                    results.forEach(items => {
                        items.forEach(item => {
                            mergedMap.set((item as any).id, item);
                        });
                    });

                    let mergedList = Array.from(mergedMap.values());
                    
                    // Sort merged list client-side
                    if (orderByField) {
                        mergedList.sort((a: any, b: any) => {
                            const valA = a[orderByField];
                            const valB = b[orderByField];
                            
                            // Handle date objects or ISO strings
                            const dateA = valA instanceof Date ? valA.getTime() : (typeof valA === 'string' ? new Date(valA).getTime() : valA);
                            const dateB = valB instanceof Date ? valB.getTime() : (typeof valB === 'string' ? new Date(valB).getTime() : valB);

                            if (typeof dateA === 'number' && typeof dateB === 'number') {
                                return orderDirection === 'asc' ? dateA - dateB : dateB - dateA;
                            }
                            
                            if (valA < valB) return orderDirection === 'asc' ? -1 : 1;
                            if (valA > valB) return orderDirection === 'asc' ? 1 : -1;
                            return 0;
                        });
                    }

                    setData(mergedList);
                    setLastVisible(null);
                    setHasMore(false); // No pagination for merged queries
                }
            } else {
                // Regular query
                let qConstraints = [
                    where('deleted', '==', false),
                    ...extraConstraints,
                    orderBy(orderByField, orderDirection),
                    limit(pageSize)
                ];
                
                const q = query(collection(db, collectionName), ...qConstraints);
                const snapshot = await getDocs(q);
                
                const items = snapshot.docs.map(doc => {
                    const normalized = normalizeFirestoreDates<any>(doc.data());
                    return { ...normalized, id: doc.id } as T;
                });
                
                setData(items);
                setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
                setHasMore(snapshot.docs.length === pageSize);
            }
        } catch (err: any) {
            console.error(`Error loading ${collectionName}:`, err);
            setError(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectionName, pageSize, orderByField, orderDirection, constraintsHash, searchTerm, searchFieldHash]);

    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore || !lastVisible) return;
        
        setLoadingMore(true);
        setError(null);
        try {
            const term = (searchTerm || '').trim().toLowerCase();

            if (term && searchField && typeof searchField === 'string') {
                let qConstraints = [
                    where('deleted', '==', false),
                    ...extraConstraints,
                    where(searchField, '>=', term),
                    where(searchField, '<=', term + '\uf8ff'),
                    orderBy(searchField, 'asc'),
                    startAfter(lastVisible),
                    limit(pageSize)
                ];
                
                const q = query(collection(db, collectionName), ...qConstraints);
                const snapshot = await getDocs(q);
                
                const newItems = snapshot.docs.map(doc => {
                    const normalized = normalizeFirestoreDates<any>(doc.data());
                    return { ...normalized, id: doc.id } as T;
                });
                
                setData(prev => [...prev, ...newItems]);
                setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
                setHasMore(snapshot.docs.length === pageSize);
            } else if (term && searchField) {
                // Multi-field search doesn't support loadMore
                setHasMore(false);
            } else {
                let qConstraints = [
                    where('deleted', '==', false),
                    ...extraConstraints,
                    orderBy(orderByField, orderDirection),
                    startAfter(lastVisible),
                    limit(pageSize)
                ];
                
                const q = query(collection(db, collectionName), ...qConstraints);
                const snapshot = await getDocs(q);
                
                const newItems = snapshot.docs.map(doc => {
                    const normalized = normalizeFirestoreDates<any>(doc.data());
                    return { ...normalized, id: doc.id } as T;
                });
                
                setData(prev => [...prev, ...newItems]);
                setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
                setHasMore(snapshot.docs.length === pageSize);
            }
        } catch (err: any) {
            console.error(`Error loading more ${collectionName}:`, err);
            setError(err.message || 'Failed to load more data');
        } finally {
            setLoadingMore(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectionName, pageSize, orderByField, orderDirection, hasMore, loadingMore, lastVisible, constraintsHash, searchTerm, searchFieldHash]);

    const refresh = useCallback(() => {
        return loadInitial();
    }, [loadInitial]);

    const updateItem = useCallback((id: string, updates: Partial<T>) => {
        setData(prev => prev.map(item => ((item as any).id === id ? { ...item, ...updates } : item)));
    }, []);

    const addItem = useCallback((item: T) => {
        setData(prev => [item, ...prev]);
    }, []);

    const removeItem = useCallback((id: string) => {
        setData(prev => prev.filter(item => (item as any).id !== id));
    }, []);

    useEffect(() => {
        loadInitial();
    }, [loadInitial]);

    return { data, loading, loadingMore, hasMore, loadMore, refresh, updateItem, addItem, removeItem, error };
}
