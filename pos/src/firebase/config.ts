import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    setLogLevel
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Silent Auth for POS
const STORE_EMAIL = 'ganewashoppingmallkurfi@gmail.com';
const STORE_PASSWORD = import.meta.env.VITE_FIREBASE_STORE_PASSWORD || 'GanewaStore123!';

const initSilentAuth = () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('POS authenticated as:', user.email);
        } else {
            console.log('POS not authenticated. Attempting silent sign-in...');
            signInWithEmailAndPassword(auth, STORE_EMAIL, STORE_PASSWORD)
                .then((cred) => console.log('POS silently signed in:', cred.user.email))
                .catch((err) => console.error('POS silent sign-in failed:', err.message));
        }
    });
};

initSilentAuth();

// Suppress Firestore noise (transport errors, offline status logs)
setLogLevel('error');

// Initialize Firestore with settings
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // experimentalForceLongPolling: true is used to ensure stability in network environments 
    // where standard WebSockets might be throttled or blocked (common in some POS installations).
    experimentalForceLongPolling: true, 
});
