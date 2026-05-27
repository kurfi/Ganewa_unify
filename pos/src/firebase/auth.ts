import { auth, db } from './config';
import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { UserRole } from '../types';

export const getCurrentUserRole = async (uid: string): Promise<UserRole> => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
        const userData = userDoc.data();
        return userData.role as UserRole;
    }
    return UserRole.CASHIER; // Default
};

export const logout = () => firebaseSignOut(auth);
