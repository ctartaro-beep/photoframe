// ==========================================================================
// Family Photo Frame — app logic
// Full-time slideshow of photos pulled from a public Google Drive folder,
// with a small clock/date overlay in the corner.
// ==========================================================================

(function () {
  "use strict";

  const CFG = window.CONFIG;

  let photos = [];
  let photoIndex = -1;
  let activePhotoEl = "a";

  // ---------------------------------------------------------------- clock

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function updateClock() {
    const now = new Date();
    let h = now.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    document.getElementById("clock").textContent = `${h}:${pad(now.getMinutes())} ${ampm}`;
    document.getElementById("date").textContent = now.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric",
    });
  }

  // --------------------------------------------------------------- photos

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Builds the caption lines (date taken, description, etc.) for one photo.
  function buildCaption(f) {
    const meta = f.imageMediaMetadata || {};
    const lines = [];

    // EXIF time looks like "2019:08:14 15:22:10"; fall back to upload time.
    let when = null;
    if (meta.time) {
      const m = meta.time.match(/^(\d{4}):(\d{2}):(\d{2})/);
      if (m) when = new Date(+m[1], +m[2] - 1, +m[3]);
    }
    if (!when && f.createdTime) when = new Date(f.createdTime);
    if (when && !isNaN(when)) {
      lines.push(when.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }));
    }

    if (f.description) lines.push(f.description);
    if (CFG.SHOW_FILENAME) lines.push(f.name);
    if (CFG.SHOW_CAMERA && meta.cameraModel) {
      lines.push([meta.cameraMake, meta.cameraModel].filter(Boolean).join(" "));
    }
    return lines.join("\n");
  }

  async function fetchPhotos() {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("key", CFG.GOOGLE_API_KEY);
    url.searchParams.set(
      "q",
      `'${CFG.DRIVE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`
    );
    url.searchParams.set("fields", "files(id,name,description,createdTime,imageMediaMetadata(time,cameraMake,cameraModel,location))");
    url.searchParams.set("pageSize", "1000");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Drive API ${res.status}`);
    const data = await res.json();

    const files = data.files || [];
    if (files.length === 0) throw new Error("No images found in the Drive folder.");

    photos = shuffle(files.map((f) => ({
      url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1920-h1200`,
      caption: buildCaption(f),
    })));
    setStatus("");
  }

  function showPhotoAtOffset(offset) {
    if (photos.length === 0) return;
    photoIndex = (photoIndex + offset + photos.length) % photos.length;

    const showEl = document.getElementById(activePhotoEl === "a" ? "photo-a" : "photo-b");
    const hideEl = document.getElementById(activePhotoEl === "a" ? "photo-b" : "photo-a");

    showEl.src = photos[photoIndex].url;
    document.getElementById("caption").textContent = photos[photoIndex].caption;
    showEl.onload = () => {
      showEl.classList.add("visible");
      hideEl.classList.remove("visible");
    };

    activePhotoEl = activePhotoEl === "a" ? "b" : "a";
  }

  function showNextPhoto() { showPhotoAtOffset(1); }
  function showPreviousPhoto() { showPhotoAtOffset(-1); }

  function setStatus(msg) {
    document.getElementById("status-line").textContent = msg;
  }

  // -------------------------------------------------------------- wakelock

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        await navigator.wakeLock.request("screen");
      }
    } catch (err) {
      // Not fatal — the tablet's own "Stay Awake" developer setting is the
      // primary way this display stays on.
      console.warn("Wake Lock unavailable:", err);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestWakeLock();
  });

  // ---------------------------------------------------------------- boot

  let slideshowTimer = null;
  let paused = false;

  function restartAutoAdvance() {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
    if (!paused) {
      slideshowTimer = setInterval(showNextPhoto, CFG.PHOTO_INTERVAL_SECONDS * 1000);
    }
  }

  async function loadAndStart() {
    try {
      await fetchPhotos();
      showNextPhoto();
      restartAutoAdvance();
    } catch (err) {
      setStatus("Couldn't load photos — check config.js and the Drive folder sharing settings.");
      console.error(err);
    }
  }

  // -------------------------------------------------------------- gestures
  //
  // Single tap / swipe left  -> next photo
  // Swipe right              -> previous photo
  // Double tap                -> toggle the clock/date overlay
  // Press and hold (~500ms)   -> pause/resume the slideshow
  //
  // Single tap and double tap both start as a "tap" (little movement, quick
  // release), so a single tap is held for DOUBLE_TAP_MS to see whether a
  // second tap follows before deciding which action it was.

  const SWIPE_THRESHOLD_PX = 40;
  const HOLD_MS = 500;
  const DOUBLE_TAP_MS = 300;

  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerStartTime = 0;
  let holdTimer = null;
  let holdFired = false;
  let pendingTapTimer = null;
  let lastTapTime = 0;

  function setPaused(next) {
    paused = next;
    document.getElementById("pause-indicator").classList.toggle("visible", paused);
    restartAutoAdvance();
  }

  // Clock and caption are toggled independently, and the choice is
  // remembered across restarts (best-effort; storage can be unavailable).
  function savePref(key, hidden) {
    try { localStorage.setItem(key, hidden ? "hidden" : "shown"); } catch (e) {}
  }

  function loadPref(key, defaultHidden) {
    try {
      const v = localStorage.getItem(key);
      if (v) return v === "hidden";
    } catch (e) {}
    return defaultHidden;
  }

  function toggleClock() {
    const hidden = document.getElementById("overlay").classList.toggle("hidden");
    savePref("clockHidden", hidden);
  }

  function toggleCaption() {
    const hidden = document.getElementById("caption").classList.toggle("hidden");
    savePref("captionHidden", hidden);
  }

  function applySavedPrefs() {
    document.getElementById("overlay").classList.toggle("hidden", loadPref("clockHidden", false));
    document.getElementById("caption").classList.toggle(
      "hidden",
      loadPref("captionHidden", !CFG.CAPTION_ON_BY_DEFAULT)
    );
  }

  function onPointerDown(e) {
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerStartTime = Date.now();
    holdFired = false;

    holdTimer = setTimeout(() => {
      holdFired = true;
      setPaused(!paused);
    }, HOLD_MS);
  }

  function onPointerUp(e) {
    clearTimeout(holdTimer);
    if (holdFired) return; // the long-press already handled this gesture

    const dx = e.clientX - pointerStartX;
    const dy = e.clientY - pointerStartY;

    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      // Swipe
      if (dx < 0) showNextPhoto(); else showPreviousPhoto();
      restartAutoAdvance();
      return;
    }

    // Tap — wait briefly to see if it becomes a double-tap
    const now = Date.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      clearTimeout(pendingTapTimer);
      lastTapTime = 0;
      // Double-tap left half = caption, right half = clock.
      if (e.clientX < window.innerWidth / 2) toggleCaption(); else toggleClock();
    } else {
      lastTapTime = now;
      pendingTapTimer = setTimeout(() => {
        showNextPhoto();
        restartAutoAdvance();
      }, DOUBLE_TAP_MS);
    }
  }

  function initGestures() {
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", () => clearTimeout(holdTimer));
    // Stops the browser's native "drag this image" behavior from hijacking
    // mouse-drag swipes (touch isn't affected by this, but a mouse is).
    document.addEventListener("dragstart", (e) => e.preventDefault());
  }

  function init() {
    updateClock();
    setInterval(updateClock, 15000);

    loadAndStart();
    setInterval(() => fetchPhotos().catch((err) => console.error(err)), CFG.PHOTOS_REFRESH_MINUTES * 60 * 1000);

    applySavedPrefs();
    initGestures();
    requestWakeLock();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
