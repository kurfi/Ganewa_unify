import { describe, it, expect } from 'vitest';
import { slugify, isSlugUnique, resolveCategoryBySlug } from '../utils/slugify';
import { Category } from '../types';

describe('slugify and slug redirect/uniqueness tests', () => {
    const mockCategories: Category[] = [
        {
            id: 'cat-1',
            name: 'Beverages',
            slug: 'beverages',
            oldSlugs: ['drinks', 'cold-drinks'],
            active: true,
            sortOrder: 1
        },
        {
            id: 'cat-2',
            name: 'Snacks & Biscuits',
            slug: 'snacks-biscuits',
            oldSlugs: ['biscuit', 'cookies'],
            active: true,
            sortOrder: 2
        }
    ];

    it('generates URL safe slug', () => {
        expect(slugify('Other / Miscellaneous')).toBe('other-miscellaneous');
        expect(slugify('Grains, Noodles & Staples')).toBe('grains-noodles-staples');
    });

    it('rejects candidate slug if it matches an existing primary slug', () => {
        const res = isSlugUnique('beverages', mockCategories);
        expect(res.isAvailable).toBe(false);
        expect(res.conflictReason).toContain('already used as current slug');
    });

    it('rejects candidate slug if it matches any category oldSlugs', () => {
        const res = isSlugUnique('cold-drinks', mockCategories);
        expect(res.isAvailable).toBe(false);
        expect(res.conflictReason).toContain('reserved as a historical redirect');
    });

    it('allows same slug when updating the category that owns it', () => {
        const res = isSlugUnique('beverages', mockCategories, 'cat-1');
        expect(res.isAvailable).toBe(true);
    });

    it('allows brand new unique slug', () => {
        const res = isSlugUnique('fresh-produce', mockCategories);
        expect(res.isAvailable).toBe(true);
    });

    it('resolves direct category by primary slug', () => {
        const result = resolveCategoryBySlug('beverages', mockCategories);
        expect(result.category).not.toBeNull();
        expect(result.category?.id).toBe('cat-1');
        expect(result.isRedirect).toBe(false);
        expect(result.targetSlug).toBe('beverages');
    });

    it('resolves category by oldSlugs and signals a redirect to targetSlug', () => {
        const result = resolveCategoryBySlug('drinks', mockCategories);
        expect(result.category).not.toBeNull();
        expect(result.category?.id).toBe('cat-1');
        expect(result.isRedirect).toBe(true);
        expect(result.targetSlug).toBe('beverages');
    });

    it('returns null for unknown slug', () => {
        const result = resolveCategoryBySlug('non-existent', mockCategories);
        expect(result.category).toBeNull();
        expect(result.isRedirect).toBe(false);
    });
});
