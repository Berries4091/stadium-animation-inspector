import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/stadium-animation-inspector/" : "/",
  // Fengari reads this optional Node-only setting without guarding `process`.
  // Replace just that lookup so its other `typeof process` browser checks stay intact.
  define: {
    "process.env.FENGARICONF": "undefined",
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        "process.env.FENGARICONF": "undefined",
      },
    },
  },
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
