import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const spaRoot = fileURLToPath(new URL("./firebase-spa", import.meta.url));

export default defineConfig({
  root: spaRoot,
  envDir: projectRoot,
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./firebase-dist", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
});
