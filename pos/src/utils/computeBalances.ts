import { db } from '../db/db';
import { PaymentMethod } from '../types';
import { roundTo2 } from './math';

const CASH_METHODS = [PaymentMethod.CASH];
const BANK_METHODS = [PaymentMethod.TRANSFER, PaymentMethod.CARD];

const sumMethodFromSales = (sales: any[], methods: PaymentMethod[]) =>
    sales.reduce((acc, sale) => {
        if (sale.paymentMethods?.length) {
            return acc + sale.paymentMethods
                .filter((m: any) => methods.includes(m.method))
                .reduce((s: number, m: any) => s + (m.amount || 0), 0);
        }
        return acc + (methods.includes(sale.paymentMethod) ? (sale.finalAmount || 0) : 0);
    }, 0);

export const computeBalances = async (): Promise<{
    cashAtHand: number;
    moneyInBank: number;
}> => {
    const [
        allCompletedSales,
        allCustomerPayments,
        allPaidExpenses,
        allReturns,
        allSupplierPayments,
    ] = await Promise.all([
        db.sales.where('status').equals('COMPLETED').toArray(),
        db.customerPayments.toArray(),
        db.expenses.filter(e => e.status === 'PAID' || !e.status).toArray(),
        db.returns.toArray(),
        db.table('supplierPayments').toArray().catch(() => []), // safe fallback if table not yet migrated
    ]);

    const cashFromSales    = sumMethodFromSales(allCompletedSales, CASH_METHODS);
    const bankFromSales    = sumMethodFromSales(allCompletedSales, BANK_METHODS);

    const cashRepayments   = allCustomerPayments.filter(p => CASH_METHODS.includes(p.paymentMethod)).reduce((a, p) => a + (p.amount || 0), 0);
    const bankRepayments   = allCustomerPayments.filter(p => BANK_METHODS.includes(p.paymentMethod)).reduce((a, p) => a + (p.amount || 0), 0);

    const cashRefunds      = allReturns.filter(r => CASH_METHODS.includes(r.paymentMethod)).reduce((a, r) => a + (r.totalRefundAmount || 0), 0);
    const bankRefunds      = allReturns.filter(r => BANK_METHODS.includes(r.paymentMethod)).reduce((a, r) => a + (r.totalRefundAmount || 0), 0);

    // Expenses split by payment method — legacy records with no paymentMethod default to CASH
    const cashExpenses     = allPaidExpenses.filter(e => !e.paymentMethod || CASH_METHODS.includes(e.paymentMethod)).reduce((a, e) => a + (e.amount || 0), 0);
    const bankExpenses     = allPaidExpenses.filter(e => e.paymentMethod && BANK_METHODS.includes(e.paymentMethod)).reduce((a, e) => a + (e.amount || 0), 0);

    const cashSupplierPaid = allSupplierPayments.filter((p: any) => CASH_METHODS.includes(p.paymentMethod)).reduce((a: number, p: any) => a + (p.amount || 0), 0);
    const bankSupplierPaid = allSupplierPayments.filter((p: any) => BANK_METHODS.includes(p.paymentMethod)).reduce((a: number, p: any) => a + (p.amount || 0), 0);

    return {
        cashAtHand:  roundTo2(cashFromSales  + cashRepayments - cashExpenses - cashRefunds - cashSupplierPaid),
        moneyInBank: roundTo2(bankFromSales  + bankRepayments - bankExpenses - bankRefunds - bankSupplierPaid),
    };
};
