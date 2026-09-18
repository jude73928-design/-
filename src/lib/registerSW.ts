// Register the service worker, but ONLY in safe contexts.
// The Lovable editor renders the app inside an iframe and on preview hosts;
// registering a SW there causes stale content and navigation interference.
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const host = window.location.hostname;
  const isPreviewHost = host.includes("id-preview--") || host.includes("lovableproject.com");

  if (isInIframe || isPreviewHost) {
    // Clean up any previously-registered SW so the editor preview stays fresh.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}
