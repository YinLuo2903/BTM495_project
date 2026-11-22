import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "legacy-page-urls",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (/^\/(?:views\/(?:customer|admin)\/[a-z]+\.html|views\/index\.html|view\/index\.html)(?:\?.*)?$/.test(request.url || "")) {
            request.url = "/index.html";
          }
          next();
        });
      }
    }
  ],
  server: {
    proxy: {
      "/api": backend,
      "/assets": backend,
      "/uploads": backend
    }
  }
});
