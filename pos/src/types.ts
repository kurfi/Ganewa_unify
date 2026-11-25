export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  CREDIT = 'CREDIT', // Store credit/Debt
  STORE_CREDIT = 'STORE_CREDIT', // For returns
  MULTIPAY = 'MULTIPAY'
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  HELD = 'HELD',
  CANCELLED = 'CANCELLED'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  CASHIER = 'CASHIER'
}

export enum ReturnReason {
  DEFECTIVE = 'Defective Item',
  WRONG_ITEM = 'Wrong Item Shipped',
  CUSTOMER_CHANGED_MIND = 'Customer Changed Mind',
  SIZE_ISSUE = 'Size Issue',
  DAMAGED_IN_TRANSIT = 'Damaged in Transit',
  OTHER = 'Other'
}

// --- Specific Interfaces ---

export interface Setting {
  key: string;
  value: any;
}

export interface User {
  id?: string;
  username: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  password?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface Customer {
  id?: string;
  name: string;
  nameLower?: string;
  phone: string;
  email?: string;
  address?: string;
  creditLimit: number;
  currentDebt: number;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface DiscountTier {
  name: string;
  minQuantity: number;
  pricePerUnit: number;
}

export interface Product {
  id?: string;
  name: string;
  nameLower?: string;
  categoryId?: string;       // Source of truth for product-to-category link
  category: string;         // Display/search copy of category name
  barcode?: string;          // Optional EAN/UPC/QR barcode string for scanner lookup
  buyPrice: number; // Cost price
  costPrice?: number;
  supplierId?: string;
  supplierName?: string;
  sellPrice: number; // Retail price
  wholesalePrice?: number;
  quantity: number;
  minStockLevel: number;
  department?: string;
  photo?: string;
  onlineDiscountTiers?: DiscountTier[];
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
  stockValue?: number;
}


export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  costPrice?: number;
  returnedQuantity?: number;
  stockAtAddition?: number;
}

export interface Sale {
  id?: string;
  customerId?: string;
  customerName?: string;
  date: Date;
  items: SaleItem[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: PaymentMethod;
  paymentMethods?: { method: PaymentMethod; amount: number }[];
  status: SaleStatus;
  department?: string;
  cashier?: string; // Username
  invoiceNo?: string;
  source?: 'pos' | 'online'; // Track whether sale originated from POS or online order fulfillment
  onlineOrderId?: string;   // Reference to the original online order ID (e.g. GW-XXXXXX)
  debtInfo?: {
    previousDebt: number;
    thisSaleDebt: number;
    newDebt: number;
    creditLimit: number;
  };
  amountPaid?: number;
  changeDue?: number;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface CustomerPayment {
  id?: string;
  customerId: string;
  customerName?: string;
  date: Date;
  amount: number;
  paymentMethod: PaymentMethod;
  note?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface Expense {
  id?: string;
  date: Date;
  category: string;
  amount: number;
  department?: string;
  note: string;
  status: 'PAID' | 'PENDING';
  paymentMethod?: PaymentMethod; // CASH, TRANSFER, or CARD — undefined = legacy, treat as CASH
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

// --- New Entities for Provision Store ---

export interface Supplier {
  id?: string;
  companyName: string;
  nameLower?: string;
  contactName: string;
  phone: string;
  address: string;
  email?: string;
  balance?: number;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  total: number;
}

export interface Purchase {
  id?: string;
  invoiceNo: string;
  supplierId: string;
  supplierName: string;
  supplierNameLower?: string;
  invoiceNoLower?: string;
  date: Date;
  items: PurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface SupplierPayment {
  id?: string;
  supplierId: string;
  supplierName: string;
  /** Set when this payment was created alongside a specific purchase (via NewPurchaseModal) */
  purchaseId?: string;
  date: Date;
  amount: number;
  paymentMethod: PaymentMethod;
  note?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface Category {
  id?: string;
  name: string;
  slug: string;
  oldSlugs?: string[];       // Previous slugs preserved for URL redirect / SEO stability
  parentId?: string;
  sortOrder: number;
  active: boolean;
  image?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface Department {
  id?: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface BankAccount {
  id?: string;
  accountNo: string;
  accountName: string;
  bankName: string;
  branchName?: string;
  balance: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface CashBookEntry {
  id?: string;
  date: Date;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  department?: string;
  invoiceNo?: string;
  username: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

// --- Returns & Audit ---

export interface Return {
  id?: string;
  saleId: string; // Changed to string
  customerId?: string;
  customerName?: string;
  staffId?: string;
  returnDate: Date;
  totalRefundAmount: number;
  reason: ReturnReason;
  paymentMethod: PaymentMethod;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface ReturnedItem {
  id?: string;
  returnId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  refundAmount: number;
  restockStatus: 'restocked' | 'damaged';
  valueLost?: number;
  returnDate?: Date;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface AuditLog {
  id?: string;
  action: string;
  details: string;
  user: string;
  timestamp: Date;
  created_at?: string;
  updated_at?: string;
  version?: number;
  deviceId?: string;
  deleted?: boolean;
}

export interface StockWriteOff {
  id?: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: 'expired';
  costImpact: number;
  note?: string;
  staffId: string;
  staffName: string;
  date: Date;
  created_at?: string;
  updated_at?: string;
  deleted?: boolean;
}

export interface SyncEntry {
  id?: number;
  table: string;
  recordId: string;
  operation: 'create' | 'update' | 'delete';
  status: 'pending' | 'processing' | 'failed';
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  deviceId: string;
  error?: string;
}

export interface SyncMetric {
  id?: number;
  timestamp: Date;
  bytesUploaded: number;
  itemsSynced: number;
  latencyMs: number;
  errorCount: number;
}

export interface SyncConflict {
  id?: number;
  table: string;
  recordId: string;
  localData: any;
  remoteData: any;
  resolvedInFavorOf: 'local' | 'remote';
  timestamp: Date;
}

export interface SyncLog {
  id?: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
  timestamp: Date;
}

