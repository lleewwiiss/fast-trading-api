import "dotenv/config";

import { resolve } from "path";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin(), tailwindcss()],
  server: {
    port: 3000,
    fs: {
      allow: [
        // Allow serving files from the project root
        resolve(__dirname, "../../"),
      ],
    },
  },
  build: {
    target: "esnext",
  },
  define: {
    "process.env.BYBIT_API_KEY": JSON.stringify(process.env.BYBIT_API_KEY),
    "process.env.BYBIT_API_SECRET": JSON.stringify(
      process.env.BYBIT_API_SECRET,
    ),
  },
});
