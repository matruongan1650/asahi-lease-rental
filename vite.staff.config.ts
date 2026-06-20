import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss()],
    base: "./",
    publicDir: false,
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "import.meta.env.VITE_API_BASE": JSON.stringify(env.VITE_API_BASE || "https://shuyei.online/api"),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      outDir: "dist-staff",
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve(__dirname, "index.staff.html"),
      },
    },
  };
});
