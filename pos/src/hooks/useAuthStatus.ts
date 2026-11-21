import { useState, useEffect } from 'react';
import { authStatus$, AuthStatus } from '../firebase/config';

/**
 * Returns the current Firebase silent-auth status.
 *
 * - `'pending'`       — sign-in is in progress (retrying)
 * - `'authenticated'` — POS is signed in and Firestore writes will succeed
 * - `'failed'`        — all retries exhausted; Firestore writes will be blocked
 *
 * Usage:
 *   const authStatus = useAuthStatus();
 *   if (authStatus === 'failed') { show banner }
 */
export function useAuthStatus(): AuthStatus {
    const [status, setStatus] = useState<AuthStatus>(authStatus$.current);

    useEffect(() => {
        const unsub = authStatus$.subscribe(setStatus);
        return unsub;
    }, []);

    return status;
}
