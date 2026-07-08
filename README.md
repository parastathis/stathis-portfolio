# Efstathios Paraskevopoulos — Cinematic Portfolio

An award-style, scroll-driven personal portfolio. A canvas frame-sequence hero orbit rotates as you scroll (Lando Norris / OFF+BRAND style), with pinned cinematic sections, kinetic type, a JARVIS AI segment, testimonials, and a finale CTA.

**Meta Ads & E-commerce · E-shop Developer · YouTube Creator · Mentor**

## Stack

- [Vite](https://vitejs.dev/) — dev server & build
- [GSAP](https://gsap.com/) + ScrollTrigger — scroll-driven animation & pinning
- [Lenis](https://lenis.darkroom.engineering/) — smooth scroll
- Vanilla JS + Canvas 2D frame-sequence scrubbing

## Features

- **Hero orbit** — 360° camera orbit rendered as a preloaded JPEG frame sequence, scrubbed by scroll. Bare-face by default; hover the head to reveal a robot-helmet variant through a wobbly organic lens ("ID scan").
- **Telemetry HUD** — live orbit-degree readout, corner brackets, top scroll-progress bar.
- **Animated stats** that count up on scroll.
- **Three Pillars** — Creator / Mentor / Developer, revealed one at a time over a pinned clip.
- **The Future** — a JARVIS-style holographic AI clip under the line *"Work from the future, enriching the present."*
- **Selected Work** cards with hover motion.
- **Trust** — testimonials + proof badges.
- **Finale** — dual CTAs and footer links.
- Velocity-reactive background videos, dual marquee strips, film grain.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to /dist
npm run preview  # preview the build
```

## Media

The hero canvas reads a frame sequence from `public/media/hero/` (+ `public/media/hero-face/`) described by each folder's `manifest.json`. Background clips live in `public/media/*.mp4`.

---

© 2026 Efstathios Paraskevopoulos · [github.com/efstathios-paraskevopoulos](https://github.com/efstathios-paraskevopoulos)
