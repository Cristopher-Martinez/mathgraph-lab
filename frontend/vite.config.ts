import react from "@vitejs/plugin-react";
import { createLogger, defineConfig } from "vite";

const logger = createLogger();
const originalError = logger.error;
logger.error = (msg, options) => {
  if (msg.includes("ws proxy error") || msg.includes("ws proxy socket error")) return;
  originalError(msg, options);
};

export default defineConfig({
  plugins: [react()],
  customLogger: logger,
  server: {
    port: 5174,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/auth": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/chat": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
