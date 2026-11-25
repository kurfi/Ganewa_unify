import type { Category } from '../types';

export function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

export function isSlugUnique(
    candidateSlug: string,
    existingCategories: Category[],
    currentCategoryId?: string
): { isAvailable: boolean; conflictReason?: string } {
    const normalized = candidateSlug.trim().toLowerCase();
    if (!normalized) {
        return { isAvailable: false, conflictReason: 'Slug cannot be empty' };
    }

    for (const cat of existingCategories) {
        if (currentCategoryId && cat.id === currentCategoryId) {
            continue;
        }

        if ((cat.slug || '').toLowerCase() === normalized) {
            return {
                isAvailable: false,
                conflictReason: `Slug "${normalized}" is already used as current slug by category "${cat.name}"`
            };
        }

        if (Array.isArray(cat.oldSlugs)) {
            const hasOldSlug = cat.oldSlugs.some(s => (s || '').toLowerCase() === normalized);
            if (hasOldSlug) {
                return {
                    isAvailable: false,
                    conflictReason: `Slug "${normalized}" is reserved as a historical redirect for category "${cat.name}"`
                };
            }
        }
    }

    return { isAvailable: true };
}

export function resolveCategoryBySlug(
    slug: string,
    categories: Category[]
): { category: Category | null; isRedirect: boolean; targetSlug: string | null } {
    const normalized = (slug || '').trim().toLowerCase();
    if (!normalized) {
        return { category: null, isRedirect: false, targetSlug: null };
    }

    const directMatch = categories.find(c => (c.slug || '').toLowerCase() === normalized);
    if (directMatch) {
        return { category: directMatch, isRedirect: false, targetSlug: directMatch.slug };
    }

    const redirectMatch = categories.find(c =>
        Array.isArray(c.oldSlugs) && c.oldSlugs.some(s => (s || '').toLowerCase() === normalized)
    );
    if (redirectMatch) {
        return { category: redirectMatch, isRedirect: true, targetSlug: redirectMatch.slug };
    }

    return { category: null, isRedirect: false, targetSlug: null };
}
