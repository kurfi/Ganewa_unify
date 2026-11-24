import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Category } from '../types';

export function useActiveCategories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Query active categories ordered by sortOrder
        const q = query(
            collection(db, 'categories'),
            where('active', '==', true),
            orderBy('sortOrder', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Category[] = [];
            snapshot.forEach(d => {
                list.push({ id: d.id, ...d.data() } as Category);
            });
            setCategories(list);
            setLoading(false);
            setError(null);
        }, (err) => {
            console.error('Error fetching active categories:', err);
            setError('Failed to load categories from server.');
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { categories, loading, error };
}
