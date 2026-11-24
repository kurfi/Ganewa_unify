import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentSingleTabManager,
    persistentMultipleTabManager,
    memoryLocalCache,
    setLogLevel
} from 'firebase/firestore';

// Detect Capacitor / native WebView environment.
// BroadcastChannel (used by persistentMultipleTabManager) is not reliably
// available inside Android WebView, so we must use the single-tab manager there.
const isCapacitor = !!(window as any).Capacitor;

// Verify required Firebase environment variables
const requiredEnvVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
] as const;

for (const envVar of requiredEnvVars) {
    if (!import.meta.env[envVar]) {
        throw new Error(`[Firebase Config] Missing required environment variable: ${envVar}`);
    }
}

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

// ---------------------------------------------------------------------------
// Auth Status Observable & Helper
// Returns the currently authenticated staff user or null if unauthenticated.
// ---------------------------------------------------------------------------
export type AuthStatus = 'pending' | 'authenticated' | 'unauthenticated';

type AuthStatusListener = (status: AuthStatus) => void;
const _listeners = new Set<AuthStatusListener>();
let _currentAuthStatus: AuthStatus = 'pending';

function _setAuthStatus(status: AuthStatus) {
    _currentAuthStatus = status;
    _listeners.forEach(fn => fn(status));
}

export const authStatus$ = {
    subscribe: (listener: AuthStatusListener): (() => void) => {
        _listeners.add(listener);
        listener(_currentAuthStatus);
        return () => _listeners.delete(listener);
    },
    get current(): AuthStatus {
        return _currentAuthStatus;
    }
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        _setAuthStatus('authenticated');
    } else {
        _setAuthStatus('unauthenticated');
    }
});

/**
 * Returns current authenticated Firebase user without silent fallback credentials.
 */
export const ensureAuthenticatedUser = async (): Promise<any> => {
    if (auth.currentUser) return auth.currentUser;
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
};

// Backward-compatible alias for existing callers
export const ensureSilentAuth = ensureAuthenticatedUser;

// Suppress Firestore noise (transport errors, offline status logs)
setLogLevel('error');

// Main Firestore instance — persistent cache for offline-first POS data sync.
// Inside Capacitor/WebView we use the single-tab manager because BroadcastChannel
// (required by persistentMultipleTabManager) is unreliable in Android WebView.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: isCapacitor
            ? persistentSingleTabManager({ forceOwnership: true })
            : persistentMultipleTabManager(),
    }),
});

// Fast Firestore instance — memory-only, no IndexedDB/tab coordination overhead.
// Use for one-off writes (e.g. linkingCodes) that must resolve in under 2 seconds.
export const fastDb = initializeFirestore(app, {
    localCache: memoryLocalCache(),
}, 'fast');
