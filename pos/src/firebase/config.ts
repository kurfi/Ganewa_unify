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

// ---------------------------------------------------------------------------
// Auth Status Observable
// Components can subscribe to be notified when auth state changes so they can
// surface a clear error banner instead of letting users hit a Firestore
// "Missing or insufficient permissions" error mid-sale.
// ---------------------------------------------------------------------------
export type AuthStatus = 'pending' | 'authenticated' | 'failed';

type AuthStatusListener = (status: AuthStatus) => void;
const _listeners = new Set<AuthStatusListener>();
let _currentAuthStatus: AuthStatus = 'pending';

function _setAuthStatus(status: AuthStatus) {
    _currentAuthStatus = status;
    _listeners.forEach(fn => fn(status));
}

export const authStatus$ = {
    /** Subscribe to auth status changes. Returns an unsubscribe function. */
    subscribe: (listener: AuthStatusListener): (() => void) => {
        _listeners.add(listener);
        // Immediately emit current status to new subscriber
        listener(_currentAuthStatus);
        return () => _listeners.delete(listener);
    },
    get current(): AuthStatus {
        return _currentAuthStatus;
    }
};

// ---------------------------------------------------------------------------
// ensureSilentAuth — retries up to MAX_RETRIES times with exponential backoff.
// Resolves with the Firebase user on success, or null on final failure.
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500; // 1.5 s → 3 s → 6 s

const _doSignIn = (): Promise<any> =>
    signInWithEmailAndPassword(auth, STORE_EMAIL, STORE_PASSWORD)
        .then(cred => cred.user);

const _wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const ensureSilentAuth = async (attempt = 1): Promise<any> => {
    // Already authenticated — nothing to do.
    if (auth.currentUser) {
        _setAuthStatus('authenticated');
        return auth.currentUser;
    }

    try {
        const user = await Promise.race([
            _doSignIn(),
            // Safety timeout so we never hang more than 8 s per attempt
            _wait(8000).then(() => { throw new Error('Sign-in timed out'); })
        ]);

        console.log(`[SilentAuth] Signed in as: ${user.email}`);
        _setAuthStatus('authenticated');
        return user;
    } catch (err: any) {
        const isRetryable = ![
            'auth/wrong-password',
            'auth/user-not-found',
            'auth/user-disabled',
            'auth/invalid-credential',
        ].includes(err?.code ?? '');

        if (isRetryable && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
            console.warn(`[SilentAuth] Attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`);
            await _wait(delay);
            return ensureSilentAuth(attempt + 1);
        }

        // All retries exhausted or non-retryable error
        console.error(`[SilentAuth] Authentication failed after ${attempt} attempt(s):`, err.message);
        _setAuthStatus('failed');
        return null;
    }
};

const initSilentAuth = () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('POS authenticated as:', user.email);
            _setAuthStatus('authenticated');
        } else {
            console.log('[SilentAuth] Not authenticated. Attempting silent sign-in…');
            _setAuthStatus('pending');
            ensureSilentAuth();
        }
    });
};

initSilentAuth();

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
