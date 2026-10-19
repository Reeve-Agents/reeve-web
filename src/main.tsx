import "./styles.css";
import "./owner/owner.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppsDirectory } from "./Apps";

// ?view=apps: every app the owner can connect (kept outside App so the studio layout stays its own).
const appsPage = new URLSearchParams(window.location.search).get("view") === "apps";

createRoot(document.getElementById("root")!).render(<StrictMode>{appsPage ? <AppsDirectory /> : <App />}</StrictMode>);

// The owner app installs from the browser. The service worker only runs in production builds,
// so it never caches the dev server's modules.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
