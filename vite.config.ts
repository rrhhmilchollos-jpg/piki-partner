import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/piki-api": {
        target: "https://piki-api-37nr.onrender.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/piki-api/, ""),
      },
    },
  },
});
