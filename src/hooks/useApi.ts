import { useState, useMemo, useCallback, useRef } from 'react';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

// ===== Configuration =====
// In dev, calls go through Vite's proxy (see vite.config.ts) via a relative
// path — the staging backend's CORS only allows the exact production origin,
// so the browser can never call it directly from a local dev port.
// VITE_API_PROXY=true makes a deployed build use the same-origin /api rewrite in vercel.json, like the dev proxy.
const USE_API_PROXY = import.meta.env.DEV || import.meta.env.VITE_API_PROXY === 'true';
const BASE_URL = USE_API_PROXY
  ? ''
  : import.meta.env.VITE_API_BASE_URL || 'https://backend.staging.cybersquadapp.com';
const API_BASE = `${BASE_URL}/api/v1`;

// ===== Token Refresh State =====
let isRefreshing = false;
let isBlockedForRequests = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

// Process all queued requests after refresh completes
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
};

// ===== Storage Helpers (adapt these to your storage solution) =====
const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Error reading user from storage:', e);
    return null;
  }
};

const setStoredUser = (user: any) => {
  try {
    localStorage.setItem('user', JSON.stringify(user));
  } catch (e) {
    console.warn('Error saving user to storage:', e);
  }
};

const clearStorage = () => {
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
  } catch (e) {
    console.warn('Error clearing storage:', e);
  }
};

// ===== Main Hook =====
export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const cancelTokens = useRef<any[]>([]);

  const cancelAllRequests = useCallback(() => {
    cancelTokens.current.forEach((source: any) => source.cancel('Cancelled due to logout'));
    cancelTokens.current.length = 0;
  }, []);

  const api = useMemo(() => {
    // Create axios instance
    const instance: AxiosInstance = axios.create({
      baseURL: API_BASE,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Logout helper
    const handleLogout = () => {
      clearStorage();
      cancelAllRequests();
      // Redirect to login - adjust based on your routing setup
      window.location.href = '/';
    };

    // ===== REQUEST INTERCEPTOR =====
    instance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // Allow disabling loader per request
        const showLoader = (config as any).showLoader !== false;

        // Add cancel token for this request
        const source = axios.CancelToken.source();
        config.cancelToken = source.token;
        cancelTokens.current.push(source);

        // Local prototype session (dev builds only; see the login page): there is no real
        // account, so fail every request as an ordinary network error instead of sending it
        // to the backend, where the 401 would log the prototype user straight back out.
        if (import.meta.env.DEV && localStorage.getItem('prototype_session')) {
          config.adapter = () => Promise.reject(Object.assign(new Error('Prototype session: backend not connected'), { code: 'ERR_NETWORK', isAxiosError: true, config }));
        }

        // Block non-auth requests during token refresh
        const isAuthCall = (config.url || '').includes('/auth/');
        if (isBlockedForRequests && !isAuthCall) {
          source.cancel('Request blocked during token refresh.');
          return Promise.reject(new axios.Cancel('Request blocked during token refresh.'));
        }

        // Show loader
        if (showLoader) setLoading(true);

        // Attach access token if available
        const user = getStoredUser();
        if (user?.access) {
          config.headers['Authorization'] = `Bearer ${user.access}`;
        }

        return config;
      },
      (error) => {
        setLoading(false);
        return Promise.reject(error);
      }
    );

    // ===== RESPONSE INTERCEPTOR =====
    instance.interceptors.response.use(
      (response) => {
        // Turn off loader
        if ((response.config as any).showLoader !== false) setLoading(false);
        return response;
      },
      async (error) => {
        setLoading(false);

        // Ignore cancellations
        if (axios.isCancel(error) || error.name === 'CanceledError') {
          return Promise.reject(error);
        }

        const originalRequest = error.config || {};
        const status = error?.response?.status;

        // ===== Handle 401 - Token Expired =====
        if (status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          isBlockedForRequests = true;

          // Cancel all current requests
          cancelAllRequests();

          // Get refresh token
          const user = getStoredUser();
          const refresh = user?.refresh;

          if (!refresh) {
            // No refresh token available - logout
            console.warn('No refresh token available, logging out...');
            handleLogout();
            return Promise.reject(error);
          }

          // If already refreshing, queue this request
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            })
              .then((newAccess) => {
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers['Authorization'] = `Bearer ${newAccess}`;
                return instance(originalRequest);
              })
              .catch((err) => Promise.reject(err));
          }

          // Start refresh process
          isRefreshing = true;

          try {
            console.log('🔄 Refreshing access token...');

            // Call refresh endpoint
            const { data } = await axios.post(`${API_BASE}/auth/token/refresh/`, {
              refresh,
            });

            // Update stored tokens
            const updatedUser = {
              ...user,
              access: data.access,
              refresh: data.refresh || refresh, // Use new refresh if provided
            };
            setStoredUser(updatedUser);

            // Process queued requests with new token
            processQueue(null, data.access);

            // Retry original request with new token
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers['Authorization'] = `Bearer ${data.access}`;
            return instance(originalRequest);
          } catch (refreshError) {
            console.error('❌ Token refresh failed:', refreshError);

            // Reject all queued requests
            processQueue(refreshError, null);

            // Logout user
            handleLogout();
            return Promise.reject(refreshError);
          } finally {
            isRefreshing = false;
            isBlockedForRequests = false;
          }
        }

        // ===== Handle other errors =====
        const errorMessage =
          error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'Something went wrong';

        console.error('API Error:', errorMessage);

        // You can add toast notifications here if needed
        // toast.error(errorMessage);

        return Promise.reject(error);
      }
    );

    return instance;
  }, [cancelAllRequests]);

  return {
    api,
    loading,
    cancelAllRequests,
  };
};