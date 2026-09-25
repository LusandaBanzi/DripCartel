(() => {
  "use strict";

  window.DripCommon = {
    applyTheme() {
      const theme = loadTheme();
      document.documentElement.dataset.theme = theme;
      const button = document.getElementById("themeBtn");
      if (button) button.textContent = theme === "dark" ? "☀" : "☾";
    },
    setupTheme() {
      document.getElementById("themeBtn")?.addEventListener("click", () => {
        saveTheme(loadTheme() === "dark" ? "light" : "dark");
        this.applyTheme();
      });
    },
    setupTransitions() {
      const overlay = document.getElementById("transitionOverlay");
      if (!overlay) return;
      document.querySelectorAll("[data-transition]").forEach((link) => {
        link.addEventListener("click", (event) => {
          const href = link.getAttribute("href");
          if (!href || href.startsWith("#") || link.target === "_blank") return;
          event.preventDefault();
          overlay.classList.add("show");
          window.setTimeout(() => { window.location.href = href; }, 300);
        });
      });
      window.setTimeout(() => overlay.classList.remove("show"), 250);
    },
    hardenExternalLinks() {
      document.querySelectorAll('a[target="_blank"]').forEach((link) => {
        const rel = new Set((link.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
        rel.add("noopener");
        rel.add("noreferrer");
        link.setAttribute("rel", [...rel].join(" "));
      });
    },
    showToast(message) {
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(window.__dripToastTimer);
      window.__dripToastTimer = window.setTimeout(() => toast.classList.remove("show"), 2500);
    }
  };
})();
