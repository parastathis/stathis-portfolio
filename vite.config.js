import { defineConfig } from "vite";

// Production Content-Security-Policy, injected as a <meta> tag at build time
// only (a meta CSP in dev would break Vite's HMR websocket + inline preamble).
// Real hosting should ALSO send this as a header (see public/_headers for
// Netlify/Cloudflare, vercel.json for Vercel) — the meta tag is the
// defense-in-depth fallback for hosts that can't set headers (GitHub Pages).
// frame-ancestors is header-only (browsers ignore it in meta), so it lives in
// the header files but not here.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

// PORT is set by the Claude Code preview harness (autoPort) so multiple
// sessions can run dev servers side by side; falls back to Vite's default.
export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: !!process.env.PORT,
  },
  plugins: [
    {
      name: "inject-csp-meta",
      apply: "build",
      transformIndexHtml(html) {
        return {
          html,
          tags: [
            {
              tag: "meta",
              attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
              injectTo: "head-prepend",
            },
          ],
        };
      },
    },
  ],
});
