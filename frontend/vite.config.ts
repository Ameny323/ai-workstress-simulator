import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Allows ?raw imports for inline SVGs (e.g. the logo)
  assetsInclude: ["**/*.svg", "**/*.csv"],
});
