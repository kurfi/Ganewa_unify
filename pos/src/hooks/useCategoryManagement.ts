import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    writeBatch,
    getDocs
} from 'firebase/firestore';
import { Category } from '../types';
import { useToast } from '../contexts/ToastContext';
import { slugify, isSlugUnique } from '../utils/slugify';

export function useCategoryManagement() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [propagationFailedCategories, setPropagationFailedCategories] = useState<{ id: string; name: string }[]>([]);
    const { showToast } = useToast();

    useEffect(() => {
        const q = query(
            collection(db, 'categories'),
            orderBy('sortOrder', 'asc')
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const items: Category[] = snapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data()
                } as Category));
                setCategories(items);
                setLoading(false);
            },
            (err) => {
                console.error('Error fetching categories for management:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    const addCategory = async (data: Omit<Category, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            const trimmedName = data.name.trim();
            if (!trimmedName) {
                showToast('Category name is required', 'error');
                return null;
            }

            // Enforce unique slug across primary slugs AND oldSlugs
            const candidateSlug = (data.slug?.trim() || slugify(trimmedName)) || `category-${Date.now()}`;
            const uniqueness = isSlugUnique(candidateSlug, categories);
            if (!uniqueness.isAvailable) {
                showToast(uniqueness.conflictReason || 'Slug is already in use.', 'error');
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
     * Propagate a category's name to all its linked products in batches of <= 500.
     * Safe to re-run repeatedly (idempotent).
     */
    const repairNamePropagation = async (categoryId: string, targetName: string): Promise<number> => {
        const q = query(collection(db, 'products'), where('categoryId', '==', categoryId));
        const snap = await getDocs(q);

        let batch = writeBatch(db);
        let batchCount = 0;
        let totalUpdated = 0;

        for (const pDoc of snap.docs) {
            const currentCat = pDoc.data().category;
            if (currentCat !== targetName) {
                batch.update(doc(db, 'products', pDoc.id), {
                    category: targetName,
                    updated_at: new Date().toISOString()
                });
                batchCount++;
                totalUpdated++;

                if (batchCount >= 500) {
                    await batch.commit();
                    batch = writeBatch(db);
                    batchCount = 0;
                }
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        setPropagationFailedCategories(prev => prev.filter(c => c.id !== categoryId));
        return totalUpdated;
    };

    /**
     * Updates category.
     * - Preserves old slug in oldSlugs if explicitly changed.
     * - Checks slug uniqueness against current and old slugs.
     * - Propagates name to products in batches <= 500; flags failure for retry/repair.
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

            // 1. Slug handling
            if (data.slug && data.slug.trim() && data.slug.trim() !== currentCat.slug) {
                const newSlug = slugify(data.slug.trim());
                const uniqueness = isSlugUnique(newSlug, categories, id);
                if (!uniqueness.isAvailable) {
                    showToast(uniqueness.conflictReason || 'Slug conflict', 'error');
                    return false;
                }
                const oldSlugs = Array.from(new Set([...(currentCat.oldSlugs || []), currentCat.slug]));
                payload.slug = newSlug;
                payload.oldSlugs = oldSlugs;
            } else {
                delete payload.slug;
            }

            if (data.name) {
                payload.name = data.name.trim();
            }

            // Update category document first
            await updateDoc(doc(db, 'categories', id), payload);

            // 2. Propagate name to products
            if (data.name && data.name.trim() !== currentCat.name) {
                const newName = data.name.trim();
                try {
                    await repairNamePropagation(id, newName);
                } catch (propErr: any) {
                    console.error('Failed to propagate category name to products:', propErr);
                    setPropagationFailedCategories(prev => {
                        if (!prev.some(c => c.id === id)) {
                            return [...prev, { id, name: newName }];
                        }
                        return prev;
                    });
                    showToast('Category saved, but product name copy update failed. Click "Repair" to retry.', 'error');
                    return true;
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

    const checkCategoryDependencies = async (categoryId: string, categoryName: string) => {
        const childCategories = categories.filter(c => c.parentId === categoryId);
        const hasChildren = childCategories.length > 0;

        const qId = query(collection(db, 'products'), where('categoryId', '==', categoryId));
        const snapId = await getDocs(qId);

        const qName = query(collection(db, 'products'), where('category', '==', categoryName));
        const snapName = await getDocs(qName);

        const uniqueProductIds = new Set<string>();
        snapId.docs.forEach(d => uniqueProductIds.add(d.id));
        snapName.docs.forEach(d => uniqueProductIds.add(d.id));

        return {
            hasChildren,
            childCategories,
            productCount: uniqueProductIds.size,
            productIds: Array.from(uniqueProductIds)
        };
    };

    /**
     * Deletes category in strict sequential order:
     * 1. Reassign products in chunks of at most 500 writes.
     * 2. Verify zero products remain and no child categories exist.
     * 3. Delete the category document last.
     *
     * Note: This operation is chunked and resumable; it is not atomic across chunks,
     * so if interrupted, re-running will resume reassigning remaining products and
     * will only delete the category once the count check confirms 0 products.
     */
    const deleteCategory = async (category: Category, reassignTargetId?: string) => {
        if (!category.id) return false;

        try {
            const deps = await checkCategoryDependencies(category.id, category.name);

            if (deps.hasChildren) {
                showToast(`Cannot delete category "${category.name}": it has ${deps.childCategories.length} child category/categories. Reassign or delete children first.`, 'error');
                return false;
            }

            if (deps.productCount > 0 && !reassignTargetId) {
                showToast(`Cannot delete category "${category.name}": ${deps.productCount} product(s) still belong to it. Please reassign them first.`, 'error');
                return false;
            }

            // Step 1: Reassign products in chunks <= 500
            if (deps.productCount > 0 && reassignTargetId) {
                const targetCat = categories.find(c => c.id === reassignTargetId);
                if (!targetCat) {
                    showToast('Target reassignment category not found', 'error');
                    return false;
                }

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

            // Step 2: Final pre-delete verification check
            const finalCheck = await checkCategoryDependencies(category.id, category.name);
            if (finalCheck.hasChildren) {
                showToast(`Deletion blocked: child categories detected before final delete.`, 'error');
                return false;
            }
            if (finalCheck.productCount > 0) {
                showToast(`Deletion blocked: ${finalCheck.productCount} product(s) still remain linked to this category.`, 'error');
                return false;
            }

            // Step 3: Delete category last
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
            let count = 0;
            reorderedCategories.forEach((cat, index) => {
                if (cat.id) {
                    batch.update(doc(db, 'categories', cat.id), {
                        sortOrder: index + 1,
                        updated_at: new Date().toISOString()
                    });
                    count++;
                }
            });
            if (count > 0) {
                await batch.commit();
            }
            showToast('Category order saved', 'success');
        } catch (err: any) {
            console.error('Error reordering categories:', err);
            showToast('Failed to save category order', 'error');
        }
    };

    return {
        categories,
        loading,
        error,
        propagationFailedCategories,
        repairNamePropagation,
        addCategory,
        updateCategory,
        toggleActive,
        deleteCategory,
        reorderCategories,
        checkCategoryDependencies
    };
}
