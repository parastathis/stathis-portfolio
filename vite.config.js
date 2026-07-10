import { defineConfig } from "vite";

// PORT is set by the Claude Code preview harness (autoPort) so multiple
// sessions can run dev servers side by side; falls back to Vite's default.
export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: !!process.env.PORT,
  },
});
