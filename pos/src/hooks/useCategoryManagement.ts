import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { 
    collection, 
    onSnapshot, 
    query, 
    orderBy, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    where, 
    getDocs, 
    writeBatch 
} from 'firebase/firestore';
import { Category, Product } from '../types';
import { slugify } from '../utils/slugify';
import { useToast } from '../contexts/ToastContext';

export function useCategoryManagement() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    useEffect(() => {
        const q = query(collection(db, 'categories'), orderBy('sortOrder', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Category[] = [];
            snapshot.forEach((d) => {
                list.push({ id: d.id, ...d.data() } as Category);
            });
            setCategories(list);
            setLoading(false);
        }, (err) => {
            console.error('Failed to subscribe to categories:', err);
            showToast('Failed to load categories', 'error');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [showToast]);

    const addCategory = async (data: { name: string; slug?: string; parentId?: string; sortOrder?: number; active?: boolean; image?: string }) => {
        try {
            const trimmedName = data.name.trim();
            if (!trimmedName) {
                showToast('Category name is required', 'error');
                return null;
            }

            // Enforce unique slug
            let candidateSlug = (data.slug?.trim() || slugify(trimmedName)) || `category-${Date.now()}`;
            const slugExists = categories.some(c => c.slug === candidateSlug || (c.oldSlugs && c.oldSlugs.includes(candidateSlug)));
            if (slugExists) {
                showToast(`Slug "${candidateSlug}" is already taken. Please choose a unique slug.`, 'error');
                return null;
            }

            const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sortOrder || 0)) : 0;
            const sortOrder = data.sortOrder !== undefined ? data.sortOrder : maxOrder + 1;

            const newCategory: Omit<Category, 'id'> = {
                name: trimmedName,
                slug: candidateSlug,
                oldSlugs: [],
                parentId: data.parentId || undefined,
                sortOrder,
                active: data.active !== undefined ? data.active : true,
                image: data.image || undefined,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const docRef = await addDoc(collection(db, 'categories'), newCategory);
            showToast(`Category "${trimmedName}" created successfully`, 'success');
            return docRef.id;
        } catch (err: any) {
            console.error('Error adding category:', err);
            showToast(err.message || 'Failed to create category', 'error');
            return null;
        }
    };

    /**
     * Updates category.
     * Note: Renaming a category does NOT change its slug by default.
     * If slug is explicitly changed, the old slug is preserved in oldSlugs for SEO/redirects.
     * When name is updated, product display copies (product.category) are updated in batches <= 500.
     */
    const updateCategory = async (id: string, data: Partial<Category>) => {
        try {
            const currentCat = categories.find(c => c.id === id);
            if (!currentCat) {
                showToast('Category not found', 'error');
                return false;
            }

            const payload: any = {
                ...data,
                updated_at: new Date().toISOString()
            };

            // 1. Slug handling: preserve old slug in oldSlugs if explicitly changing slug
            if (data.slug && data.slug.trim() && data.slug.trim() !== currentCat.slug) {
                const newSlug = slugify(data.slug.trim());
                // Enforce unique slug across other categories
                const slugConflict = categories.some(c => c.id !== id && (c.slug === newSlug || (c.oldSlugs && c.oldSlugs.includes(newSlug))));
                if (slugConflict) {
                    showToast(`Slug "${newSlug}" is already in use by another category.`, 'error');
                    return false;
                }
                const oldSlugs = Array.from(new Set([...(currentCat.oldSlugs || []), currentCat.slug]));
                payload.slug = newSlug;
                payload.oldSlugs = oldSlugs;
            } else {
                // By default, renaming must not change slug
                delete payload.slug;
            }

            // 2. Name trimming
            if (data.name) {
                payload.name = data.name.trim();
            }

            // Update category document first
            await updateDoc(doc(db, 'categories', id), payload);

            // 3. If name changed, update product display copies chunked in batches of <= 500
            if (data.name && data.name.trim() !== currentCat.name) {
                const newName = data.name.trim();
                const q = query(collection(db, 'products'), where('categoryId', '==', id));
                const snap = await getDocs(q);

                let batch = writeBatch(db);
                let count = 0;
                for (const pDoc of snap.docs) {
                    batch.update(doc(db, 'products', pDoc.id), {
                        category: newName,
                        updated_at: new Date().toISOString()
                    });
                    count++;
                    if (count >= 500) {
                        await batch.commit();
                        batch = writeBatch(db);
                        count = 0;
                    }
                }
                if (count > 0) {
                    await batch.commit();
                }
            }

            showToast('Category updated successfully', 'success');
            return true;
        } catch (err: any) {
            console.error('Error updating category:', err);
            showToast(err.message || 'Failed to update category', 'error');
            return false;
        }
    };

    const toggleActive = async (category: Category) => {
        if (!category.id) return;
        return updateCategory(category.id, { active: !category.active });
    };

    const checkCategoryDependencies = async (categoryId: string, categoryName: string): Promise<{ 
        hasChildren: boolean; 
        childCategories: Category[]; 
        productCount: number; 
        sampleProducts: Product[] 
    }> => {
        // 1. Check for child categories
        const children = categories.filter(c => c.parentId === categoryId);
        
        // 2. Check for products (by categoryId or fallback category name)
        const qId = query(collection(db, 'products'), where('categoryId', '==', categoryId));
        const snapId = await getDocs(qId);
        let count = snapId.size;
        let sample: Product[] = [];
        snapId.forEach(d => {
            if (sample.length < 5) sample.push({ id: d.id, ...d.data() } as Product);
        });

        // Also check unmigrated products by category string
        if (count === 0) {
            const qName = query(collection(db, 'products'), where('category', '==', categoryName));
            const snapName = await getDocs(qName);
            count = snapName.size;
            snapName.forEach(d => {
                if (sample.length < 5) sample.push({ id: d.id, ...d.data() } as Product);
            });
        }

        return {
            hasChildren: children.length > 0,
            childCategories: children,
            productCount: count,
            sampleProducts: sample
        };
    };

    /**
     * Deletes category.
     * - Strictly blocked if category still has child categories.
     * - Strictly blocked if category has products unless reassignTarget is provided.
     * - Atomic chunked reassignments in batches of <= 500.
     */
    const deleteCategory = async (category: Category, reassignTargetId?: string) => {
        if (!category.id) return false;

        try {
            const { hasChildren, childCategories, productCount } = await checkCategoryDependencies(category.id, category.name);

            if (hasChildren) {
                showToast(`Cannot delete category "${category.name}": it has ${childCategories.length} child category/categories. Reassign or delete children first.`, 'error');
                return false;
            }

            if (productCount > 0 && !reassignTargetId) {
                showToast(`Cannot delete category "${category.name}": ${productCount} product(s) still belong to it. Please reassign them first.`, 'error');
                return false;
            }

            if (productCount > 0 && reassignTargetId) {
                const targetCat = categories.find(c => c.id === reassignTargetId);
                if (!targetCat) {
                    showToast('Target reassignment category not found', 'error');
                    return false;
                }

                // Query products by categoryId OR legacy category name
                const qId = query(collection(db, 'products'), where('categoryId', '==', category.id));
                const snapId = await getDocs(qId);
                const qName = query(collection(db, 'products'), where('category', '==', category.name));
                const snapName = await getDocs(qName);

                const allProductDocs = new Map<string, any>();
                snapId.docs.forEach(d => allProductDocs.set(d.id, d));
                snapName.docs.forEach(d => allProductDocs.set(d.id, d));

                let batch = writeBatch(db);
                let opCount = 0;

                for (const [docId] of allProductDocs) {
                    batch.update(doc(db, 'products', docId), {
                        categoryId: targetCat.id,
                        category: targetCat.name,
                        updated_at: new Date().toISOString()
                    });
                    opCount++;
                    if (opCount >= 500) {
                        await batch.commit();
                        batch = writeBatch(db);
                        opCount = 0;
                    }
                }
                if (opCount > 0) {
                    await batch.commit();
                }
            }

            await deleteDoc(doc(db, 'categories', category.id));
            showToast(`Category "${category.name}" deleted successfully`, 'success');
            return true;
        } catch (err: any) {
            console.error('Error deleting category:', err);
            showToast(err.message || 'Failed to delete category', 'error');
            return false;
        }
    };

    const reorderCategories = async (reorderedCategories: Category[]) => {
        try {
            let batch = writeBatch(db);
            let opCount = 0;
            for (let i = 0; i < reorderedCategories.length; i++) {
                const cat = reorderedCategories[i];
                if (cat.id) {
                    batch.update(doc(db, 'categories', cat.id), {
                        sortOrder: i + 1,
                        updated_at: new Date().toISOString()
                    });
                    opCount++;
                    if (opCount >= 500) {
                        await batch.commit();
                        batch = writeBatch(db);
                        opCount = 0;
                    }
                }
            }
            if (opCount > 0) {
                await batch.commit();
            }
            showToast('Categories reordered successfully', 'success');
            return true;
        } catch (err: any) {
            console.error('Error reordering categories:', err);
            showToast('Failed to save category order', 'error');
            return false;
        }
    };

    return {
        categories,
        loading,
        addCategory,
        updateCategory,
        toggleActive,
        deleteCategory,
        checkCategoryDependencies,
        reorderCategories
    };
}
