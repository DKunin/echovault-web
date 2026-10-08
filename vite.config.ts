import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    legacy({
      modernPolyfills: true,
      modernTargets: ["Chrome >= 68"],
      renderLegacyChunks: false,
    }),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
