import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.API_URL ?? "http://localhost:3000";

// 5174, so the storefront and the operator dashboard can run side by side
// during a demo without either having to be stopped.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: { "/api": { target, changeOrigin: true } },
  },
  preview: {
    host: "0.0.0.0",
    port: 5174,
    proxy: { "/api": { target, changeOrigin: true } },
  },
});
