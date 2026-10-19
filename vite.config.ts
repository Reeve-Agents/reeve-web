import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Locally the API runs on :8787. Deployed (npm start), REEVE_API_URL points at the reeve-api project,
// so the browser only ever talks to this origin and passkeys stay bound to it.
const api = process.env.REEVE_API_URL ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": api },
  },
  preview: {
    host: true,
    port: Number(process.env.PORT ?? 4173),
    allowedHosts: true,
    proxy: { "/api": { target: api, changeOrigin: true } },
  },
});
