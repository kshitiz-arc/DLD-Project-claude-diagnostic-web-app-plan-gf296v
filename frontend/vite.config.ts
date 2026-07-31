import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single-host LAN deployment (plan §9): bind 0.0.0.0 so lab PCs can reach it,
// and keep every asset local — no external CDN calls in the built bundle.
export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
  preview: { host: "0.0.0.0", port: 4173 },
  build: { outDir: "dist", assetsInlineLimit: 0 },
});
