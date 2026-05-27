import { Firestore, disableNetwork, enableNetwork } from 'firebase/firestore';

let _initialized = false;

/**
 * Initialises the offline-first network manager.
 *
 * - Calls disableNetwork() immediately if the browser is already offline.
 * - Listens for browser offline → disableNetwork().
 * - Listens for browser online  → enableNetwork(), then fires onOnline().
 *
 * Safe to call multiple times; subsequent calls are no-ops.
 *
 * @param firestoreDb  The Firestore instance from src/firebase/config.ts
 * @param onOnline     Callback to run after network is re-enabled (e.g. runSync)
 */
export const initNetworkManager = (
    firestoreDb: Firestore,
    onOnline: () => void
): void => {
    if (_initialized) return;
    _initialized = true;

    // ── Disable immediately if already offline ──────────────────────────────
    if (!navigator.onLine) {
        disableNetwork(firestoreDb).catch(() => {
            // Silence — nothing meaningful to do if this fails while offline
        });
        console.log('[NetworkManager] Started offline — Firestore network disabled');
    }

    // ── Offline handler ─────────────────────────────────────────────────────
    const handleOffline = () => {
        console.log('[NetworkManager] Browser went offline — disabling Firestore network');
        disableNetwork(firestoreDb).catch(() => { });
    };

    // ── Online handler ──────────────────────────────────────────────────────
    const handleOnline = async () => {
        console.log('[NetworkManager] Browser came online — enabling Firestore network');
        try {
            await enableNetwork(firestoreDb);
            console.log('[NetworkManager] Firestore network enabled');
        } catch (err) {
            console.warn('[NetworkManager] enableNetwork failed:', err);
        }
        // Always attempt to sync even if enableNetwork had a hiccup
        onOnline();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
};
