import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": { target, changeOrigin: true } },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": { target, changeOrigin: true } },
  },
});
