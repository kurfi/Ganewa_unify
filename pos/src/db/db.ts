import Dexie, { Table } from 'dexie';
import { isSyncingFromFirestore } from '../services/firestoreSync';
import {
  Customer,
  Product,
  Sale,
  Expense,
  Setting,
  CustomerPayment,
  User,
  UserRole,
  Return,
  ReturnedItem,
  AuditLog,
  SyncEntry,
  Supplier,
  Purchase,
  SupplierPayment,
  Department,
  BankAccount,
  CashBookEntry
} from '../types';
import { v4 as uuidv4 } from 'uuid';

class GanewaProvisionDB extends Dexie {
  customers!: Table<Customer, string>;
  products!: Table<Product, string>;
  sales!: Table<Sale, string>;
  expenses!: Table<Expense, string>;
  settings!: Table<Setting, string>;
  customerPayments!: Table<CustomerPayment, string>;
  users!: Table<User, string>;
  returns!: Table<Return, string>;
  returnedItems!: Table<ReturnedItem, string>;
  auditLogs!: Table<AuditLog, string>;
  syncQueue!: Table<SyncEntry, number>;

  // New tables
  suppliers!: Table<Supplier, string>;
  purchases!: Table<Purchase, string>;
  supplierPayments!: Table<SupplierPayment, string>;
  departments!: Table<Department, string>;
  bankAccounts!: Table<BankAccount, string>;
  cashBook!: Table<CashBookEntry, string>;

  constructor() {
    super('GanewaProvisionDB_v1');

    this.version(1).stores({
      customers: 'id, name, phone, currentDebt, updated_at',
      products: 'id, name, category, department, updated_at',
      sales: 'id, customerId, date, paymentMethod, status, department, updated_at',
      expenses: 'id, date, category, department, updated_at',
      settings: '&key',
      customerPayments: 'id, customerId, date, updated_at',
      users: 'id, username, role, updated_at',
      returns: 'id, saleId, customerId, returnDate, updated_at',
      returnedItems: 'id, returnId, productId, updated_at',
      auditLogs: 'id, action, user, timestamp, updated_at',
      syncQueue: '++id, table_name, doc_id, action, status, timestamp',

      suppliers: 'id, companyName, contactName, phone, updated_at',
      purchases: 'id, invoiceNo, supplierId, date, status, updated_at',
      departments: 'id, name, updated_at',
      bankAccounts: 'id, accountNo, bankName, updated_at',
      cashBook: 'id, date, updated_at',
      supplierPayments: 'id, supplierId, date, updated_at, synced'
    });

    // v2: add `synced` index to all syncable tables so syncManager can
    // efficiently query WHERE synced = 0 (pending) or synced = 1 (done)
    this.version(2).stores({
      customers: 'id, name, phone, currentDebt, updated_at, synced',
      products: 'id, name, category, department, updated_at, synced',
      sales: 'id, customerId, date, paymentMethod, status, department, updated_at, synced',
      expenses: 'id, date, category, department, updated_at, synced',
      customerPayments: 'id, customerId, date, updated_at, synced',
      users: 'id, username, role, updated_at, synced',
      returns: 'id, saleId, customerId, returnDate, updated_at, synced',
      returnedItems: 'id, returnId, productId, updated_at, synced',
      auditLogs: 'id, action, user, timestamp, updated_at',
      syncQueue: '++id, table_name, doc_id, action, status, timestamp',
      suppliers: 'id, companyName, contactName, phone, updated_at, synced',
      purchases: 'id, invoiceNo, supplierId, date, status, updated_at, synced',
      departments: 'id, name, updated_at, synced',
      bankAccounts: 'id, accountNo, bankName, updated_at, synced',
      cashBook: 'id, date, updated_at, synced'
    });

    this.version(3).stores({
      sales: 'id, customerId, date, paymentMethod, status, department, updated_at, synced, invoiceNo, customerName'
    });

    this.version(4).stores({
      customers: 'id, name, phone, currentDebt, updated_at, synced',
      products: 'id, name, category, department, updated_at, synced',
      sales: 'id, customerId, date, paymentMethod, status, department, updated_at, synced, invoiceNo, customerName',
      expenses: 'id, date, category, department, updated_at, synced, paymentMethod',
      customerPayments: 'id, customerId, date, updated_at, synced',
      users: 'id, username, role, updated_at, synced',
      returns: 'id, saleId, customerId, returnDate, updated_at, synced',
      returnedItems: 'id, returnId, productId, updated_at, synced',
      auditLogs: 'id, action, user, timestamp, updated_at',
      syncQueue: '++id, table_name, doc_id, action, status, timestamp',
      suppliers: 'id, companyName, contactName, phone, updated_at, synced',
      purchases: 'id, invoiceNo, supplierId, date, status, updated_at, synced',
      supplierPayments: 'id, supplierId, date, paymentMethod, updated_at, synced',
      departments: 'id, name, updated_at, synced',
      bankAccounts: 'id, accountNo, bankName, updated_at, synced',
      cashBook: 'id, date, updated_at, synced'
    });

    const dbInstance = this;
    const syncableTableNames = [
      'customers', 'products', 'sales', 'expenses',
      'customerPayments', 'users', 'returns', 'returnedItems',
      'suppliers', 'purchases', 'supplierPayments', 'departments', 'bankAccounts', 'cashBook'
    ];

    // Hook to generate UUIDs for new items
    syncableTableNames.forEach(tableName => {
      const table = this.table(tableName);

      table.hook('creating', function (primKey, obj, transaction) {
        // IMPORTANT: In Dexie, you must RETURN the new key from the hook
        // to override the primary key. Using this.onsuccess does NOT set the key.
        let resolvedId: string;
        if (!primKey) {
          resolvedId = uuidv4();
          obj.id = resolvedId;
        } else {
          resolvedId = primKey as string;
          obj.id = resolvedId;
        }

        obj.created_at = new Date().toISOString();
        obj.updated_at = new Date().toISOString();
        // Mark as unsynced by default; syncManager will flip to 1 after Firestore write
        if (obj.synced === undefined) obj.synced = 0;

        // Add to sync queue (skip if data is coming FROM Firestore)
        if (!isSyncingFromFirestore()) {
          const syncEntry: SyncEntry = {
            table_name: tableName,
            doc_id: resolvedId,
            action: 'create',
            payload: { ...obj },
            timestamp: new Date(),
            status: 'pending'
          };

          setTimeout(() => {
            Dexie.ignoreTransaction(async () => {
              await dbInstance.syncQueue.add(syncEntry);
            });
          }, 0);
        }

        // Return the key so Dexie uses it as the primary key
        return resolvedId;
      });

      table.hook('updating', function (modifications, primKey, obj, transaction) {
        // When data is flowing FROM Firestore → Dexie, preserve the original
        // timestamps. Stamping updated_at=NOW here would make the local copy
        // appear newer than Firestore, causing a subtle re-sync loop.
        if (isSyncingFromFirestore()) {
          return modifications; // Pass through unchanged, do NOT add to queue
        }

        const updates = { ...modifications, updated_at: new Date().toISOString() };

        const syncEntry: SyncEntry = {
          table_name: tableName,
          doc_id: primKey as string,
          action: 'update',
          payload: updates,
          timestamp: new Date(),
          status: 'pending'
        };

        setTimeout(() => {
          Dexie.ignoreTransaction(async () => {
            await dbInstance.syncQueue.add(syncEntry);
          });
        }, 0);

        return updates;
      });

      table.hook('deleting', function (primKey, obj, transaction) {
        if (!isSyncingFromFirestore()) {
          const syncEntry: SyncEntry = {
            table_name: tableName,
            doc_id: primKey as string,
            action: 'delete',
            payload: { id: primKey },
            timestamp: new Date(),
            status: 'pending'
          };

          setTimeout(() => {
            Dexie.ignoreTransaction(async () => {
              await dbInstance.syncQueue.add(syncEntry);
            });
          }, 0);
        }
      });
    });
  }
}

export const db = new GanewaProvisionDB();

// Helper for Audit Logging
export const logAudit = async (action: string, details: string, user: string) => {
  try {
    await db.auditLogs.add({
      id: uuidv4(),
      action,
      details,
      user,
      timestamp: new Date(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to log audit:", error);
  }
};

export const clearAuditLogs = async () => {
  try {
    await db.auditLogs.clear();
  } catch (error) {
    console.error("Failed to clear audit logs:", error);
    throw error;
  }
};


// Reset database - gated in production to prevent accidental data loss
export const resetDatabase = async (userRole?: UserRole) => {
  if (import.meta.env.PROD) {
    if (!userRole || (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN)) {
      throw new Error('Unauthorized: Database reset is restricted to Administrators in production.');
    }
  }

  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
};

// Helper functions for Returns.tsx
export const addReturn = async (data: Omit<Return, 'id'>) => {
  return await db.returns.add(data as Return);
};

export const addReturnedItem = async (data: Omit<ReturnedItem, 'id'>) => {
  return await db.returnedItems.add(data as ReturnedItem);
};

export const updateProduct = async (id: string, updates: Partial<Product>) => {
  return await db.products.update(id, updates);
};


export const updateCustomer = async (id: string, updates: Partial<Customer>) => {
  return await db.customers.update(id, updates);
};

export const deleteCustomer = async (id: string) => {
  return await db.customers.delete(id);
};

