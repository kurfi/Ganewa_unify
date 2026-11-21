/**
 * invoiceNumberService.ts
 *
 * Thin client wrapper around the `getNextInvoiceNumber` Cloud Function.
 * Call `fetchNextInvoiceNo()` wherever an atomic, collision-free invoice
 * number is needed (held sales, completed checkouts).
 */
import { getFunctions, httpsCallable } from 'firebase/functions';

// Re-use the same Firebase app that config.ts already initialised.
// getFunctions() with no arguments picks up the default app.
const functions = getFunctions(undefined, 'us-central1');

interface InvoiceNumberResult {
    invoiceNo: string; // e.g. "INV-000123"
    number: number;    // raw counter value, e.g. 123
}

const _getNextInvoiceNumberFn = httpsCallable<void, InvoiceNumberResult>(
    functions,
    'getNextInvoiceNumber'
);

/**
 * Calls the Cloud Function to atomically issue the next invoice number.
 *
 * @throws If the user is not authenticated or the function call fails.
 * @returns A promise that resolves to the formatted invoice string, e.g. "INV-000042".
 */
export async function fetchNextInvoiceNo(): Promise<string> {
    console.log('[InvoiceService] Requesting next invoice number from Cloud Functions…');
    const result = await _getNextInvoiceNumberFn();
    const { invoiceNo, number } = result.data;
    console.log(`[InvoiceService] Received invoice number: ${invoiceNo} (counter=${number})`);
    return invoiceNo;
}
