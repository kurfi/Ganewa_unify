import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeFirestoreDates } from '../firebase/firestoreHelpers';
import { v4 as uuidv4 } from 'uuid';

export function sanitizeFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;

  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeFirestoreData).filter((v: any) => v !== undefined) as any;
  }

  const cleanObj: any = {};
  for (const key of Object.keys(obj as any)) {
    const val = (obj as any)[key];
    if (val !== undefined) {
      if (val && typeof val === 'object' && !(val instanceof Date)) {
        cleanObj[key] = sanitizeFirestoreData(val);
      } else {
        cleanObj[key] = val;
      }
    }
  }
  return cleanObj;
}

export class BaseRepository<T extends { id?: string; deleted?: boolean; created_at?: string; updated_at?: string }> {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  protected get collectionRef() {
    return collection(db, this.tableName);
  }

  public async getById(id: string): Promise<T | undefined> {
    const docRef = doc(db, this.tableName, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return undefined;

    const data = normalizeFirestoreDates<T>(snap.data());
    const item = { ...data, id: snap.id };

    if (item.deleted) {
      return undefined; // Hide soft-deleted items
    }
    return item;
  }

  public async getAll(): Promise<T[]> {
    const q = query(this.collectionRef, where('deleted', '==', false));
    const snap = await getDocs(q);

    return snap.docs.map((docSnap) => {
      const data = normalizeFirestoreDates<T>(docSnap.data());
      return {
        ...data,
        id: docSnap.id
      };
    });
  }

  public async create(item: Omit<T, 'id' | 'deleted' | 'version' | 'deviceId' | 'created_at' | 'updated_at'>): Promise<string> {
    const id = (item as any).id || uuidv4();
    const now = new Date().toISOString();
    const newItem = {
      ...item,
      id,
      deleted: false,
      created_at: now,
      updated_at: now
    } as any;

    if (this.tableName === 'products' && 'name' in newItem) {
      newItem.nameLower = (newItem.name || '').toLowerCase();
    } else if (this.tableName === 'suppliers' && 'companyName' in newItem) {
      newItem.nameLower = (newItem.companyName || '').toLowerCase();
    } else if (this.tableName === 'customers' && 'name' in newItem) {
      newItem.nameLower = (newItem.name || '').toLowerCase();
    } else if (this.tableName === 'purchases') {
      if ('supplierName' in newItem) {
        newItem.supplierNameLower = (newItem.supplierName || '').toLowerCase();
      }
      if ('invoiceNo' in newItem) {
        newItem.invoiceNoLower = (newItem.invoiceNo || '').toLowerCase();
      }
    }

    const docRef = doc(db, this.tableName, id);
    await setDoc(docRef, sanitizeFirestoreData(newItem));
    return id;
  }

  public async update(id: string, updates: Partial<T>): Promise<void> {
    const docRef = doc(db, this.tableName, id);
    const now = new Date().toISOString();
    const docUpdates = {
      ...updates,
      updated_at: now
    } as any;

    if (this.tableName === 'products' && 'name' in docUpdates) {
      docUpdates.nameLower = (docUpdates.name || '').toLowerCase();
    } else if (this.tableName === 'suppliers' && 'companyName' in docUpdates) {
      docUpdates.nameLower = (docUpdates.companyName || '').toLowerCase();
    } else if (this.tableName === 'customers' && 'name' in docUpdates) {
      docUpdates.nameLower = (docUpdates.name || '').toLowerCase();
    } else if (this.tableName === 'purchases') {
      if ('supplierName' in docUpdates) {
        docUpdates.supplierNameLower = (docUpdates.supplierName || '').toLowerCase();
      }
      if ('invoiceNo' in docUpdates) {
        docUpdates.invoiceNoLower = (docUpdates.invoiceNo || '').toLowerCase();
      }
    }

    await updateDoc(docRef, sanitizeFirestoreData(docUpdates));
  }

  public async delete(id: string): Promise<void> {
    const docRef = doc(db, this.tableName, id);
    const now = new Date().toISOString();
    // Soft delete via update to preserve audit trail
    await updateDoc(docRef, {
      deleted: true,
      updated_at: now
    });
  }

  // Use for queries that need to include deleted items, e.g., admin recovery
  public async getWithDeleted(id: string): Promise<T | undefined> {
    const docRef = doc(db, this.tableName, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return undefined;

    const data = normalizeFirestoreDates<T>(snap.data());
    return {
      ...data,
      id: snap.id
    };
  }

  public async getAllWithDeleted(): Promise<T[]> {
    const snap = await getDocs(this.collectionRef);
    return snap.docs.map((docSnap) => {
      const data = normalizeFirestoreDates<T>(docSnap.data());
      return {
        ...data,
        id: docSnap.id
      };
    });
  }
}
