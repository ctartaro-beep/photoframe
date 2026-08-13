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

  async function fetchPhotos() {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("key", CFG.GOOGLE_API_KEY);
    url.searchParams.set(
      "q",
      `'${CFG.DRIVE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`
    );
    url.searchParams.set("fields", "files(id,name)");
    url.searchParams.set("pageSize", "1000");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Drive API ${res.status}`);
    const data = await res.json();

    const files = data.files || [];
    if (files.length === 0) throw new Error("No images found in the Drive folder.");

    photos = shuffle(files.map((f) => `https://drive.google.com/thumbnail?id=${f.id}&sz=w1920-h1200`));
    setStatus("");
  }

  function showNextPhoto() {
    if (photos.length === 0) return;
    photoIndex = (photoIndex + 1) % photos.length;

    const showEl = document.getElementById(activePhotoEl === "a" ? "photo-a" : "photo-b");
    const hideEl = document.getElementById(activePhotoEl === "a" ? "photo-b" : "photo-a");

    showEl.src = photos[photoIndex];
    showEl.onload = () => {
      showEl.classList.add("visible");
      hideEl.classList.remove("visible");
    };

    activePhotoEl = activePhotoEl === "a" ? "b" : "a";
  }

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

  async function loadAndStart() {
    try {
      await fetchPhotos();
      if (!slideshowTimer) {
        showNextPhoto();
        slideshowTimer = setInterval(showNextPhoto, CFG.PHOTO_INTERVAL_SECONDS * 1000);
      }
    } catch (err) {
      setStatus("Couldn't load photos — check config.js and the Drive folder sharing settings.");
      console.error(err);
    }
  }

  function init() {
    updateClock();
    setInterval(updateClock, 15000);

    loadAndStart();
    setInterval(() => fetchPhotos().catch((err) => console.error(err)), CFG.PHOTOS_REFRESH_MINUTES * 60 * 1000);

    requestWakeLock();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
