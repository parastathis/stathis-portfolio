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

// A clip plays a full viewport BEFORE its section arrives and keeps playing
// until a full viewport AFTER it leaves — so it's always already running when
// you look at it (no on-scroll stutter), but distant sections stop decoding.
// Without this, all 5 clips decode simultaneously forever = the main lag.
function attachVideoPlayback(video, trigger) {
  if (!video) { console.warn("attachVideoPlayback: missing video for", trigger); return; }
  video.muted = true;
  video.loop = true;
  const st = ScrollTrigger.create({
    trigger,
    start: "top bottom+=100%",
    end: "bottom top-=100%",
    onToggle: (self) => { self.isActive ? video.play().catch(() => {}) : video.pause(); },
  });
  playbackVideos.push({ video, st });
}

// Watchdog: if the browser aborts a near-screen clip, resume it (throttled).
let watchdogAt = 0;
gsap.ticker.add((time) => {
  if (time - watchdogAt < 1) return;
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
    if (t - jarvisWatch < 1) return;
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
  // the wall itself enters via .reveal; badges pop in below it
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

  // "THE CLOSER" clip pushes in cinematically as he walks toward camera and
  // lands his hero pose — the frame tightens on him across the whole pin.
  gsap.set("#closerVideo", { transformOrigin: "50% 40%" });
  tl.fromTo("#closerVideo", { scale: 1.08 }, { scale: 1.28, duration: 6.5, ease: "none" }, 0);

  tl.to(".finale__word", { opacity: 1, yPercent: 0, duration: 1.1, stagger: 0.07, ease: "power1.out" }, 0.2)
    .to("#finaleCtas", { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 1.2)
    .to({}, { duration: 4 }, 2); // hold on the hero pose while screens flare

  attachVideoPlayback(document.getElementById("closerVideo"), "#finale");
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
  document.querySelectorAll(".card").forEach((c) => c.setAttribute("data-cursor", "VIEW"));

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

// 3D tilt — work cards and process cores lean toward the cursor.
function buildTilt() {
  if (window.matchMedia("(hover: none)").matches) return;
  document.querySelectorAll(".card, .pstep__inner").forEach((el) => {
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
    buildTrust();
    buildFinale();
    buildTwall();
    buildReveals();
    buildFaq();
    buildMagnetic();
    buildNavState();
    buildMobileMenu();
    buildCursor();
    buildScramble();
    buildTilt();
    buildMarqueeReact();
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
