import { BaseRepository } from './BaseRepository';
import {
  Customer,
  Product,
  Sale,
  Expense,
  CustomerPayment,
  User,
  Return,
  ReturnedItem,
  AuditLog,
  Supplier,
  Purchase,
  SupplierPayment,
  Category,
  Department,
  BankAccount,
  CashBookEntry
} from '../types';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export class CustomerRepository extends BaseRepository<Customer> {
  constructor() { super('customers'); }
}

export class ProductRepository extends BaseRepository<Product> {
  constructor() { super('products'); }

  public override async getById(id: string): Promise<Product | null> {
    const product = await super.getById(id);
    if (!product) return null;

    try {
      // Load financial/supplier data from subcollection products/{id}/privateData/financials
      const finDoc = await getDoc(doc(db, 'products', id, 'privateData', 'financials'));
      if (finDoc.exists()) {
        const finData = finDoc.data();
        return {
          ...product,
          buyPrice: finData.buyPrice !== undefined ? finData.buyPrice : product.buyPrice,
          costPrice: finData.costPrice !== undefined ? finData.costPrice : product.costPrice,
          supplierId: finData.supplierId || product.supplierId,
          supplierName: finData.supplierName || product.supplierName,
        };
      }
    } catch {
      // If access to privateData is restricted or offline, return base product
    }
    return product;
  }

  public override async create(item: Omit<Product, 'id' | 'deleted' | 'created_at' | 'updated_at'>): Promise<string> {
    const { buyPrice, costPrice, supplierId, supplierName, ...publicData } = item as any;
    const newId = await super.create(publicData as any);

    // Save financial/supplier fields in subcollection
    if (buyPrice !== undefined || costPrice !== undefined || supplierId || supplierName) {
      try {
        await setDoc(doc(db, 'products', newId, 'privateData', 'financials'), {
          buyPrice: buyPrice ?? 0,
          costPrice: costPrice ?? buyPrice ?? 0,
          supplierId: supplierId || null,
          supplierName: supplierName || null,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('[ProductRepository] Could not write privateData/financials:', err);
      }
    }

    return newId;
  }

  public override async update(id: string, updates: Partial<Product>): Promise<void> {
    const { buyPrice, costPrice, supplierId, supplierName, ...publicUpdates } = updates as any;
    if (Object.keys(publicUpdates).length > 0) {
      await super.update(id, publicUpdates as any);
    }

    if (buyPrice !== undefined || costPrice !== undefined || supplierId !== undefined || supplierName !== undefined) {
      try {
        const finUpdates: any = { updated_at: new Date().toISOString() };
        if (buyPrice !== undefined) finUpdates.buyPrice = buyPrice;
        if (costPrice !== undefined) finUpdates.costPrice = costPrice;
        if (supplierId !== undefined) finUpdates.supplierId = supplierId;
        if (supplierName !== undefined) finUpdates.supplierName = supplierName;
        await setDoc(doc(db, 'products', id, 'privateData', 'financials'), finUpdates, { merge: true });
      } catch (err) {
        console.warn('[ProductRepository] Could not update privateData/financials:', err);
      }
    }
  }
}

export class SaleRepository extends BaseRepository<Sale> {
  constructor() { super('sales'); }
}

export class ExpenseRepository extends BaseRepository<Expense> {
  constructor() { super('expenses'); }
}

export class CustomerPaymentRepository extends BaseRepository<CustomerPayment> {
  constructor() { super('customerPayments'); }
}

export class UserRepository extends BaseRepository<User> {
  constructor() { super('users'); }
}

export class ReturnRepository extends BaseRepository<Return> {
  constructor() { super('returns'); }
}

export class ReturnedItemRepository extends BaseRepository<ReturnedItem> {
  constructor() { super('returnedItems'); }
}

export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor() { super('auditLogs'); }
}

export class SupplierRepository extends BaseRepository<Supplier> {
  constructor() { super('suppliers'); }
}

export class PurchaseRepository extends BaseRepository<Purchase> {
  constructor() { super('purchases'); }
}

export class SupplierPaymentRepository extends BaseRepository<SupplierPayment> {
  constructor() { super('supplierPayments'); }
}

export class CategoryRepository extends BaseRepository<Category> {
  constructor() { super('categories'); }
}

export class DepartmentRepository extends BaseRepository<Department> {
  constructor() { super('departments'); }
}

export class BankAccountRepository extends BaseRepository<BankAccount> {
  constructor() { super('bankAccounts'); }
}

export class CashBookRepository extends BaseRepository<CashBookEntry> {
  constructor() { super('cashBook'); }
}

export const customersRepo = new CustomerRepository();
export const productsRepo = new ProductRepository();
export const salesRepo = new SaleRepository();
export const expensesRepo = new ExpenseRepository();
export const customerPaymentsRepo = new CustomerPaymentRepository();
export const usersRepo = new UserRepository();
export const returnsRepo = new ReturnRepository();
export const returnedItemsRepo = new ReturnedItemRepository();
export const auditLogsRepo = new AuditLogRepository();
export const suppliersRepo = new SupplierRepository();
export const purchasesRepo = new PurchaseRepository();
export const supplierPaymentsRepo = new SupplierPaymentRepository();
export const categoriesRepo = new CategoryRepository();
export const departmentsRepo = new DepartmentRepository();
export const bankAccountsRepo = new BankAccountRepository();
export const cashBookRepo = new CashBookRepository();
