// Central place to define the API base URL used by fetch and socket.io
// Order of precedence:
// 1) Vite-style env (when bundling with Vite)
// 2) CRA-style env (REACT_APP_API_URL)
// 3) Sensible local default matching backend port
export const API_BASE =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) ||
    process.env.REACT_APP_API_URL ||
    "http://localhost:10000";
