import { collectionGroup, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface ProductFinancials {
    buyPrice: number;
    costPrice: number;
    supplierId?: string | null;
    supplierName?: string | null;
}

// Session-level memory cache for product financials
let sessionFinancialsCache: Map<string, ProductFinancials> | null = null;
let lastCacheTimestamp = 0;
const SESSION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour session TTL (invalidation on intake/update)

/**
 * Invalidate the session financials cache (e.g., after purchase intake or price updates)
 */
export function invalidateFinancialsCache() {
    sessionFinancialsCache = null;
    lastCacheTimestamp = 0;
}

/**
 * Efficiently loads financials for all products using a single collectionGroup query.
 * Cached in-memory for the session to prevent 3,000 reads on every screen open.
 * Returns a map of productId -> ProductFinancials.
 */
export async function fetchAllProductFinancials(forceRefresh = false): Promise<Map<string, ProductFinancials>> {
    if (!forceRefresh && sessionFinancialsCache && (Date.now() - lastCacheTimestamp < SESSION_CACHE_TTL_MS)) {
        return sessionFinancialsCache;
    }

    const financialsMap = new Map<string, ProductFinancials>();
    try {
        const snap = await getDocs(collectionGroup(db, 'privateData'));
        snap.forEach(d => {
            if (d.id === 'financials') {
                const parentProductId = d.ref.parent.parent?.id;
                if (parentProductId) {
                    const data = d.data();
                    financialsMap.set(parentProductId, {
                        buyPrice: data.buyPrice ?? data.costPrice ?? 0,
                        costPrice: data.costPrice ?? data.buyPrice ?? 0,
                        supplierId: data.supplierId ?? null,
                        supplierName: data.supplierName ?? null,
                    });
                }
            }
        });
        sessionFinancialsCache = financialsMap;
        lastCacheTimestamp = Date.now();
    } catch (err) {
        console.warn('[fetchAllProductFinancials] Failed to load collectionGroup privateData:', err);
    }
    return financialsMap;
}

/**
 * Loads financials for a single product from products/{productId}/privateData/financials
 */
export async function fetchProductFinancials(productId: string): Promise<ProductFinancials | null> {
    try {
        const snap = await getDoc(doc(db, 'products', productId, 'privateData', 'financials'));
        if (snap.exists()) {
            const data = snap.data();
            return {
                buyPrice: data.buyPrice ?? data.costPrice ?? 0,
                costPrice: data.costPrice ?? data.buyPrice ?? 0,
                supplierId: data.supplierId ?? null,
                supplierName: data.supplierName ?? null,
            };
        }
    } catch (err) {
        console.warn(`[fetchProductFinancials] Failed to read privateData for ${productId}:`, err);
    }
    return null;
}

/**
 * Writes or merges financial data into products/{productId}/privateData/financials
 */
export async function saveProductFinancials(productId: string, data: Partial<ProductFinancials>): Promise<void> {
    const finRef = doc(db, 'products', productId, 'privateData', 'financials');
    await setDoc(finRef, {
        ...data,
        updated_at: new Date().toISOString()
    }, { merge: true });
}
