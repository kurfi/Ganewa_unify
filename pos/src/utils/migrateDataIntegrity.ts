import {
  salesRepo,
  expensesRepo,
  customerPaymentsRepo,
  supplierPaymentsRepo
} from '../repositories';
import { PaymentMethod, SaleStatus } from '../types';

export interface MigrationReport {
  salesFixed: number;
  expensesFixed: number;
  customerPaymentsFixed: number;
  supplierPaymentsFixed: number;
  errors: string[];
}

function normalizeSaleStatus(raw: any): SaleStatus | null {
  if (!raw) return SaleStatus.COMPLETED;
  const upper = String(raw).toUpperCase().trim();
  if (upper === 'COMPLETED') return raw === SaleStatus.COMPLETED ? null : SaleStatus.COMPLETED;
  if (upper === 'HELD')      return raw === SaleStatus.HELD      ? null : SaleStatus.HELD;
  if (upper === 'CANCELLED') return raw === SaleStatus.CANCELLED ? null : SaleStatus.CANCELLED;
  return null;
}

function normalizePaymentMethod(raw: any, defaultValue: PaymentMethod = PaymentMethod.CASH): PaymentMethod | null {
  if (!raw) return defaultValue;
  const upper = String(raw).toUpperCase().trim();
  if (upper === 'CASH')         return raw === PaymentMethod.CASH         ? null : PaymentMethod.CASH;
  if (upper === 'CARD')         return raw === PaymentMethod.CARD         ? null : PaymentMethod.CARD;
  if (upper === 'TRANSFER')     return raw === PaymentMethod.TRANSFER     ? null : PaymentMethod.TRANSFER;
  if (upper === 'CREDIT')       return raw === PaymentMethod.CREDIT       ? null : PaymentMethod.CREDIT;
  if (upper === 'STORE_CREDIT') return raw === PaymentMethod.STORE_CREDIT ? null : PaymentMethod.STORE_CREDIT;
  if (upper === 'MULTIPAY')     return raw === PaymentMethod.MULTIPAY     ? null : PaymentMethod.MULTIPAY;
  return null;
}

export async function runDataIntegrityMigration(): Promise<MigrationReport> {
  const report: MigrationReport = {
    salesFixed: 0,
    expensesFixed: 0,
    customerPaymentsFixed: 0,
    supplierPaymentsFixed: 0,
    errors: [],
  };

  // 1. Fix Sales
  try {
    const allSales = await salesRepo.getAll();
    for (const sale of allSales) {
      if (!sale.id) continue;
      const updates: Partial<typeof sale> = {};

      const fixedStatus = normalizeSaleStatus(sale.status);
      if (fixedStatus !== null) updates.status = fixedStatus;

      const fixedPM = normalizePaymentMethod(sale.paymentMethod);
      if (fixedPM !== null) updates.paymentMethod = fixedPM;

      if (sale.paymentMethods?.length) {
        let pmArrayDirty = false;
        const fixedPMArray = sale.paymentMethods.map((pm: any) => {
          const fixed = normalizePaymentMethod(pm.method);
          if (fixed !== null) {
            pmArrayDirty = true;
            return { ...pm, method: fixed };
          }
          return pm;
        });
        if (pmArrayDirty) updates.paymentMethods = fixedPMArray;
      }

      if (Object.keys(updates).length > 0) {
        await salesRepo.update(sale.id, updates);
        report.salesFixed++;
      }
    }
  } catch (err: any) {
    report.errors.push(`Sales migration failed: ${err?.message || err}`);
  }

  // 2. Fix Expenses
  try {
    const allExpenses = await expensesRepo.getAll();
    for (const expense of allExpenses) {
      if (!expense.id) continue;
      const updates: Partial<typeof expense> = {};

      if (!expense.status) {
        updates.status = 'PAID';
      } else {
        const upper = String(expense.status).toUpperCase().trim();
        if (upper === 'PAID' && expense.status !== 'PAID') updates.status = 'PAID';
        if (upper === 'PENDING' && expense.status !== 'PENDING') updates.status = 'PENDING';
      }

      const resolvedStatus = (updates.status ?? expense.status ?? 'PAID');
      if (resolvedStatus === 'PAID') {
        const fixedPM = normalizePaymentMethod(expense.paymentMethod);
        if (fixedPM !== null) updates.paymentMethod = fixedPM;
      }

      if (Object.keys(updates).length > 0) {
        await expensesRepo.update(expense.id, updates);
        report.expensesFixed++;
      }
    }
  } catch (err: any) {
    report.errors.push(`Expenses migration failed: ${err?.message || err}`);
  }

  // 3. Fix CustomerPayments
  try {
    const allCPs = await customerPaymentsRepo.getAll();
    for (const cp of allCPs) {
      if (!cp.id) continue;
      const fixedPM = normalizePaymentMethod(cp.paymentMethod);
      if (fixedPM !== null) {
        await customerPaymentsRepo.update(cp.id, { paymentMethod: fixedPM });
        report.customerPaymentsFixed++;
      }
    }
  } catch (err: any) {
    report.errors.push(`CustomerPayments migration failed: ${err?.message || err}`);
  }

  // 4. Fix SupplierPayments
  try {
    const allSPs = await supplierPaymentsRepo.getAll();
    for (const sp of allSPs) {
      if (!sp.id) continue;
      const fixedPM = normalizePaymentMethod((sp as any).paymentMethod);
      if (fixedPM !== null) {
        await supplierPaymentsRepo.update(sp.id, { paymentMethod: fixedPM });
        report.supplierPaymentsFixed++;
      }
    }
  } catch (err: any) {
    report.errors.push(`SupplierPayments migration failed: ${err?.message || err}`);
  }

  console.log('[DataMigration] Report:', report);
  return report;
}
