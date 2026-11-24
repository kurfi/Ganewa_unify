import { db } from './config';
import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    Transaction,
    writeBatch
} from 'firebase/firestore';
import { Customer, Sale, UserRole, Product, Supplier, Purchase } from '../types';

// Generic CRUD helpers
export const createDocument = async (collectionName: string, data: any) => {
    const colRef = collection(db, collectionName);
    const now = new Date().toISOString();
    const docRef = await addDoc(colRef, {
        ...data,
        created_at: now,
        updated_at: now
    });
    return { id: docRef.id, ...data };
};

export const updateDocument = async (collectionName: string, id: string, data: any) => {
    const docRef = doc(db, collectionName, id);
    await updateDoc(docRef, {
        ...data,
        updated_at: new Date().toISOString()
    });
};

export const deleteDocument = async (collectionName: string, id: string) => {
    const docRef = doc(db, collectionName, id);
    await deleteDoc(docRef);
};

export const getCollection = async (collectionName: string) => {
    const colRef = collection(db, collectionName);
    const q = query(colRef, limit(500));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getDocument = async (collectionName: string, id: string) => {
    const docRef = doc(db, collectionName, id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() };
    }
    return null;
};

// --- Specific Services ---

// Products
export const productService = {
    getAll: () => getCollection('products'),
    getById: (id: string) => getDocument('products', id),
    add: (product: Omit<Product, 'id'>) => createDocument('products', product),
    update: (id: string, product: Partial<Product>) => updateDocument('products', id, product),
    delete: (id: string) => deleteDocument('products', id),
};

// Customers
export const customerService = {
    getAll: () => getCollection('customers'),
    add: (customer: Omit<Customer, 'id'>) => createDocument('customers', customer),
    update: (id: string, customer: Partial<Customer>) => updateDocument('customers', id, customer),
};

// Sales
export const saleService = {
    getAll: () => getCollection('sales'),
    add: (sale: Omit<Sale, 'id'>) => createDocument('sales', sale),
};

// Suppliers
export const supplierService = {
    getAll: () => getCollection('suppliers'),
    add: (supplier: Omit<Supplier, 'id'>) => createDocument('suppliers', supplier),
    update: (id: string, supplier: Partial<Supplier>) => updateDocument('suppliers', id, supplier),
};

// Purchases
export const purchaseService = {
    getAll: () => getCollection('purchases'),
    add: (purchase: Omit<Purchase, 'id'>) => createDocument('purchases', purchase),
};

// Categories
export const categoryService = {
    getAll: () => getCollection('categories'),
};
