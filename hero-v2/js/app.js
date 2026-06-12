/* ───────────────────────── EMDEN DESIGN — CINEMATIC HERO V2 ───────────────────────── */
gsap.registerPlugin(ScrollTrigger);

/* ── NATIVE SCROLL (no smooth-scroll glide) — ScrollTrigger drives directly ── */

/* ── CONSTANTS ── */
const FRAME_COUNT = 1210;    // 30fps extraction — every native frame of the source video
const FRAME_SPEED = 1.44;    // film completes at same absolute scroll as before the rescale
const IMAGE_SCALE = 1.0;     // full-bleed cover — video fills the whole screen
const FRAME_PATH = (i) => `${window.FRAMES_BASE || 'frames30/'}frame_${String(i + 1).padStart(4, "0")}.webp`;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasWrap = document.getElementById("canvas-wrap");
const heroSection = document.getElementById("hero");
const scrollContainer = document.getElementById("scroll-container");
const loader = document.getElementById("loader");
const loaderFill = document.getElementById("loader-fill");
const loaderPercent = document.getElementById("loader-percent");

const frames = new Array(FRAME_COUNT);
let currentFrame = -1;

/* ── CANVAS SIZING (devicePixelRatio for crisp rendering) ── */
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}
sizeCanvas();

/* ── 6c. CANVAS RENDERER — full-bleed cover mode ──
   The frame is drawn in cover mode (Math.max scale) so it always fills the
   whole canvas; no letterbox, so no per-frame pixel sampling is needed. The
   static fill is just a safety backdrop for any sub-pixel edge. */
function blitFrame(img) {
  const cw = canvas.width, ch = canvas.height;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

function drawFrame(index) {
  const img = frames[index];
  if (!img || !img.complete || !img.naturalWidth) return false;
  blitFrame(img);
  return true;
}

/* Sub-frame renderer: draws the floor frame, then the next frame on top with
   the fractional position as opacity. At 30fps density adjacent frames are
   nearly identical, so the blend reads as continuous motion — the canvas
   never visibly "snaps" from one frame to the next during the glide. */
function drawFramePos(pos) {
  const i0 = Math.floor(pos);
  const i1 = Math.min(i0 + 1, FRAME_COUNT - 1);
  const frac = pos - i0;
  const a = frames[i0];
  if (!a || !a.complete || !a.naturalWidth) return false;
  ctx.globalAlpha = 1;
  blitFrame(a);
  const b = frames[i1];
  if (frac > 0.01 && i1 !== i0 && b && b.complete && b.naturalWidth) {
    ctx.globalAlpha = frac;
    blitFrame(b);
    ctx.globalAlpha = 1;
  }
  return true;
}

window.addEventListener("resize", () => {
  sizeCanvas();
  if (currentFrame >= 0) drawFrame(currentFrame);
  lastDrawnPos = -1; // force the render loop to repaint the blended position
}, { passive: true });

/* ── 6b. FRAME PRELOADER — two-phase, early reveal ──
   With 807 frames we don't hold the visitor hostage for the full set: reveal
   once the opening stretch is in, and stream the rest in the background while
   they're reading the hero. */
let loadedCount = 0;
const REVEAL_AT = 135; // frames loaded before the loader releases (~4.5s of film)
function onFrameLoaded() {
  loadedCount++;
  const gate = Math.min(loadedCount / REVEAL_AT, 1);
  loaderFill.style.transform = `scaleX(${gate})`;
  loaderPercent.textContent = Math.round(gate * 100) + "%";
  if (loadedCount === 1) drawFrame(0);
  if (loadedCount === REVEAL_AT) {
    loader.classList.add("hidden");
    introReveal();
  }
}
function loadFrame(i) {
  const img = new Image();
  img.onload = onFrameLoaded;
  img.onerror = onFrameLoaded; // never wedge the loader on a bad frame
  img.src = FRAME_PATH(i);
  frames[i] = img;
}
// MOBILE: skip the heavy 403-frame scrub (memory/decode jank on iOS). Instead
// play the looping hero video, hide the loader, and reveal the intro. Desktop
// keeps the two-phase frame preloader.
const isMobile = window.matchMedia("(max-width: 768px)").matches;
if (isMobile) {
  const mv = document.getElementById("hero-mobile-video");
  if (mv) {
    mv.play().catch(() => {});
    // Wait for loader to finish fading (0.7s), then fade video in — prevents
    // a bright-frame flash from showing through the semi-transparent hero scrim.
    setTimeout(() => { mv.style.opacity = "1"; }, 700);
  }
  loader.classList.add("hidden");
  introReveal();
} else {
  // phase 1: first 10 frames immediately (fast first paint)
  for (let i = 0; i < 10; i++) loadFrame(i);
  // phase 2: the rest in background
  setTimeout(() => { for (let i = 10; i < FRAME_COUNT; i++) loadFrame(i); }, 60);
}

/* ── HERO INTRO — fade in once loaded ── */
function introReveal() {
  gsap.fromTo(".hero-heading",
    { opacity: 0 },
    { opacity: 1, duration: 1.5, ease: "power2.out", delay: 0.15 });
  gsap.fromTo(".hero-tagline, .scroll-indicator",
    { opacity: 0 },
    { opacity: 1, duration: 1.3, stagger: 0.18, ease: "power2.out", delay: 0.55 });
}

/* ── 6d. FRAME-TO-SCROLL BINDING — Apple-style smoothed scrub ──
   The page scroll stays 100% native (no glide). But instead of snapping the
   canvas to the scroll position, scroll only sets a TARGET frame; a continuous
   render loop eases the drawn frame toward that target every display frame.
   The film glides through intermediate frames and settles in ~150ms — this
   per-frame catch-up is what Apple's product pages do. Scrubbing direction
   reverses instantly because the target updates instantly. */
let targetPos = 0;   // float frame position the scroll wants
let renderPos = 0;   // float frame position actually shown (chases target)
let lastTick = performance.now();
const SMOOTH = 0.12; // catch-up rate per 60Hz tick (higher = snappier)

ScrollTrigger.create({
  trigger: scrollContainer,
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    const accelerated = Math.min(self.progress * FRAME_SPEED, 1);
    targetPos = accelerated * (FRAME_COUNT - 1);
  }
});

let lastDrawnPos = -1;
function renderLoop(now) {
  // dt-normalised lerp so 60Hz and 120Hz displays ease at the same speed
  const dt = Math.min(now - lastTick, 100);
  lastTick = now;
  const k = 1 - Math.pow(1 - SMOOTH, dt / 16.67);
  renderPos += (targetPos - renderPos) * k;
  if (Math.abs(targetPos - renderPos) < 0.02) renderPos = targetPos; // settle
  // redraw whenever the (fractional) position moved meaningfully
  if (Math.abs(renderPos - lastDrawnPos) > 0.003 && drawFramePos(renderPos)) {
    lastDrawnPos = renderPos;
    currentFrame = Math.round(renderPos);
  }
  requestAnimationFrame(renderLoop);
}
if (!isMobile) requestAnimationFrame(renderLoop);

/* ── HERO REVEAL: simple cross-fade into the film ── */
ScrollTrigger.create({
  trigger: scrollContainer,
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    const p = self.progress;
    // fade the hero title out, revealing the film beneath. On mobile use a
    // longer fade so the first frame blends gently into the stats section
    // rather than snapping off.
    const heroFade = isMobile ? 0.22 : 0.08;
    heroSection.style.opacity = Math.max(0, 1 - p / heroFade);
    heroSection.style.pointerEvents = p > 0.02 ? "none" : "";
  }
});

/* ── 6e. SECTION ANIMATION SYSTEM ── */
const ANIMATIONS = {
  "fade-up":     (tl, kids) => tl.from(kids, { y: 50, opacity: 0, stagger: 0.12, duration: 0.9, ease: "power3.out" }),
  "slide-left":  (tl, kids) => tl.from(kids, { x: -80, opacity: 0, stagger: 0.14, duration: 0.9, ease: "power3.out" }),
  "slide-right": (tl, kids) => tl.from(kids, { x: 80, opacity: 0, stagger: 0.14, duration: 0.9, ease: "power3.out" }),
  "scale-up":    (tl, kids) => tl.from(kids, { scale: 0.85, opacity: 0, stagger: 0.12, duration: 1.0, ease: "power2.out" }),
  "rotate-in":   (tl, kids) => tl.from(kids, { y: 40, rotation: 3, opacity: 0, stagger: 0.1, duration: 0.9, ease: "power3.out" }),
  "stagger-up":  (tl, kids) => tl.from(kids, { y: 60, opacity: 0, stagger: 0.15, duration: 0.8, ease: "power3.out" }),
  "clip-reveal": (tl, kids) => tl.from(kids, { clipPath: "inset(100% 0 0 0)", opacity: 0, stagger: 0.15, duration: 1.2, ease: "power4.inOut" }),
};

document.querySelectorAll(".scroll-section").forEach((section) => {
  const isStats = section.classList.contains("section-stats");
  let enter = parseFloat(section.dataset.enter) / 100;
  let leave = parseFloat(section.dataset.leave) / 100;
  const persist = section.dataset.persist === "true";
  const type = section.dataset.animation || "fade-up";

  // On mobile the 4 villa title sections are hidden (CSS); bring the stats in
  // early so scrolling past the hero goes straight to the numbers.
  if (isMobile && isStats) { enter = 0.30; leave = 1.0; }

  // Position so the section is vertically CENTERED in the viewport when scroll
  // progress hits the midpoint of its range. Use the live container/viewport
  // size so this works for both the tall desktop container and the short mobile one.
  const mid = persist ? 1.0 : (enter + leave) / 2;
  const ch = scrollContainer.offsetHeight, vpx = window.innerHeight;
  section.style.top = (((mid * (ch - vpx) + vpx / 2) / ch) * 100) + "%";

  const tl = gsap.timeline({ paused: true });
  if (section.classList.contains("section-stats")) {
    // stats: fade the stat blocks in (counters animate via the counter system)
    tl.from(section.querySelectorAll(".stat"),
      { opacity: 0, stagger: 0.12, duration: 0.9, ease: "power2.out" });
  } else {
    // content: fade the whole panel — overlay + title + sub-title — in together
    tl.from(section.querySelector(".section-inner"),
      { opacity: 0, duration: 1.1, ease: "power2.out" });
  }

  let played = false;
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      const inRange = p >= enter && p <= leave;
      if (inRange && !played) { played = true; tl.play(); }
      else if (!inRange && played && !persist) { played = false; tl.reverse(); }
    }
  });
});

/* ── 6f. COUNTER ANIMATIONS ── */
document.querySelectorAll(".stat-number").forEach((el) => {
  const target = parseFloat(el.dataset.value);
  const decimals = parseInt(el.dataset.decimals || "0");
  const statsSection = el.closest(".scroll-section");
  const enter = isMobile ? 0.30 : parseFloat(statsSection.dataset.enter) / 100;
  let counted = false;
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      if (!counted && self.progress >= enter) {
        counted = true;
        gsap.fromTo(el, { textContent: 0 }, {
          textContent: target,
          duration: 2,
          ease: "power1.out",
          snap: { textContent: decimals === 0 ? 1 : 0.01 },
        });
      } else if (counted && self.progress < enter - 0.04) {
        counted = false;
        el.textContent = "0";
      }
    }
  });
});

/* ── 6g. HORIZONTAL TEXT MARQUEE ── */
document.querySelectorAll(".marquee-wrap").forEach((el) => {
  const speed = parseFloat(el.dataset.scrollSpeed) || -25;
  gsap.to(el.querySelector(".marquee-text"), {
    xPercent: speed,
    ease: "none",
    scrollTrigger: { trigger: scrollContainer, start: "top top", end: "bottom bottom", scrub: true }
  });
  // fade the marquee in after the hero, out before the stats overlay
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      let o = 0;
      if (p > 0.06 && p < 0.10) o = (p - 0.06) / 0.04;
      else if (p >= 0.10 && p < 0.56) o = 1;
      else if (p >= 0.56 && p < 0.62) o = 1 - (p - 0.56) / 0.06;
      el.style.opacity = o;
    }
  });
});

/* ── 6h. DARK OVERLAY (stats section) ── */
(function initDarkOverlay(enter, leave) {
  const overlay = document.getElementById("dark-overlay");
  // On mobile: keep the hero first-frame airy (overlay near-zero), then ramp
  // the overlay up to a deep dark by the time the stats (1998) section is in
  // view, so that section sits on a much darker background.
  if (isMobile) {
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        // Smoothly blend the airy first frame into the stats section. Hold a
        // mid darkness so the video still breathes through behind 1998.
        // 0–8% airy, then a long eased (smoothstep) ramp to 0.6, hold 0.6.
        const HOLD = 0.6;
        let o;
        if (p <= 0.08) {
          o = 0.04;
        } else if (p < 0.5) {
          const t = (p - 0.08) / 0.42;          // 0..1 across the blend
          const eased = t * t * (3 - 2 * t);    // smoothstep for a soft curve
          o = 0.04 + eased * (HOLD - 0.04);
        } else {
          o = HOLD;
        }
        overlay.style.opacity = o.toFixed(3);
      }
    });
    return;
  }
  const fadeRange = 0.04;
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      let opacity = 0;
      if (p >= enter - fadeRange && p <= enter) opacity = (p - (enter - fadeRange)) / fadeRange;
      else if (p > enter && p < leave) opacity = 1;
      else if (p >= leave && p <= leave + fadeRange) opacity = 1 - (p - leave) / fadeRange;
      overlay.style.opacity = (opacity * 0.95).toFixed(3);
    }
  });
})(0.80, 1.0);

/* ── NAV: solid background once scrolled ── */
const nav = document.getElementById("nav");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 40);
}, { passive: true });

/* ── BELOW-CONTENT: reveal-on-scroll (same as main site) ── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); revealObs.unobserve(e.target); }
  });
}, { threshold: 0.14 });
document.querySelectorAll(".reveal").forEach((el) => revealObs.observe(el));

/* ── DISC CARD images ── */
document.querySelectorAll(".disc-card").forEach((card) => {
  const img = card.querySelector(".c-img");
  const url = card.dataset.img;
  const [a, b] = card.dataset.fb.split(",");
  const probe = new Image();
  probe.onload  = () => img.style.backgroundImage = `url(${url})`;
  probe.onerror = () => img.style.background = `linear-gradient(140deg,${a},${b})`;
  probe.src = url;
});

/* ── MOBILE HAMBURGER MENU ── */
(function () {
  const hamburger = document.querySelector('.nav-hamburger');
  const mobileMenu = document.querySelector('.nav-mobile-menu');
  if (!hamburger || !mobileMenu) return;
  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
  });
  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
})();

/* ── GALLERY captions ── */
document.querySelectorAll(".tile").forEach((t) => {
  const c = document.createElement("div");
  c.className = "cap";
  c.innerHTML = `<small>${t.dataset.cat}</small><p>${t.dataset.cap}</p>`;
  t.appendChild(c);
});
