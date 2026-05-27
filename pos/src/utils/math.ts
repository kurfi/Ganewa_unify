/**
 * Rounds a number to exactly 2 decimal places.
 * This is used throughout the application to ensure consistent financial calculations.
 * 
 * @param num The number to round
 * @returns The number rounded to 2 decimal places
 */
export function roundTo2(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}
