import { describe, it, expect } from 'vitest';

/**
 * Money and decimal rounding utilities
 */
export function roundTo2(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Computes checkout totals given cart items, tax rate, and discount
 */
export function calculateCheckoutTotals(
    items: Array<{ price: number; quantity: number }>,
    discountPercent = 0,
    taxRate = 0
): { subtotal: number; discountAmount: number; taxAmount: number; total: number } {
    const rawSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const subtotal = roundTo2(rawSubtotal);
    const discountAmount = roundTo2(subtotal * (discountPercent / 100));
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxAmount = roundTo2(taxableAmount * (taxRate / 100));
    const total = roundTo2(taxableAmount + taxAmount);

    return { subtotal, discountAmount, taxAmount, total };
}

/**
 * Computes remaining customer balance and validates credit limit
 */
export function computeCreditEligibility(
    creditLimit: number,
    currentDebt: number,
    newCharge: number
): { isEligible: boolean; availableCredit: number; projectedDebt: number } {
    const availableCredit = Math.max(0, creditLimit - currentDebt);
    const projectedDebt = roundTo2(currentDebt + newCharge);
    const isEligible = projectedDebt <= creditLimit && availableCredit >= newCharge;

    return { isEligible, availableCredit, projectedDebt };
}

/**
 * Computes return refund calculation
 */
export function computeRefund(
    itemsToReturn: Array<{ unitPrice: number; quantity: number }>,
    restockingFeePercent = 0
): { grossRefund: number; feeAmount: number; netRefund: number } {
    const gross = itemsToReturn.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const grossRefund = roundTo2(gross);
    const feeAmount = roundTo2(grossRefund * (restockingFeePercent / 100));
    const netRefund = roundTo2(grossRefund - feeAmount);

    return { grossRefund, feeAmount, netRefund };
}

describe('Money Math & Decimal Rounding', () => {
    it('accurately rounds floating point numbers to 2 decimal places without drift', () => {
        expect(roundTo2(0.1 + 0.2)).toBe(0.3);
        expect(roundTo2(10.005)).toBe(10.01);
        expect(roundTo2(1.004)).toBe(1.0);
        expect(roundTo2(1234.567)).toBe(1234.57);
    });
});

describe('Checkout Totals Calculation', () => {
    it('calculates clean subtotal and total for standard items', () => {
        const items = [
            { price: 1500, quantity: 2 },
            { price: 350.5, quantity: 4 }
        ];
        const res = calculateCheckoutTotals(items, 0, 0);
        expect(res.subtotal).toBe(4402);
        expect(res.discountAmount).toBe(0);
        expect(res.total).toBe(4402);
    });

    it('correctly deducts percentage discount and applies tax', () => {
        const items = [{ price: 1000, quantity: 1 }];
        const res = calculateCheckoutTotals(items, 10, 7.5);
        expect(res.subtotal).toBe(1000);
        expect(res.discountAmount).toBe(100);
        expect(res.taxAmount).toBe(67.5);
        expect(res.total).toBe(967.5);
    });
});

describe('Customer Credit & Debt Calculation', () => {
    it('allows credit checkout when within credit limit', () => {
        const res = computeCreditEligibility(50000, 20000, 15000);
        expect(res.isEligible).toBe(true);
        expect(res.availableCredit).toBe(30000);
        expect(res.projectedDebt).toBe(35000);
    });

    it('rejects credit checkout when exceeding limit', () => {
        const res = computeCreditEligibility(50000, 45000, 10000);
        expect(res.isEligible).toBe(false);
        expect(res.availableCredit).toBe(5000);
        expect(res.projectedDebt).toBe(55000);
    });
});

describe('Returns & Refund Logic', () => {
    it('calculates full refund without restocking fees', () => {
        const returned = [
            { unitPrice: 2500, quantity: 2 },
            { unitPrice: 1200, quantity: 1 }
        ];
        const res = computeRefund(returned, 0);
        expect(res.grossRefund).toBe(6200);
        expect(res.feeAmount).toBe(0);
        expect(res.netRefund).toBe(6200);
    });

    it('deducts restocking fee correctly', () => {
        const returned = [{ unitPrice: 10000, quantity: 1 }];
        const res = computeRefund(returned, 5);
        expect(res.grossRefund).toBe(10000);
        expect(res.feeAmount).toBe(500);
        expect(res.netRefund).toBe(9500);
    });
});
