/**
 * display.js — Signage Display Player
 *
 * Changes in this version:
 *  1. Supports content_type: Image · Video · YouTube · Text Only
 *  2. Video slides auto-advance when video ends (or after duration)
 *  3. YouTube slides play with autoplay embed URL, advance after duration
 *  4. Heartbeat sent every 30 s to mark Screen as "Live Now" in ERPNext
 *  5. screen_id aware — fetches /display/<id> data if screen_id is set
 *  6. Dynamic slide rebuild on poll, same as before
 */

"use strict";

// ─── Config (injected by display.html → window._sd) ──────────────────────────
const SD = window._sd || {};

const SCREEN_ID        = SD.screenId || "";
const POLL_INTERVAL_MS = 30_000;   // refresh slide content every 30 s
const HEARTBEAT_MS     = 30_000;   // mark screen as live every 30 s

// API endpoints (matching signage.py whitelist)
const API_ALL_SIGNAGES    = "/api/method/signage_display.signage_display.doctype.signage.signage.get_all_signages";
const API_SCREEN_SIGNAGES = "/api/method/signage_display.signage_display.doctype.signage.signage.get_signages_for_screen";
const API_HEARTBEAT       = "/api/method/signage_display.signage_display.doctype.signage.signage.screen_heartbeat";

// ─── State ────────────────────────────────────────────────────────────────────
let swiper = null;
let _lastJson = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initSwiper();
  startPolling();
  if (SCREEN_ID) startHeartbeat();
});

// ─── Swiper init ─────────────────────────────────────────────────────────────
function initSwiper() {
  swiper = new Swiper(".sd-swiper", {
    speed: 1500,
    direction: "horizontal",
    autoplay: {
      delay: SD.displayDuration || 20000,
      disableOnInteraction: false,
    },
    slidesPerView: SD.columnCount || 1,
    grid: {
      rows: SD.rowCount || 1,
      fill: "row",
    },
    spaceBetween: 20,
    pagination: { el: ".swiper-pagination", clickable: true },
    loop: false,
  });

  swiper.on("autoplayStop", () => swiper.autoplay.start());

  // When a slide becomes active, handle video playback
  swiper.on("slideChangeTransitionEnd", handleActiveSlide);
}

// ─── Slide media handling ─────────────────────────────────────────────────────

/**
 * For the currently active slide:
 *  - If it has a <video>, play it and advance when it ends.
 *  - Pause any video on the previous slide.
 */
function handleActiveSlide() {
  if (!swiper) return;

  // Pause all videos first
  document.querySelectorAll(".sd-video").forEach(v => {
    v.pause();
    v.currentTime = 0;
  });

  const activeSlide = swiper.slides[swiper.activeIndex];
  if (!activeSlide) return;

  const video = activeSlide.querySelector("video.sd-video");
  if (video) {
    // Stop swiper autoplay so it doesn't fire before video ends
    swiper.autoplay.stop();

    video.currentTime = 0;
    video.play().catch(() => {});

    video.onended = () => {
      video.onended = null;
      goNext();
    };

    // Safety: if video stalls for > configured duration, advance anyway
    const maxWait = parseInt(activeSlide.dataset.swiperAutoplay) || (SD.displayDuration || 20000);
    setTimeout(() => {
      if (!video.ended) {
        video.onended = null;
        goNext();
      }
    }, maxWait);
  }
}

function goNext() {
  if (!swiper) return;
  const isLast = swiper.activeIndex >= swiper.slides.length - 1;
  if (isLast) {
    swiper.slideTo(0, 800);
  } else {
    swiper.slideNext(800);
  }
  swiper.autoplay.start();
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchSignages() {
  try {
    let url = SCREEN_ID
      ? `${API_SCREEN_SIGNAGES}?screen_id=${encodeURIComponent(SCREEN_ID)}`
      : API_ALL_SIGNAGES;

    const res = await fetch(url, {
      headers: {
        "X-Frappe-CSRF-Token": SD.csrfToken || "Guest",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.error("[SD] API error:", res.status);
      return null;
    }

    const data = await res.json();
    return data.message || [];
  } catch (err) {
    console.error("[SD] Fetch error:", err);
    return null;
  }
}

async function sendHeartbeat() {
  if (!SCREEN_ID) return;
  try {
    await fetch(
      `${API_HEARTBEAT}?screen_id=${encodeURIComponent(SCREEN_ID)}`,
      {
        method: "POST",
        headers: {
          "X-Frappe-CSRF-Token": SD.csrfToken || "Guest",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ screen_id: SCREEN_ID }),
      }
    );
  } catch (_) {
    // Heartbeat is best-effort — silent fail
  }
}

// ─── Slide builder ────────────────────────────────────────────────────────────

function buildSlide(s) {
  const type      = (s.content_type || "Image");
  const height    = (SD.signageHeight || 76) - 4;
  const duration  = s.display_duration
    ? s.display_duration * 1000
    : (SD.displayDuration || 20000);

  const titleHtml = s.show_title
    ? `<h1 class="card-title">${esc(s.title)}</h1>`
    : "";
  const descHtml  = s.description
    ? `<p class="card-text">${s.description}</p>`
    : "";

  let inner = "";

  if (type === "Image") {
    if (s.display_image) {
      inner = `
        <img src="${esc(s.display_image)}" class="card-img sd-img" alt="${esc(s.title)}" />
        <div class="card-img-overlay p-5">${titleHtml}${descHtml}</div>`;
    } else {
      inner = `<div class="card-body p-5">${titleHtml}${descHtml}</div>`;
    }

  } else if (type === "Video") {
    inner = `
      <video class="sd-video" src="${esc(s.video_file)}" muted playsinline data-slide-video="1"></video>
      ${(titleHtml || descHtml) ? `<div class="card-img-overlay p-5">${titleHtml}${descHtml}</div>` : ""}`;

  } else if (type === "YouTube") {
    inner = `
      <iframe class="sd-youtube"
        src="${esc(s.youtube_embed_url)}"
        allow="autoplay; encrypted-media; fullscreen"
        allowfullscreen frameborder="0">
      </iframe>`;

  } else if (type === "Text Only") {
    inner = `
      <div class="card-body p-5 sd-text-only">
        ${titleHtml}
        <div class="card-text">${s.description || ""}</div>
      </div>`;
  }

  return `
    <div class="swiper-slide" data-swiper-autoplay="${duration}">
      <div class="card sd-card" style="height:${height}vh;">
        ${inner}
      </div>
    </div>`;
}

function buildEmptySlide() {
  const height = (SD.signageHeight || 76) - 4;
  return `
    <div class="swiper-slide">
      <div class="card sd-card" style="height:${height}vh;">
        <div class="card-body p-5 d-flex align-items-center justify-content-center">
          <p class="text-muted" style="color:#888;">No published signages yet.</p>
        </div>
      </div>
    </div>`;
}

// ─── Refresh cycle ────────────────────────────────────────────────────────────

async function refreshSignages() {
  const signages = await fetchSignages();
  if (!signages) return;

  const json = JSON.stringify(signages);
  if (json === _lastJson) return;   // Nothing changed
  _lastJson = json;

  const prevIndex = swiper ? swiper.activeIndex : 0;

  swiper.autoplay.stop();
  swiper.removeAllSlides();

  if (signages.length === 0) {
    swiper.appendSlide(buildEmptySlide());
  } else {
    signages.forEach(s => swiper.appendSlide(buildSlide(s)));
  }

  swiper.update();
  swiper.slideTo(Math.min(prevIndex, swiper.slides.length - 1), 0);
  swiper.autoplay.start();
  handleActiveSlide();  // handle video on current slide after rebuild
}

// ─── Polling & heartbeat ──────────────────────────────────────────────────────

function startPolling() {
  refreshSignages();
  setInterval(refreshSignages, POLL_INTERVAL_MS);
}

function startHeartbeat() {
  sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_MS);
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
