(() => {
  "use strict";

  // Public configuration only. Never put secrets in this file.
  // GitHub Pages deployment replaces API_BASE with the repository variable
  // DRIP_API_BASE_URL. For local development, the API runs on port 3000.
  const configured = "__DRIP_API_BASE_URL__";
  const apiBase = configured.startsWith("__DRIP_") ? "http://localhost:3000" : configured;

  window.DRIP_CONFIG = Object.freeze({ API_BASE: apiBase.replace(/\/$/, "") });

  window.DripAPI = Object.freeze({
    url(path) {
      const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
      return `${window.DRIP_CONFIG.API_BASE}${normalized}`;
    },
    async fetch(path, options = {}) {
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});
      if (!["GET","HEAD","OPTIONS"].includes(method) && !headers.has("X-CSRF-Token") && !String(path).includes("/auth/csrf")) {
        try { const csrf = await window.fetch(window.DripAPI.url("/api/auth/csrf"), { credentials: "include", cache: "no-store" }); if (csrf.ok) { const data = await csrf.json(); if (data.token) headers.set("X-CSRF-Token", data.token); } } catch {}
      }
      return window.fetch(window.DripAPI.url(path), { ...options, headers });
    }
  });
})();
