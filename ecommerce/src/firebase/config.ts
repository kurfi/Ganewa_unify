import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

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
export const functions = getFunctions(app, 'us-central1');
export const googleProvider = new GoogleAuthProvider();

// Initialize App Check for ecommerce
if (typeof window !== 'undefined') {
    const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;

    if (debugToken) {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
    }

    if (recaptchaSiteKey) {
        try {
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(recaptchaSiteKey),
                isTokenAutoRefreshEnabled: true
            });
            console.log('Firebase App Check initialized successfully.');
        } catch (err) {
            console.warn('Firebase App Check initialization failed:', err);
        }
    } else {
        console.warn('VITE_RECAPTCHA_SITE_KEY is not set. App Check is disabled for development.');
    }
}

// Initialize Firestore with settings
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const storage = getStorage(app);

