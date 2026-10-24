import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser only talks to Vite; /api/* is forwarded to the Express server,
// so every request is same-origin and no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  // onnxruntime-web (Silero VAD) loads its .wasm itself; pre-bundling breaks that.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  server: {
    port: 5180,
    proxy: {
      "/api": { target: "http://localhost:3100", changeOrigin: true },
    },
  },
});
