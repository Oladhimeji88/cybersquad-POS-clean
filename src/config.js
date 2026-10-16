// In dev, calls go through Vite's proxy (see vite.config.ts) via a relative
// path — the staging backend's CORS only allows the exact production origin,
// so the browser can never call it directly from a local dev port.
// On Vercel the same thing is done by a rewrite in vercel.json (/api/* -> staging backend), switched on with
// VITE_API_PROXY=true, so the browser only ever calls its own origin.
export const USE_API_PROXY = import.meta.env.DEV || import.meta.env.VITE_API_PROXY === "true";
export const API_BASE_URL = USE_API_PROXY
  ? ""
  : import.meta.env.VITE_API_BASE_URL || "https://backend.staging.cybersquadapp.com";