/**
 * Lightweight event emitter for signalling the dashboard to refresh its stats.
 *
 * Any write operation the dashboard cares about (checkout, expense, payment,
 * purchase, write-off, return, product edit) calls `emitDashboardRefresh()`
 * after successfully committing. The dashboard subscribes via
 * `subscribeDashboardRefresh()` and re-runs its aggregation fetch.
 *
 * This replaces permanent onSnapshot listeners with an event-driven model:
 * the person who made the change sees it reflected immediately, without
 * costing reads on every other open tab/device.
 */

type RefreshCallback = () => void;

const listeners = new Set<RefreshCallback>();

/**
 * Call this after any successful write that should update the dashboard
 * (sale, expense, payment, purchase, write-off, return, product edit).
 */
export function emitDashboardRefresh(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error('[DashboardRefreshSignal] Listener error:', err);
    }
  });
}

/**
 * Subscribe to dashboard refresh events.
 * Returns an unsubscribe function.
 */
export function subscribeDashboardRefresh(callback: RefreshCallback): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
