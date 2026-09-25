import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
    // stellar-sdk 17 en Node ≥ 22 falla con ERR_REQUIRE_CYCLE_MODULE si Node lo carga nativamente:
    // dejamos que Vite lo transforme (solo lo usan las pruebas en vivo y treasury.ts).
    server: { deps: { inline: [/@stellar\/stellar-sdk/] } },
  },
});
