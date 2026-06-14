/**
 * display.js — Signage Display Player
 *
 * FIXES vs original:
 *  1. frappe.call()     → fetch() with X-Frappe-CSRF-Token header
 *  2. frappe.realtime   → setInterval polling every 30 seconds
 *  3. autoPlay          → autoplay  (Swiper property was wrongly capitalised)
 *  4. All config read from window._sd (set by the Jinja template server-side)
 *     so no extra API call is needed just for settings on first load.
 */

"use strict";

// ─── Config injected by display.html (Jinja → window._sd) ────────────────────
const SD = window._sd || {};

const API_GET_SIGNAGES =
  "/api/method/signage_display.signage_display.doctype.signage.signage.get_all_signages";

// How often to poll for new/updated signages (ms). 30 s is a good balance.
const POLL_INTERVAL_MS = 30_000;

// ─── State ────────────────────────────────────────────────────────────────────
let swiper = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initSwiper();
  startPolling();
});

// ─── Swiper initialisation ────────────────────────────────────────────────────
function initSwiper() {
  swiper = new Swiper(".sd-swiper", {
    speed: 2000,
    direction: "horizontal",

    // FIX: was `autoPlay` (wrong case) — Swiper uses `autoplay` (lowercase)
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
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
    },
    loop: false,
  });

  // Restart autoplay if it ever stops (e.g. user interaction)
  swiper.on("autoplayStop", () => swiper.autoplay.start());
}

// ─── API helpers (plain fetch — no frappe.call dependency) ───────────────────

/**
 * Fetches all published signages from the whitelisted API method.
 * Returns an array of signage objects, or null on error.
 */
async function fetchSignages() {
  try {
    const res = await fetch(API_GET_SIGNAGES, {
      method: "GET",
      headers: {
        // FIX: frappe.csrf_token is NOT available on public pages in v15.
        //      We read it from window._sd.csrfToken (set by the Jinja template).
        "X-Frappe-CSRF-Token": SD.csrfToken || "Guest",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.error("[SignageDisplay] API error:", res.status, res.statusText);
      return null;
    }

    const data = await res.json();
    return data.message || [];
  } catch (err) {
    console.error("[SignageDisplay] Fetch error:", err);
    return null;
  }
}

// ─── Slide management ─────────────────────────────────────────────────────────

/**
 * Replaces all slides in the Swiper instance with freshly fetched signages.
 * Only re-renders if the data has actually changed (compares JSON).
 */
let _lastSignagesJson = null;

async function refreshSignages() {
  const signages = await fetchSignages();
  if (!signages) return; // network error — keep existing slides

  const json = JSON.stringify(signages);
  if (json === _lastSignagesJson) return; // nothing changed
  _lastSignagesJson = json;

  const signageHeight = SD.signageHeight || 76;

  swiper.autoplay.stop();
  swiper.removeAllSlides();

  if (signages.length === 0) {
    swiper.appendSlide(buildEmptySlide(signageHeight));
  } else {
    signages.forEach((s) => swiper.appendSlide(buildSlide(s, signageHeight)));
  }

  swiper.update();
  swiper.slideTo(0, 0); // jump back to first slide
  swiper.autoplay.start();
}

function buildSlide(signage, height) {
  const titleHtml = signage.show_title
    ? `<h1 class="card-title">${escapeHtml(signage.title)}</h1>`
    : "";

  const descHtml = signage.description
    ? `<p class="card-text">${signage.description}</p>`
    : "";

  const innerHtml = signage.display_image
    ? `<img src="${escapeHtml(signage.display_image)}" class="card-img" alt="${escapeHtml(signage.title)}" />
       <div class="card-img-overlay p-5">${titleHtml}${descHtml}</div>`
    : `<div class="card-body p-5">${titleHtml}${descHtml}</div>`;

  return `
    <div class="swiper-slide" data-swiper-autoplay="${SD.displayDuration || 20000}">
      <div class="card sd-card" style="height:${height - 4}vh;">
        ${innerHtml}
      </div>
    </div>`;
}

function buildEmptySlide(height) {
  return `
    <div class="swiper-slide">
      <div class="card sd-card" style="height:${height - 4}vh;">
        <div class="card-body p-5 d-flex align-items-center justify-content-center">
          <p class="text-muted">No published signages yet.</p>
        </div>
      </div>
    </div>`;
}

// ─── Polling (replaces frappe.realtime / Socket.IO) ──────────────────────────

/**
 * FIX: frappe.realtime.on() is a Desk-only feature and is NOT available on
 * public /www pages in Frappe v15.
 *
 * We replace it with a simple setInterval poll.  30 seconds means the display
 * will pick up changes within half a minute — perfectly fine for signage.
 * If you need near-instant updates, see the README note on WebSockets.
 */
function startPolling() {
  // Fetch immediately on load, then every POLL_INTERVAL_MS
  refreshSignages();
  setInterval(refreshSignages, POLL_INTERVAL_MS);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
