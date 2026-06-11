/* ───────────────────────── EMDEN DESIGN — CINEMATIC HERO V2 ───────────────────────── */
gsap.registerPlugin(ScrollTrigger);

/* ── NATIVE SCROLL (no smooth-scroll glide) — ScrollTrigger drives directly ── */

/* ── CONSTANTS ── */
const FRAME_COUNT = 403;
const FRAME_SPEED = 1.44;    // film completes at same absolute scroll as before the rescale
const IMAGE_SCALE = 1.0;     // full-bleed cover — video fills the whole screen
const FRAME_PATH = (i) => `${window.FRAMES_BASE || 'frames/'}frame_${String(i + 1).padStart(4, "0")}.webp`;

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
let bgColor = "#0c0a09";
let lastSampledBucket = -1;

/* ── CANVAS SIZING (devicePixelRatio for crisp rendering) ── */
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}
sizeCanvas();

/* ── BG COLOR SAMPLING from frame corners ── */
const sampleCanvas = document.createElement("canvas");
sampleCanvas.width = 32; sampleCanvas.height = 16;
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

function sampleBgColor(img) {
  try {
    sampleCtx.drawImage(img, 0, 0, 32, 16);
    const corners = [
      sampleCtx.getImageData(0, 0, 1, 1).data,
      sampleCtx.getImageData(31, 0, 1, 1).data,
      sampleCtx.getImageData(0, 15, 1, 1).data,
      sampleCtx.getImageData(31, 15, 1, 1).data,
    ];
    let r = 0, g = 0, b = 0;
    corners.forEach(c => { r += c[0]; g += c[1]; b += c[2]; });
    bgColor = `rgb(${Math.round(r / 4)},${Math.round(g / 4)},${Math.round(b / 4)})`;
  } catch (e) { /* keep previous color */ }
}

/* ── 6c. CANVAS RENDERER — padded cover mode ── */
function drawFrame(index) {
  const img = frames[index];
  if (!img || !img.complete || !img.naturalWidth) return;

  const bucket = Math.floor(index / 20);
  if (bucket !== lastSampledBucket) { lastSampledBucket = bucket; sampleBgColor(img); }

  const cw = canvas.width, ch = canvas.height;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
  const dw = iw * scale, dh = ih * scale;
  const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
}

window.addEventListener("resize", () => {
  sizeCanvas();
  if (currentFrame >= 0) drawFrame(currentFrame);
}, { passive: true });

/* ── 6b. FRAME PRELOADER — two-phase ── */
let loadedCount = 0;
function onFrameLoaded() {
  loadedCount++;
  const pct = Math.round((loadedCount / FRAME_COUNT) * 100);
  loaderFill.style.transform = `scaleX(${loadedCount / FRAME_COUNT})`;
  loaderPercent.textContent = pct + "%";
  if (loadedCount === 1) drawFrame(0);
  if (loadedCount === FRAME_COUNT) {
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
  if (mv) { mv.play().catch(() => {}); }
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

/* ── 6d. FRAME-TO-SCROLL BINDING ── */
ScrollTrigger.create({
  trigger: scrollContainer,
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    const accelerated = Math.min(self.progress * FRAME_SPEED, 1);
    const index = Math.min(Math.floor(accelerated * FRAME_COUNT), FRAME_COUNT - 1);
    if (index !== currentFrame) {
      currentFrame = index;
      requestAnimationFrame(() => drawFrame(currentFrame));
    }
  }
});

/* ── HERO REVEAL: simple cross-fade into the film ── */
ScrollTrigger.create({
  trigger: scrollContainer,
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    const p = self.progress;
    // fade the hero title out over the first ~8% of scroll, revealing the film
    // (already in motion as the frames advance) beneath it.
    heroSection.style.opacity = Math.max(0, 1 - p / 0.08);
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
})(isMobile ? 0.25 : 0.80, 1.0);

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
