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
  Department,
  BankAccount,
  CashBookEntry
} from '../types';

export class CustomerRepository extends BaseRepository<Customer> {
  constructor() { super('customers'); }
}

export class ProductRepository extends BaseRepository<Product> {
  constructor() { super('products'); }
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
export const departmentsRepo = new DepartmentRepository();
export const bankAccountsRepo = new BankAccountRepository();
export const cashBookRepo = new CashBookRepository();
