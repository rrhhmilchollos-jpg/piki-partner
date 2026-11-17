import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // SUNMI V2 detectada: Android 7.1.1 / WebView 62.
    // Evita sintaxis moderna que ese WebView no puede analizar.
    target: "chrome62",
    cssTarget: "chrome61",
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/piki-api": {
        target: "https://api.pikidelivery.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/piki-api/, ""),
      },
    },
  },
});
