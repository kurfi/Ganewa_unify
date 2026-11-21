/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();

// Precaching all build outputs injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST || []);

// Configure network-only routing rules for API/Firebase to avoid service worker caching conflicts
registerRoute(
  ({ url }) => url.origin.includes('firestore.googleapis.com') || url.origin.includes('googleapis.com'),
  new NetworkOnly()
);

registerRoute(
  ({ url }) => url.origin.includes('firebaseio.com'),
  new NetworkOnly()
);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle Background Sync event (triggered when browser detects network is restored)
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'ganewa-sync-queue') {
    console.log('[SW] Background sync event triggered for tag:', event.tag);
    event.waitUntil(triggerClientSync());
  }
});

// Handle Periodic Background Sync event (fires occasionally in background on Android/Chrome)
self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'ganewa-periodic-pull') {
    console.log('[SW] Periodic background sync event triggered for tag:', event.tag);
    event.waitUntil(triggerClientSync());
  }
});

/**
 * Sends a message to all open window clients of this PWA to execute their sync routines.
 * If the app is not open at all (backgrounded/killed), opens it so it can sync on load.
 */
async function triggerClientSync() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  console.log(`[SW] Dispatching SW_TRIGGER_SYNC to ${clients.length} open client(s)`);

  if (clients.length > 0) {
    for (const client of clients) {
      client.postMessage({ type: 'SW_TRIGGER_SYNC' });
    }
  } else {
    // App is not open — open it so AppRoutes mounts and SyncEngine initializes.
    // This covers the case where the background sync / periodic sync fires while
    // the user has the app fully closed on Android.
    console.log('[SW] No open clients found — opening app to trigger sync');
    await self.clients.openWindow('/');
  }
}
