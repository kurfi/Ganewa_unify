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
    created_at?: string;
    updated_at?: string;
}

export interface Customer {
    id?: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    creditLimit: number;
    currentDebt: number;
    created_at?: string;
    updated_at?: string;
}

export interface Product {
    id?: string;
    name: string;
    barcode: string;
    category: string;
    buyPrice: number; // Cost price
    sellPrice: number; // Retail price
    wholesalePrice?: number;
    quantity: number;
    minStockLevel: number;
    department?: string;
    brand?: string;
    unitOfMeasure?: string;
    unitPack?: string;
    supplierId?: string;
    supplierName?: string;
    photo?: string;
    created_at?: string;
    updated_at?: string;
}


export interface SaleItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
    costPrice?: number;
    returnedQuantity?: number;
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
    created_at?: string;
    updated_at?: string;
}

export interface CustomerPayment {
    id?: string;
    customerId: string;
    date: Date;
    amount: number;
    paymentMethod: PaymentMethod;
    note?: string;
    created_at?: string;
    updated_at?: string;
}

export interface Expense {
    id?: string;
    date: Date;
    category: string;
    amount: number;
    department?: string;
    note: string;
    status: 'PAID' | 'PENDING';
    created_at?: string;
    updated_at?: string;
}

// --- New Entities for Provision Store ---

export interface Supplier {
    id?: string;
    companyName: string;
    contactName: string;
    phone: string;
    address: string;
    email?: string;
    balance?: number;
    created_at?: string;
    updated_at?: string;
}

export interface PurchaseItem {
    productId: string;
    productName: string;
    barcode: string;
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
    date: Date;
    items: PurchaseItem[];
    totalAmount: number;
    paidAmount: number;
    balance: number;
    status: 'PENDING' | 'PARTIAL' | 'PAID';
    created_at?: string;
    updated_at?: string;
}

export interface Department {
    id?: string;
    name: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
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
}

// --- Returns & Audit ---

export interface Return {
    id?: string;
    saleId: string; // Changed to string
    customerId?: string;
    staffId?: string;
    returnDate: Date;
    totalRefundAmount: number;
    reason: ReturnReason;
    paymentMethod: PaymentMethod;
    notes?: string;
    created_at?: string;
    updated_at?: string;
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
    created_at?: string;
    updated_at?: string;
}

export interface AuditLog {
    id?: string;
    action: string;
    details: string;
    user: string;
    timestamp: Date;
    created_at?: string;
    updated_at?: string;
}

export interface SyncEntry {
    id?: number; // Local Dexie ID
    table_name: string;
    doc_id: string; // Firebase Document ID
    action: 'create' | 'update' | 'delete';
    payload?: any;
    timestamp: Date;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    error?: string;
}
