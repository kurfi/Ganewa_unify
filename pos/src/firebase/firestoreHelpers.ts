import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  QueryConstraint,
  Timestamp,
  setDoc
} from 'firebase/firestore';
import { db } from './config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Converts Firestore Timestamps in document data to JS Date objects recursively
 * to prevent date parsing crashes across components expecting Date objects.
 */
export function normalizeFirestoreDates<T>(data: any): T {
  if (!data || typeof data !== 'object') return data;

  if (data instanceof Timestamp) {
    return data.toDate() as any;
  }

  if (typeof data.seconds === 'number' && typeof data.nanoseconds === 'number') {
    return new Date(data.seconds * 1000 + data.nanoseconds / 1000000) as any;
  }

  if (Array.isArray(data)) {
    return data.map(normalizeFirestoreDates) as any;
  }

  const result: any = {};
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val && typeof val === 'object') {
      if (val instanceof Timestamp) {
        result[key] = val.toDate();
      } else if (typeof val.seconds === 'number' && typeof val.nanoseconds === 'number') {
        result[key] = new Date(val.seconds * 1000 + val.nanoseconds / 1000000);
      } else if (Array.isArray(val)) {
        result[key] = val.map(normalizeFirestoreDates);
      } else {
        result[key] = normalizeFirestoreDates(val);
      }
    } else if (typeof val === 'string' && (key === 'date' || key === 'returnDate' || key === 'timestamp')) {
      const parsed = new Date(val);
      result[key] = !isNaN(parsed.getTime()) ? parsed : val;
    } else {
      result[key] = val;
    }
  }

  return result as T;
}

interface UseCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

/**
 * React Hook that wraps Firestore's onSnapshot for real-time live collection updates.
 * Automatically excludes soft-deleted items (`deleted == true`) unless overridden.
 */
export function useCollection<T extends { id?: string; deleted?: boolean }>(
  collectionName: string,
  queryConstraints: QueryConstraint[] = [],
  includeDeleted = false
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const colRef = collection(db, collectionName);
    
    // Combine constraints; add soft-delete filter if not already present & not explicit includeDeleted
    const finalConstraints = [...queryConstraints];
    if (!includeDeleted) {
      const hasDeletedConstraint = queryConstraints.some(
        (c: any) => c._field?.segments?.[0] === 'deleted'
      );
      if (!hasDeletedConstraint) {
        finalConstraints.push(where('deleted', '==', false));
      }
    }

    const q = finalConstraints.length > 0 ? query(colRef, ...finalConstraints) : colRef;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: T[] = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data();
          const normalized = normalizeFirestoreDates<T>(raw);
          return {
            ...normalized,
            id: docSnap.id,
          };
        });
        setData(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[useCollection] Firestore error in collection "${collectionName}":`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, JSON.stringify(queryConstraints), includeDeleted]);

  return { data, loading, error };
}

interface UseDocumentResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * React Hook that wraps Firestore's onSnapshot for real-time live document updates.
 */
export function useDocument<T extends { id?: string }>(
  collectionName: string,
  docId: string | null | undefined
): UseDocumentResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!docId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, collectionName, docId);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const raw = docSnap.data();
          const normalized = normalizeFirestoreDates<T>(raw);
          setData({
            ...normalized,
            id: docSnap.id,
          });
        } else {
          setData(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[useDocument] Firestore error in "${collectionName}/${docId}":`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, docId]);

  return { data, loading, error };
}

/**
 * Log action to Firestore auditLogs collection.
 */
export const logAudit = async (action: string, details: string, user: string) => {
  try {
    const id = uuidv4();
    const now = new Date();
    await setDoc(doc(db, 'auditLogs', id), {
      id,
      action,
      details,
      user,
      timestamp: now,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted: false
    });
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
};
