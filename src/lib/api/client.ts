import axios from "axios";

/**
 * Shared Axios instance — do not create other instances.
 * NOTE: No global Content-Type header — Axios sets it per request:
 *   • Plain object data → application/json (Axios default)
 *   • FormData → multipart/form-data with correct boundary (browser auto-set)
 * Setting Content-Type globally would override FormData boundary and break file uploads.
 */
export const apiClient = axios.create({
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Force-logout Pub/Sub
// Triggered when refresh token is also dead — session is truly over.
// ---------------------------------------------------------------------------

type ForceLogoutListener = () => void;
let _forceLogoutListener: ForceLogoutListener | null = null;
let _hasTriggeredLogout = false;

/**
 * Register the force-logout handler.
 * Called once by AuthGuardProvider on mount.
 * Re-registration resets the triggered flag (e.g. after re-login).
 */
export function onForceLogout(cb: ForceLogoutListener): void {
  _forceLogoutListener = cb;
  _hasTriggeredLogout = false;
}

/**
 * Reset the triggered flag — call after a successful login so a
 * subsequent session expiry can trigger logout again.
 */
export function resetForceLogout(): void {
  _hasTriggeredLogout = false;
}

/** Fire the registered listener exactly once per session lifecycle. */
function triggerForceLogout(): void {
  if (_hasTriggeredLogout) return; // Edge Case 4: fire once only
  _hasTriggeredLogout = true;
  _forceLogoutListener?.();
}

// ---------------------------------------------------------------------------
// Interceptor — auto-refresh on 401, with race-condition guard
// ---------------------------------------------------------------------------

/** Shared promise so concurrent 401s share a single refresh request. */
let refreshPromise: Promise<void> | null = null;

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Edge Case 2: never intercept auth endpoints — they handle their own errors.
    // Avoids an infinite loop and prevents "wrong password" from triggering force-logout.
    if (original?.url?.startsWith("/api/auth/")) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !original?._retry) {
      original._retry = true;

      try {
        // Race condition fix: only one refresh in-flight at a time.
        // Concurrent 401s await the same promise instead of spawning multiple requests.
        if (!refreshPromise) {
          refreshPromise = axios
            .post("/api/auth/refresh", {}, { withCredentials: true })
            .then(() => undefined)
            .finally(() => {
              refreshPromise = null;
            });
        }
        await refreshPromise;

        // Cache buster to prevent browser from returning cached 401 response for GET requests
        if (original.method?.toLowerCase() === 'get') {
          original.params = { ...original.params, _t: Date.now() };
        }

        // Refresh succeeded — retry the original request with the new cookie.
        return apiClient(original);
      } catch {
        // Refresh also failed — session is truly dead.
        triggerForceLogout();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);
