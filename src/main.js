import "./style.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

/* ────────────────────────────────────────────
   LENIS ⇆ SCROLLTRIGGER
   ──────────────────────────────────────────── */
// Desktop: smooth wheel. Mobile: NATIVE touch scroll (syncTouch hijacks the
// finger and feels laggy/broken on phones) — Lenis only smooths the wheel.
const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true, syncTouch: false });
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

// anchor links through lenis (the mobile menu binds its own — exclude it here
// so a tap doesn't fire two competing scrollTo tweens)
document.querySelectorAll('a[href^="#"]:not(.mmenu a)').forEach((a) => {
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

const CAN_HOVER = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function loadImages(store, count, onEach) {
  const { dir, pad, ext } = store.meta;
  return Promise.all(Array.from({ length: count }, (_, i) => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => { onEach && onEach(); resolve(); };
    img.src = `${dir}/frame_${String(i + 1).padStart(pad, "0")}.${ext}`;
    store[i] = img;
  })));
}

// Block the loader on the FACE sequence only — that's the default visible orbit.
// (Previously it blocked on BOTH 193-frame sequences = ~2GB decoded, a
// mobile-crash-class footprint and a slow first paint.)
async function preloadFrames(onProgress) {
  faceCount = await loadSequence("/media/hero-face", faceFrames);
  if (faceCount) {
    let n = 0;
    await loadImages(faceFrames, faceCount, () => onProgress(++n / faceCount));
    return;
  }
  // no face sequence available → fall back to the helmet sequence as the base
  frameCount = await loadSequence("/media/hero", helmetFrames);
  if (!frameCount) { onProgress(1); return; }
  let n = 0;
  await loadImages(helmetFrames, frameCount, () => onProgress(++n / frameCount));
}

// The helmet sequence only feeds the desktop hover-lens overlay — load it AFTER
// the site is interactive, and never on touch (no hover = it can't be revealed).
async function loadHelmetFrames() {
  if (!CAN_HOVER || frameCount) return;
  frameCount = await loadSequence("/media/hero", helmetFrames);
  if (frameCount) await loadImages(helmetFrames, frameCount);
}

function initLens() {
  // lens reveals the helmet overlay on hover — desktop only, needs both seqs
  if (!CAN_HOVER || !faceCount) return;
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

// A clip plays whenever it is within ±1.5 viewports of the screen — far enough
// out that it is always already running when it scrolls into view, close
// enough in that only ~1-2 clips decode at once (5 concurrent decodes make
// constrained devices force-pause videos themselves, sometimes the visible
// one). Recovery from a browser-initiated pause is instant: a `pause` listener
// plus a 0.3s watchdog re-play any in-range clip. Neither is gated on
// document.hidden — embedded preview panes report hidden while still
// rendering, and Chrome pauses muted loops there; the old hidden-gate is what
// let clips freeze permanently mid-scroll.
function attachVideoPlayback(video, trigger) {
  if (!video) { console.warn("attachVideoPlayback: missing video for", trigger); return; }
  video.muted = true;
  video.loop = true;
  const st = ScrollTrigger.create({
    trigger,
    start: "top bottom+=150%",
    end: "bottom top-=150%",
    onToggle: (self) => {
      if (self.isActive) video.play().catch(() => {});
      else video.pause();
    },
  });
  // browser paused it (power saving, loop boundary in a hidden pane, decoder
  // pressure)? — if it should be playing, start it right back up.
  video.addEventListener("pause", () => {
    if (st.isActive) setTimeout(() => { if (st.isActive && video.paused) video.play().catch(() => {}); }, 60);
  });
  if (st.isActive) video.play().catch(() => {});
  playbackVideos.push({ video, st });
}

// Belt-and-braces resume for in-range clips (covers rejected play() promises
// that the pause listener never sees). Deliberately NOT gated on
// document.hidden — see note above.
let watchdogAt = 0;
gsap.ticker.add((time) => {
  if (time - watchdogAt < 0.3) return;
  watchdogAt = time;
  for (const { video, st } of playbackVideos) {
    if (st.isActive && video.paused) video.play().catch(() => {});
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
      end: "+=260%",
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

  // frame scrub runs across the whole pin (base = face seq; helmet lazy-loads
  // for the lens but is the same length, so either count drives the range)
  const seqLen = faceCount || frameCount;
  if (seqLen > 1) {
    tl.to(playhead, { frame: seqLen - 1, duration: 10 }, 0);
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
      end: "+=240%",
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

  // "THE BUILDER" clip slowly zooms IN across the whole pinned scroll —
  // pushing deeper into the holographic desk as the pillars advance.
  gsap.set("#builderVideo", { transformOrigin: "50% 45%" });
  tl.fromTo("#builderVideo", { scale: 1 }, { scale: 1.45, duration: 8.4, ease: "none" }, 0);

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
  // Jarvis clips play through ONCE each, then hand off to the other.
  // A plays fully → on ended, B fades in on top and plays fully → on ended,
  // A restarts and B fades back out. A sits underneath at full opacity the whole
  // time, so the dissolve never dips to black. Not a timer — driven by playback.
  const vidA = document.getElementById("jarvisVideoA");
  const vidB = document.getElementById("jarvisVideoB");
  [vidA, vidB].forEach((v) => { v.muted = true; v.loop = false; });

  let front = vidA;               // which clip the viewer currently sees
  const handoff = (next) => {
    front = next;
    next.currentTime = 0;
    next.play().catch(() => {});
    // B is the top layer; its opacity is what dissolves
    vidB.classList.toggle("is-visible", next === vidB);
  };
  vidA.addEventListener("ended", () => handoff(vidB));
  vidB.addEventListener("ended", () => handoff(vidA));

  // Play the sequence only while #future is within ~a viewport (start it early,
  // stop it once well past) so the two clips aren't decoding off-screen. `near`
  // gates the resume watchdog so it never fights the pause.
  let near = false;
  ScrollTrigger.create({
    trigger: "#future",
    start: "top bottom+=100%",
    end: "bottom top-=100%",
    onToggle: (self) => {
      near = self.isActive;
      if (near) front.play().catch(() => {});
      else { vidA.pause(); vidB.pause(); }
    },
  });
  // resume genuine stalls only (throttled) — never a clip that just ended
  // (that must hand off) and never while off-screen.
  let jarvisWatch = 0;
  gsap.ticker.add((t) => {
    if (t - jarvisWatch < 0.35) return;
    jarvisWatch = t;
    if (near && front.paused && !front.ended) front.play().catch(() => {});
  });

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
  gsap.set(headingChars, { opacity: 0, yPercent: 45 });
  gsap.to(headingChars, {
    opacity: 1, yPercent: 0, duration: 1, stagger: 0.02, ease: "power2.out",
    scrollTrigger: { trigger: "#work", start: "top 70%", once: true },
  });

  attachVideoPlayback(document.getElementById("creatorVideo"), "#work");

  // On phones the track is a native horizontal swipe strip — no pin/tween.
  if (window.matchMedia("(max-width: 760px)").matches) return;

  const track = document.getElementById("workTrack");
  const cards = gsap.utils.toArray(".wcard", track);
  const amount = () => Math.max(0, track.scrollWidth - window.innerWidth);

  // Vertical scroll drives the track sideways (the Awwwards horizontal move).
  const tween = gsap.to(track, {
    x: () => -amount(),
    ease: "none",
    scrollTrigger: {
      trigger: "#work",
      start: "top top",
      end: () => "+=" + amount(),
      pin: ".work__pin",
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  // Each card lifts in as it enters from the right (tied to horizontal motion).
  cards.forEach((card) => {
    gsap.from(card, {
      opacity: 0, yPercent: 12, duration: 1, ease: "power2.out",
      scrollTrigger: {
        trigger: card, containerAnimation: tween,
        start: "left 92%", toggleActions: "play none none reverse",
      },
    });
  });
}

// Capabilities: hover a row → it expands and an emerald preview chip trails the
// cursor showing that capability. Desktop only (rows are always open on touch).
function buildCaps() {
  const list = document.getElementById("capsList");
  const preview = document.getElementById("capsPreview");
  if (!list || !preview || window.matchMedia("(hover: none)").matches) return;
  const numEl = preview.querySelector(".caps__preview-num");
  const labelEl = preview.querySelector(".caps__preview-label");
  const px = gsap.quickTo(preview, "x", { duration: 0.5, ease: "power3.out" });
  const py = gsap.quickTo(preview, "y", { duration: 0.5, ease: "power3.out" });

  list.addEventListener("pointermove", (e) => { px(e.clientX); py(e.clientY); });
  list.querySelectorAll(".cap").forEach((cap) => {
    cap.addEventListener("mouseenter", () => {
      numEl.textContent = cap.dataset.num;
      labelEl.textContent = cap.dataset.cap;
      preview.classList.add("is-on");
    });
  });
  list.addEventListener("mouseleave", () => preview.classList.remove("is-on"));
}

// Process = sticky stacking cards. Each card shrinks and dims as the next one
// slides up over it, so they physically pile with depth.
function buildProcess() {
  const steps = gsap.utils.toArray("#processStack .pstep");
  steps.forEach((step, i) => {
    const inner = step.querySelector(".pstep__inner");
    gsap.from(inner, { // opacity-only entrance (no transform — the scale tween owns transform)
      opacity: 0, duration: 0.8, ease: "power2.out",
      scrollTrigger: { trigger: step, start: "top 85%", once: true },
    });
    if (i < steps.length - 1) {
      gsap.to(inner, {
        scale: 0.9, filter: "brightness(0.5)", ease: "none",
        scrollTrigger: { trigger: steps[i + 1], start: "top bottom", end: "top top", scrub: true },
      });
    }
  });
}

function buildTrust() {
  // the wall itself enters via .reveal; badges pop in below it
  gsap.from(".badge", {
    y: 30, opacity: 0, stagger: 0.08, duration: 0.7, ease: "power2.out",
    scrollTrigger: { trigger: ".trust__badges", start: "top 90%", once: true },
  });
}

// Split a heading into per-word, per-char spans (words stay unbroken; real
// spaces preserved) so each letter can shatter independently.
function splitHeadingChars(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = "";
  const chars = [];
  words.forEach((word, wi) => {
    const w = document.createElement("span");
    w.className = "fword"; w.style.display = "inline-block";
    [...word].forEach((ch) => {
      const c = document.createElement("span");
      c.className = "char"; c.textContent = ch;
      w.appendChild(c); chars.push(c);
    });
    el.appendChild(w);
    if (wi < words.length - 1) el.appendChild(document.createTextNode(" "));
  });
  return chars;
}

function buildFinale() {
  const heading = document.getElementById("finaleHeading");
  const chars = splitHeadingChars(heading);
  const knock = document.querySelector(".finale__knock");
  const stage = document.querySelector(".finale__stage");
  const mask = document.getElementById("finaleMask");
  const mctx = mask.getContext("2d");
  const flash = document.getElementById("finaleFlash");
  const n = chars.length;

  // Paint the intact knockout: black cover with the heading punched out
  // (destination-out) plus a faint emerald glow around the glyphs. Words are
  // drawn at the REAL rendered positions of the hidden span heading, so the
  // canvas text and the shard spans line up when they swap at impact.
  const drawMask = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    mask.width = w * dpr; mask.height = h * dpr;
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.fillStyle = "#020402";
    mctx.fillRect(0, 0, w, h);
    const stageBox = stage.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(heading).fontSize);
    mctx.font = `400 ${fs}px Anton, Impact, sans-serif`;
    mctx.textBaseline = "top";
    if ("letterSpacing" in mctx) mctx.letterSpacing = (0.01 * fs).toFixed(2) + "px";
    heading.querySelectorAll(".fword").forEach((word) => {
      const r = word.getBoundingClientRect();
      const x = r.left - stageBox.left;
      // center the em box inside the word's line box (line-height 0.94)
      const y = r.top - stageBox.top + (r.height - fs) / 2;
      mctx.save();
      mctx.shadowColor = "rgba(16,223,143,0.55)";
      mctx.shadowBlur = 24;
      mctx.strokeStyle = "rgba(16,223,143,0.30)";
      mctx.lineWidth = Math.max(1.2, fs * 0.012);
      mctx.strokeText(word.textContent, x, y);
      mctx.restore();
      mctx.save();
      mctx.globalCompositeOperation = "destination-out";
      mctx.fillStyle = "#fff";
      mctx.fillText(word.textContent, x, y);
      mctx.restore();
    });
  };
  drawMask();
  // redraw once the display font is actually loaded, and on stage resize
  // (observe the NON-pinned parent; draw only — never ScrollTrigger.refresh)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawMask);
  new ResizeObserver(drawMask).observe(document.querySelector(".finale"));

  // Per-letter shatter vector: left letters blast left, right letters right,
  // with random spin/scale/vertical spread. Index-based so it doesn't depend on
  // layout timing (the section is off-screen when this builds).
  const shard = chars.map((_, i) => ({
    x: (i / (n - 1) - 0.5) * gsap.utils.random(520, 900) + gsap.utils.random(-60, 60),
    y: gsap.utils.random(-140, 380),
    rot: gsap.utils.random(-170, 170),
    scale: gsap.utils.random(0.2, 1.5),
  }));

  const closer = document.getElementById("closerVideo");

  // The break AUTO-PLAYS, timed to the walk — no precise scrubbing needed.
  // Real seconds: he walks up (0–2s), the letters break on "impact" (~2.1s),
  // then I walk through and the CTAs rise. It restarts each time you arrive.
  const tl = gsap.timeline({ paused: true, defaults: { ease: "none" } });

  gsap.set("#closerVideo", { transformOrigin: "50% 42%" });
  gsap.set("#finaleCtas", { opacity: 0, y: 30 });
  gsap.set(knock, { autoAlpha: 0 }); // shard layer waits for impact

  // initial states at t0 so a rewind (re-entry from above) resets the scene
  tl.set(mask, { opacity: 1, scale: 1 }, 0)
    .set(knock, { autoAlpha: 0 }, 0)
    .set(chars, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, filter: "blur(0px)" }, 0);

  // the clip is dark (avg luma ~32/255) — lift it while the cover is up so
  // the letter-holes glow, then ease back to natural after the break
  tl.fromTo("#closerVideo", { filter: "brightness(1.6) saturate(1.05)" },
    { filter: "brightness(1) saturate(1)", duration: 1.4, ease: "power2.inOut" }, 2.3);

  // he walks toward camera / into the letters
  tl.fromTo("#closerVideo", { scale: 1.05 }, { scale: 1.26, duration: 4.2, ease: "power1.inOut" }, 0);
  // tension tremble as he reaches the text (the whole cover shudders)
  tl.to(mask, { keyframes: { scale: [1, 1.012, 0.994, 1.008, 1] },
    duration: 1.0, ease: "sine.inOut", transformOrigin: "50% 50%" }, 1.2);
  // IMPACT flash the moment his head reaches the letters
  tl.fromTo(flash, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: "power2.out" }, 2.05)
    .to(flash, { opacity: 0, duration: 0.8, ease: "power2.in" }, 2.25);
  // under the flash: cover fades → full clip; shard heading takes over
  tl.to(mask, { opacity: 0, duration: 0.5, ease: "power2.out" }, 2.12)
    .set(knock, { autoAlpha: 1 }, 2.12);
  // letters shatter into glowing shards
  tl.to(chars, {
    x: (i) => shard[i].x, y: (i) => shard[i].y,
    rotation: (i) => shard[i].rot, scale: (i) => shard[i].scale,
    opacity: 0, filter: "blur(7px)", duration: 1.4, ease: "power2.in",
    stagger: { each: 0.016, from: "center" },
  }, 2.15);
  // CTAs rise as I walk through
  tl.to("#finaleCtas", { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, 3.7);

  // Reset the letters/matte so a re-entry can replay the break.
  const reset = () => { tl.pause(0); };

  // Short pin holds the scene while the break plays itself out; entering the
  // section restarts the walk (currentTime 0) and plays the sequence.
  ScrollTrigger.create({
    trigger: "#finale", start: "top top", end: "+=140%",
    pin: ".finale__stage", anticipatePin: 1,
    onEnter: () => { try { closer.currentTime = 0; } catch (e) {} closer.play().catch(() => {}); tl.restart(); },
    onEnterBack: () => { tl.play(); },
    onLeaveBack: reset,
  });

  attachVideoPlayback(closer, "#finale");
}

/* ────────────────────────────────────────────
   INTERACTIVITY LAYER
   ──────────────────────────────────────────── */
// Heavy fade-up + de-blur as elements enter the viewport (IntersectionObserver,
// not a scroll listener — no reflow churn). Staggered within each group.
function buildReveals() {
  gsap.utils.toArray(".reveal").forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    const idx = sibs.indexOf(el);
    if (idx > 0) el.style.transitionDelay = (idx * 0.08).toFixed(2) + "s";
    // ScrollTrigger (Lenis-driven) rather than IntersectionObserver so reveals
    // fire deterministically alongside the rest of the scroll system.
    ScrollTrigger.create({
      trigger: el, start: "top 88%", once: true,
      onEnter: () => el.classList.add("is-in"),
    });
  });
}

// FAQ accordion — GPU-friendly height animation, one open at a time.
function buildFaq() {
  const items = gsap.utils.toArray(".faq__item");
  items.forEach((item) => {
    const q = item.querySelector(".faq__q");
    const a = item.querySelector(".faq__a");
    q.addEventListener("click", () => {
      const willOpen = !item.classList.contains("is-open");
      items.forEach((other) => {
        if (other !== item && other.classList.contains("is-open")) {
          other.classList.remove("is-open");
          other.querySelector(".faq__q").setAttribute("aria-expanded", "false");
          gsap.to(other.querySelector(".faq__a"), { height: 0, duration: 0.5, ease: "power2.inOut" });
        }
      });
      item.classList.toggle("is-open", willOpen);
      q.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) {
        gsap.set(a, { height: "auto" });
        gsap.from(a, { height: 0, duration: 0.6, ease: "power2.out",
          onComplete: () => ScrollTrigger.refresh() });
      } else {
        gsap.to(a, { height: 0, duration: 0.5, ease: "power2.inOut",
          onComplete: () => ScrollTrigger.refresh() });
      }
    });
  });
}

// Magnetic hover — buttons drift toward the cursor and spring back.
function buildMagnetic() {
  if (window.matchMedia("(hover: none)").matches) return;
  document.querySelectorAll(".magnetic").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, {
        x: (e.clientX - r.left - r.width / 2) * 0.35,
        y: (e.clientY - r.top - r.height / 2) * 0.4,
        duration: 0.5, ease: "power3.out",
      });
    });
    el.addEventListener("mouseleave", () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" });
    });
  });
}

// Mobile menu — burger morphs to X, full-screen emerald reveal, links stagger.
function buildMobileMenu() {
  const burger = document.getElementById("navBurger");
  const menu = document.getElementById("mobileMenu");
  if (!burger || !menu) return;
  const setOpen = (open) => {
    document.body.classList.toggle("menu-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.setAttribute("aria-hidden", String(!open));
    open ? lenis.stop() : lenis.start();
  };
  burger.addEventListener("click", () => setOpen(!document.body.classList.contains("menu-open")));
  menu.querySelectorAll("a[href^='#']").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      setOpen(false);
      lenis.scrollTo(a.getAttribute("href"), { offset: 0, duration: 1.5 });
    });
  });
}

// Side telemetry rail: filling bar + live %, one dot per section that lights up
// when active and scrolls you there on click.
function buildRail() {
  const rail = document.getElementById("rail");
  const fill = document.getElementById("railFill");
  const pctEl = document.getElementById("railPct");
  const dotsWrap = document.getElementById("railDots");
  if (!rail) return;
  const map = [
    ["#hero", "Top"], ["#stats", "Numbers"], ["#pillars", "Pillars"], ["#future", "Future"],
    ["#work", "Work"], ["#caps", "Capabilities"], ["#process", "Process"], ["#trust", "Reviews"],
    ["#faq", "FAQ"], ["#finale", "Contact"],
  ];
  map.forEach(([sel, label]) => {
    const sec = document.querySelector(sel);
    if (!sec) return;
    const dot = document.createElement("button");
    dot.className = "rail__dot";
    dot.setAttribute("data-label", label);
    dot.setAttribute("aria-label", label);
    dot.addEventListener("click", () => lenis.scrollTo(sel, { offset: 0, duration: 1.4 }));
    dotsWrap.appendChild(dot);
    ScrollTrigger.create({
      trigger: sec, start: "top 50%", end: "bottom 50%",
      onToggle: (self) => dot.classList.toggle("is-active", self.isActive),
    });
  });
  lenis.on("scroll", ({ progress }) => {
    fill.style.height = (progress * 100).toFixed(1) + "%";
    pctEl.textContent = String(Math.round(progress * 100)).padStart(2, "0");
  });
}

// Cursor parallax on the hero — the orbit and type drift on opposite axes so
// the scene has depth even before you scroll.
function buildHeroParallax() {
  if (window.matchMedia("(hover: none)").matches) return;
  const stage = document.querySelector(".hero__stage");
  if (!stage) return;
  gsap.set(canvas, { scale: 1.07 }); // headroom so the parallax never shows edges
  const cX = gsap.quickTo(canvas, "x", { duration: 0.9, ease: "power3.out" });
  const cY = gsap.quickTo(canvas, "y", { duration: 0.9, ease: "power3.out" });
  const tX = gsap.quickTo(".hero__type", "x", { duration: 1.1, ease: "power3.out" });
  const tY = gsap.quickTo(".hero__type", "y", { duration: 1.1, ease: "power3.out" });
  stage.addEventListener("mousemove", (e) => {
    const dx = e.clientX / window.innerWidth - 0.5;
    const dy = e.clientY / window.innerHeight - 0.5;
    cX(dx * 34); cY(dy * 22);
    tX(dx * -20); tY(dy * -14);
  });
  stage.addEventListener("mouseleave", () => { cX(0); cY(0); tX(0); tY(0); });
}

// Soft section snap: when you coast to a stop NEAR a section boundary, settle
// onto it. Deliberately only engages within a third of a screen of a boundary,
// so stopping mid-orbit / mid-pin (far from any boundary) never yanks you.
function buildSnap() {
  // native touch scroll on phones — no snapping (it fights the finger)
  if (window.matchMedia("(hover: none)").matches) return;
  const getPoints = () =>
    gsap.utils.toArray("main > section, footer").map((s) => s.getBoundingClientRect().top + window.scrollY);
  let points = getPoints();
  ScrollTrigger.addEventListener("refresh", () => { points = getPoints(); });

  let idle, snapping = false;
  lenis.on("scroll", ({ velocity }) => {
    if (snapping) return;
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (Math.abs(velocity) > 12) return;
      const y = window.scrollY;
      let nearest = null, dist = Infinity;
      for (const p of points) { const d = Math.abs(p - y); if (d < dist) { dist = d; nearest = p; } }
      const threshold = window.innerHeight * 0.28;
      if (nearest != null && dist > window.innerHeight * 0.04 && dist < threshold) {
        snapping = true;
        lenis.scrollTo(nearest, {
          duration: 0.55, easing: (t) => 1 - Math.pow(1 - t, 3),
          onComplete: () => { snapping = false; },
        });
      }
    }, 150);
  });
}

// Nav link highlights the section currently in view.
function buildNavState() {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const sec = document.querySelector(link.getAttribute("href"));
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec, start: "top 45%", end: "bottom 45%",
      onToggle: (self) => link.classList.toggle("is-active", self.isActive),
    });
  });
}

// Testimonial wall — duplicate each column's cards once so the CSS keyframe
// (translateY to -50%) loops seamlessly.
function buildTwall() {
  document.querySelectorAll(".twall__track").forEach((track) => {
    [...track.children].forEach((card) => track.appendChild(card.cloneNode(true)));
  });
}

// Custom cursor: emerald dot + lagging ring. Ring grows on interactive
// elements and becomes a filled label chip where a context word is set.
function buildCursor() {
  if (window.matchMedia("(hover: none)").matches) return;
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  ring.innerHTML = '<span class="cursor-ring__label"></span>';
  document.body.append(dot, ring);
  document.body.classList.add("has-cursor");

  // context labels
  document.querySelector(".hero__stage")?.setAttribute("data-cursor", "SCAN");
  document.querySelectorAll(".wcard").forEach((c) => c.setAttribute("data-cursor", "VIEW"));

  const dx = gsap.quickTo(dot, "x", { duration: 0.08, ease: "power2.out" });
  const dy = gsap.quickTo(dot, "y", { duration: 0.08, ease: "power2.out" });
  const rx = gsap.quickTo(ring, "x", { duration: 0.35, ease: "power3.out" });
  const ry = gsap.quickTo(ring, "y", { duration: 0.35, ease: "power3.out" });
  window.addEventListener("mousemove", (e) => {
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
  });

  const label = ring.querySelector(".cursor-ring__label");
  const HOVER = "a, button, .faq__q, .tcard, .stat, .logos__item";
  document.addEventListener("mouseover", (e) => {
    const ctx = e.target.closest("[data-cursor]");
    const hov = e.target.closest(HOVER);
    if (ctx) { label.textContent = ctx.dataset.cursor; ring.classList.add("has-label"); }
    else ring.classList.remove("has-label");
    ring.classList.toggle("is-hover", !!hov && !ctx);
  });
}

// Text scramble on hover — nav links + platform names decode into place.
const SCRAMBLE_CHARS = "!<>-_/[]{}=+*^?#ΞΔΣΨΩ";
function buildScramble() {
  if (window.matchMedia("(hover: none)").matches) return;
  document.querySelectorAll(".nav__links a, .logos__item").forEach((el) => {
    const orig = el.textContent;
    let raf = 0;
    el.addEventListener("mouseenter", () => {
      cancelAnimationFrame(raf);
      let frame = 0;
      const total = 16;
      const tick = () => {
        frame++;
        el.textContent = [...orig].map((ch, i) => {
          if (ch === " ") return " ";
          return i < (frame / total) * orig.length
            ? ch
            : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
        }).join("");
        if (frame < total) raf = requestAnimationFrame(tick);
        else el.textContent = orig;
      };
      tick();
    });
    // never leave a link stuck mid-scramble
    el.addEventListener("mouseleave", () => {
      cancelAnimationFrame(raf);
      el.textContent = orig;
    });
  });
}

// 3D tilt — process cores lean toward the cursor (work cards translate
// horizontally, so tilting them would fight the gallery motion).
function buildTilt() {
  if (window.matchMedia("(hover: none)").matches) return;
  document.querySelectorAll(".pstep__inner").forEach((el) => {
    const rX = gsap.quickTo(el, "rotationX", { duration: 0.45, ease: "power2.out" });
    const rY = gsap.quickTo(el, "rotationY", { duration: 0.45, ease: "power2.out" });
    const lift = gsap.quickTo(el, "y", { duration: 0.45, ease: "power2.out" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      rY(((e.clientX - r.left) / r.width - 0.5) * 10);
      rX(-((e.clientY - r.top) / r.height - 0.5) * 8);
      lift(-8);
    });
    el.addEventListener("pointerleave", () => { rX(0); rY(0); lift(0); });
  });
}

// Sticky mobile CTA dock — slides in once the hero is passed (the nav CTA is
// display:none on phones, so without this a phone visitor has no conversion
// path until the finale).
function buildDock() {
  const dock = document.getElementById("ctaDock");
  if (!dock) return;
  ScrollTrigger.create({
    trigger: "#stats", start: "top 80%",
    onToggle: (self) => dock.classList.toggle("is-in", self.isActive || self.progress > 0),
  });
}

// Live Athens local time in the hero telemetry — ticks once a second.
function buildClock() {
  const el = document.getElementById("heroClock");
  if (!el) return;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const tick = () => { el.textContent = fmt.format(new Date()); };
  tick();
  setInterval(tick, 1000);
}

// Marquees skew with scroll velocity — type leans into the speed.
// Only writes when the target actually changes, so an idle page does zero work.
function buildMarqueeReact() {
  const skews = gsap.utils.toArray(".marquee").map((m) =>
    gsap.quickTo(m, "skewX", { duration: 0.4, ease: "power2.out" }));
  if (!skews.length) return;
  let last = 999;
  gsap.ticker.add(() => {
    const s = gsap.utils.clamp(-9, 9, (lenis.velocity || 0) * 0.09);
    if (Math.abs(s - last) < 0.05) return; // idle / unchanged → skip
    last = s;
    skews.forEach((set) => set(s));
  });
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
    buildCaps();
    buildProcess();
    buildTrust();
    buildFinale();
    buildTwall();
    buildReveals();
    buildFaq();
    buildMagnetic();
    buildNavState();
    buildSnap();
    buildRail();
    buildHeroParallax();
    buildMobileMenu();
    buildCursor();
    buildScramble();
    buildTilt();
    buildMarqueeReact();
    buildDock();
    buildClock();
    ScrollTrigger.refresh();

    // Now that the site is interactive, lazily fetch the helmet lens frames
    // (desktop only) — off the critical path, so first paint isn't blocked.
    loadHelmetFrames();

    // Keep the hero canvas crisp on resize. CRITICAL: observe the NON-pinned
    // parent and NEVER call ScrollTrigger.refresh() here — observing the pinned
    // stage + refreshing feeds back into ScrollTrigger's own pin box changes and
    // makes pin-spacers grow without bound. ScrollTrigger handles resize itself.
    const ro = new ResizeObserver(() => sizeCanvas());
    ro.observe(document.querySelector(".hero"));
    // One-shot pin recompute when a tab that booted hidden becomes visible.
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
