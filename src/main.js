import "./style.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

/* ────────────────────────────────────────────
   LENIS ⇆ SCROLLTRIGGER
   ──────────────────────────────────────────── */
const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
window.lenis = lenis; // handy for debugging / programmatic scroll
window.gsap = gsap;
window.ScrollTrigger = ScrollTrigger;
lenis.on("scroll", ScrollTrigger.update);

// top telemetry bar tracks total scroll progress
const progressFill = document.getElementById("progressFill");
lenis.on("scroll", ({ progress }) => {
  progressFill.style.width = (progress * 100).toFixed(2) + "%";
});
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// anchor links through lenis
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (id.length > 1 && document.querySelector(id)) {
      e.preventDefault();
      lenis.scrollTo(id, { offset: 0, duration: 1.6 });
    }
  });
});

/* ────────────────────────────────────────────
   HERO FRAME SEQUENCE
   ──────────────────────────────────────────── */
const canvas = document.getElementById("heroCanvas");
const ctx = canvas.getContext("2d");
const helmetFrames = [];
const faceFrames = [];
let frameCount = 0;
let faceCount = 0;
const playhead = { frame: 0 };

// hover "ID scan" lens: reveals the bare-face orbit through the helmet
const lens = { x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0, seeded: false };

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  renderFrame();
}

function drawCover(img) {
  const cw = canvas.width, ch = canvas.height;
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
}

// organic wobbly blob outline for the reveal lens
function traceBlob(cx, cy, r, t) {
  const pts = 28;
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const wob = 1 + 0.11 * Math.sin(a * 3 + t * 1.9) + 0.07 * Math.sin(a * 5 - t * 2.6) + 0.04 * Math.sin(a * 8 + t * 3.4);
    const rr = r * wob;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function renderFrame() {
  const i = Math.round(playhead.frame);
  // bare face is the default; the helmet materialises inside the hover lens
  const base = faceCount ? faceFrames[Math.min(i, faceCount - 1)] : helmetFrames[i];
  const overlay = faceCount ? helmetFrames[i] : null;
  if (!base || !base.complete || !base.naturalWidth) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCover(base);

  if (lens.r > 1 && overlay && overlay.complete && overlay.naturalWidth) {
    const t = performance.now() / 1000;
    ctx.save();
    traceBlob(lens.x, lens.y, lens.r, t);
    ctx.clip();
    drawCover(overlay);
    ctx.restore();

    ctx.save();
    traceBlob(lens.x, lens.y, lens.r, t);
    ctx.strokeStyle = "rgba(16,223,143,0.85)";
    ctx.lineWidth = Math.max(2, canvas.width * 0.0015);
    ctx.shadowColor = "rgba(16,223,143,0.8)";
    ctx.shadowBlur = 26;
    ctx.stroke();
    ctx.restore();
  }
}

async function loadSequence(dir, store) {
  let manifest = null;
  try {
    const res = await fetch(`${dir}/manifest.json`, { cache: "no-store" });
    if (res.ok) manifest = await res.json();
  } catch (_) { /* sequence missing — feature degrades gracefully */ }
  if (!manifest || !manifest.count) return 0;
  const pad = manifest.pad ?? 4;
  const ext = manifest.ext ?? "jpg";
  store.meta = { dir, pad, ext, count: manifest.count };
  return manifest.count;
}

async function preloadFrames(onProgress) {
  frameCount = await loadSequence("/media/hero", helmetFrames);
  faceCount = await loadSequence("/media/hero-face", faceFrames);
  const total = frameCount + faceCount;
  if (!total) { onProgress(1); return; }
  let loaded = 0;

  const loadInto = (store, count) =>
    Array.from({ length: count }, (_, i) => new Promise((resolve) => {
      const { dir, pad, ext } = store.meta;
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        onProgress(loaded / total);
        resolve();
      };
      img.src = `${dir}/frame_${String(i + 1).padStart(pad, "0")}.${ext}`;
      store[i] = img;
    }));

  await Promise.all([
    ...loadInto(helmetFrames, frameCount),
    ...(faceCount ? loadInto(faceFrames, faceCount) : []),
  ]);
}

function initLens() {
  if (!faceCount) return;
  const stage = document.querySelector(".hero__stage");
  stage.style.cursor = "crosshair";

  stage.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    if (!lens.seeded) { lens.x = x; lens.y = y; lens.seeded = true; }
    lens.tx = x; lens.ty = y;
    // active zone: ellipse around the head (center, upper third)
    const dx = (x - canvas.width * 0.5) / (canvas.width * 0.24);
    const dy = (y - canvas.height * 0.34) / (canvas.height * 0.32);
    lens.tr = dx * dx + dy * dy <= 1 ? Math.min(canvas.width, canvas.height) * 0.2 : 0;
  });
  stage.addEventListener("mouseleave", () => { lens.tr = 0; });

  gsap.ticker.add(() => {
    // keep rendering while the lens is open so the blob wobble animates
    if (lens.r <= 1 && Math.abs(lens.r - lens.tr) < 0.5) return;
    lens.x += (lens.tx - lens.x) * 0.2;
    lens.y += (lens.ty - lens.y) * 0.2;
    lens.r += (lens.tr - lens.r) * 0.15;
    renderFrame();
  });
}

/* ────────────────────────────────────────────
   TEXT SPLITTING
   ──────────────────────────────────────────── */
function splitChars(el) {
  const text = el.textContent;
  el.textContent = "";
  return [...text].map((ch) => {
    const span = document.createElement("span");
    span.className = "char";
    span.textContent = ch;
    el.appendChild(span);
    return span;
  });
}

/* ────────────────────────────────────────────
   BACKGROUND VIDEO PLAYBACK
   Videos never stop while on screen; scrolling
   makes them run faster (speed-reactive), then
   they ease back to 1x — no decoder seeking.
   ──────────────────────────────────────────── */
const playbackVideos = [];
let rateTarget = 1;
let rateCurrent = 1;

function attachVideoPlayback(video, trigger) {
  if (!video) { console.warn("attachVideoPlayback: missing video for", trigger); return; }
  video.loop = true;
  video.muted = true;
  const st = ScrollTrigger.create({
    trigger,
    start: "top 95%",
    end: "bottom top",
    onToggle: (self) => { self.isActive ? video.play().catch(() => {}) : video.pause(); },
    onRefresh: (self) => { if (self.isActive && video.paused) video.play().catch(() => {}); },
  });
  playbackVideos.push({ video, st });
}

lenis.on("scroll", () => {
  const v = Math.abs(lenis.velocity || 0);
  rateTarget = Math.max(rateTarget, Math.min(1 + v / 700, 1.6));
});
let watchdogAt = 0;
let rateSetAt = 0;
gsap.ticker.add((time) => {
  rateTarget += (1 - rateTarget) * 0.04; // decay back to 1x
  rateCurrent += (rateTarget - rateCurrent) * 0.12;
  if (Math.abs(rateCurrent - 1) < 0.005) rateCurrent = 1;
  const runWatchdog = time - watchdogAt > 1.2;
  if (runWatchdog) watchdogAt = time;
  // throttle playbackRate writes — writing it every frame stalls the decoder
  const setRate = time - rateSetAt > 0.25;
  if (setRate) rateSetAt = time;
  for (const { video, st } of playbackVideos) {
    if (!video.paused) {
      if (setRate && Math.abs(video.playbackRate - rateCurrent) > 0.05) {
        video.playbackRate = rateCurrent;
      }
    }
    // if the browser aborted playback while the section is on screen, restart it
    else if (runWatchdog && st.isActive) video.play().catch(() => {});
  }
});

/* ────────────────────────────────────────────
   SCENES
   ──────────────────────────────────────────── */
function buildHero() {
  const chars1 = splitChars(document.getElementById("nameLine1"));
  const chars2 = splitChars(document.getElementById("nameLine2"));

  const orbitDeg = document.getElementById("orbitDeg");
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: "#hero",
      start: "top top",
      end: "+=380%",
      pin: ".hero__stage",
      scrub: 1,
      anticipatePin: 1,
      onUpdate(self) {
        renderFrame();
        orbitDeg.textContent = String(Math.round(self.progress * 360)).padStart(3, "0");
      },
    },
    defaults: { ease: "none" },
  });

  // frame scrub runs across the whole pin
  if (frameCount > 1) {
    tl.to(playhead, { frame: frameCount - 1, duration: 10 }, 0);
  }

  // name tracks in letter-by-letter over the first third of the orbit
  gsap.set([...chars1, ...chars2], { opacity: 0, yPercent: 55 });
  gsap.set("#heroSub", { opacity: 0, y: 30 });

  // kicker reveals on load (not scroll-gated) so the hero never sits empty
  gsap.fromTo("#heroKicker",
    { opacity: 0, letterSpacing: "1.1em" },
    { opacity: 1, letterSpacing: "0.45em", duration: 1.6, ease: "power3.out", delay: 0.9 });

  tl.to(chars1, { opacity: 1, yPercent: 0, duration: 2.2, stagger: 0.07, ease: "power1.out" }, 0.4)
    .to(chars2, { opacity: 1, yPercent: 0, duration: 2.2, stagger: 0.045, ease: "power1.out" }, 1.0)
    .to("#heroSub", { opacity: 1, y: 0, duration: 1.2, ease: "power1.out" }, 2.6)
    // type holds through the middle of the orbit, then drifts apart as it completes
    .to(chars1, { yPercent: -30, opacity: 0, duration: 1.8, stagger: 0.03, ease: "power1.in" }, 7.2)
    .to(chars2, { yPercent: 30, opacity: 0, duration: 1.8, stagger: 0.025, ease: "power1.in" }, 7.35)
    .fromTo(["#heroSub", "#scrollCue", "#heroMetaL", "#heroMetaR", "#heroHud"],
      { opacity: 1 }, { opacity: 0, duration: 1, immediateRender: false }, 7.4);
}

function buildStats() {
  document.querySelectorAll(".stat__num").forEach((el) => {
    const end = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () =>
        gsap.to(obj, {
          v: end,
          duration: 2.2,
          ease: "power3.out",
          onUpdate: () => { el.textContent = Math.round(obj.v) + suffix; },
        }),
    });
  });

  gsap.from(".stat", {
    y: 60, opacity: 0, stagger: 0.12, duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: ".stats__grid", start: "top 85%", once: true },
  });
}

function buildPillars() {
  const pillars = gsap.utils.toArray(".pillar");
  const ticks = gsap.utils.toArray(".pillars__tick");

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: "#pillars",
      start: "top top",
      end: "+=340%",
      pin: ".pillars__stage",
      scrub: 0.5,
      anticipatePin: 1,
      onUpdate(self) {
        const idx = Math.min(2, Math.floor(self.progress * 3));
        ticks.forEach((t, i) => t.classList.toggle("is-active", i === idx));
      },
    },
    defaults: { ease: "none" },
  });

  pillars.forEach((p, i) => {
    const at = i * 3;
    tl.fromTo(p, { autoAlpha: 0, y: 90 }, { autoAlpha: 1, y: 0, duration: 1, ease: "power2.out" }, at)
      .to(p, { duration: 1.4 }, at + 1); // hold
    if (i < pillars.length - 1) {
      tl.to(p, { autoAlpha: 0, y: -90, duration: 0.8, ease: "power2.in" }, at + 2.3);
    }
  });

  // created after the pin so its range includes the pin spacer
  attachVideoPlayback(document.getElementById("builderVideo"), "#pillars");
}

function buildFuture() {
  // two jarvis clips crossfade back and forth while the section is on screen
  const vidA = document.getElementById("jarvisVideoA");
  const vidB = document.getElementById("jarvisVideoB");
  attachVideoPlayback(vidA, "#future");
  attachVideoPlayback(vidB, "#future");
  gsap.set(vidB, { autoAlpha: 0 });
  let showingB = false;
  setInterval(() => {
    showingB = !showingB;
    gsap.to(vidA, { autoAlpha: showingB ? 0 : 1, duration: 1.4, ease: "power2.inOut" });
    gsap.to(vidB, { autoAlpha: showingB ? 1 : 0, duration: 1.4, ease: "power2.inOut" });
  }, 3600);

  const words = gsap.utils.toArray(".future__quote .word");

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: "#future",
      start: "top top",
      end: "+=220%",
      pin: ".future__stage",
      scrub: 0.5,
      anticipatePin: 1,
    },
    defaults: { ease: "none" },
  });

  gsap.set(words, { opacity: 0, yPercent: 50 });
  gsap.set(".future__attrib", { opacity: 0, y: 30 });

  tl.to(words, { opacity: 1, yPercent: 0, duration: 1.1, stagger: 0.08, ease: "power1.out" }, 0.2)
    .to(".future__attrib", { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 1.5)
    .to({}, { duration: 3.6 }, 2.2); // hold with jarvis running
}

function buildWork() {
  const headingChars = splitChars(document.getElementById("workHeading"));

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: "#work",
      start: "top top",
      end: "+=250%",
      pin: ".work__stage",
      scrub: 0.5,
      anticipatePin: 1,
    },
    defaults: { ease: "none" },
  });

  gsap.set(headingChars, { opacity: 0, yPercent: 45 });
  gsap.set(".card", { opacity: 0, y: 90 });

  // reveal fast in the first quarter of the pin, then hold
  tl.to(headingChars, { opacity: 1, yPercent: 0, duration: 1, stagger: 0.018, ease: "power1.out" }, 0.1)
    .to(".card", { opacity: 1, y: 0, duration: 1, stagger: 0.15, ease: "power1.out" }, 0.6)
    .to({}, { duration: 4.2 }, 1.6); // hold pinned while user reads / hovers

  attachVideoPlayback(document.getElementById("creatorVideo"), "#work");
}

function buildTrust() {
  gsap.from(".tcard", {
    y: 70, opacity: 0, stagger: 0.14, duration: 1, ease: "power2.out",
    scrollTrigger: { trigger: ".trust__grid", start: "top 85%", once: true },
  });
  gsap.from(".badge", {
    y: 30, opacity: 0, stagger: 0.08, duration: 0.7, ease: "power2.out",
    scrollTrigger: { trigger: ".trust__badges", start: "top 90%", once: true },
  });
}

function buildFinale() {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: "#finale",
      start: "top top",
      end: "+=250%",
      pin: ".finale__stage",
      scrub: 0.5,
      anticipatePin: 1,
    },
    defaults: { ease: "none" },
  });

  gsap.set(".finale__word", { opacity: 0, yPercent: 50 });
  gsap.set("#finaleCtas", { opacity: 0, y: 40 });

  tl.to(".finale__word", { opacity: 1, yPercent: 0, duration: 1.1, stagger: 0.07, ease: "power1.out" }, 0.2)
    .to("#finaleCtas", { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 1.2)
    .to({}, { duration: 4 }, 2); // hold on the hero pose while screens flare

  attachVideoPlayback(document.getElementById("closerVideo"), "#finale");
}

/* ────────────────────────────────────────────
   BOOT
   ──────────────────────────────────────────── */
const loader = document.getElementById("loader");
const loaderPct = document.getElementById("loaderPct");
const loaderFill = document.getElementById("loaderFill");

preloadFrames((p) => {
  const pct = Math.round(p * 100);
  loaderPct.textContent = pct + "%";
  loaderFill.style.width = pct + "%";
}).then(() => {
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);

  // Dismiss the loader FIRST, independent of scene building, so a bug in any
  // build step can never leave the full-screen overlay covering the page.
  // CSS-transition + setTimeout driven (not the rAF ticker), so it clears even
  // in a backgrounded tab where GSAP/rAF is paused.
  setTimeout(() => {
    loader.classList.add("is-hidden");
    setTimeout(() => loader.remove(), 950);
  }, 300);

  try {
    initLens();
    buildHero();
    buildStats();
    buildPillars();
    buildFuture();
    buildWork();
    buildTrust();
    buildFinale();
    ScrollTrigger.refresh();

    // Self-correct if the hero booted at 0 size (e.g. hidden/backgrounded tab).
    const stage = document.querySelector(".hero__stage");
    const ro = new ResizeObserver(() => { sizeCanvas(); ScrollTrigger.refresh(); });
    ro.observe(stage);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { sizeCanvas(); ScrollTrigger.refresh(); renderFrame(); }
    });
  } catch (err) {
    console.error("Scene build failed:", err);
  }
}).catch((err) => {
  console.error("Boot failed:", err);
  loader.classList.add("is-hidden");
  setTimeout(() => loader.remove(), 950);
});
