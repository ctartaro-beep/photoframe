// ==========================================================================
// Family Photo Frame — app logic
// Full-time slideshow of photos pulled from a public Google Drive folder,
// with a small clock/date overlay in the corner.
//
// Orientation: the same deploy serves landscape and portrait frames from one
// Drive folder. Set CONFIG.ORIENTATION, or override per device with a query
// string:
//     .../photoframe/              -> whatever config.js says
//     .../photoframe/?o=portrait   -> portrait photos only
//     .../photoframe/?o=landscape  -> landscape photos only
//     .../photoframe/?o=auto       -> match the screen's current shape, and
//                                     re-match when it's rotated or resized
// ==========================================================================

(function () {
  "use strict";

  const CFG = window.CONFIG;

  let allFiles = [];   // everything in the Drive folder, unfiltered
  // The current round: every photo for this screen, once each, in shuffled
  // order. photoIndex is how far through it we are. Photos are file objects
  // straight from Drive.
  let photos = [];
  let photoIndex = -1;
  let round = 1;
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

  // ---------------------------------------------------------- orientation

  // A ?o= query string beats config.js, so one deploy can feed two tablets.
  function orientationSetting() {
    const q = new URLSearchParams(window.location.search);
    return (q.get("o") || q.get("orientation") || CFG.ORIENTATION || "any")
      .toString().trim().toLowerCase();
  }

  function screenOrientation() {
    return window.innerWidth >= window.innerHeight ? "landscape" : "portrait";
  }

  function wantedOrientation() {
    const v = orientationSetting();
    if (v === "auto") return screenOrientation();
    return (v === "portrait" || v === "landscape") ? v : "any";
  }

  // Drive reports the dimensions of the STORED image plus a rotation count.
  // An odd rotation means the photo displays turned on its side, so the
  // stored width and height are swapped relative to what you actually see.
  // Skip this and a large share of portraits get treated as landscape.
  // Width ÷ height as the photo is meant to be seen (rotation applied).
  function ratioOf(f) {
    const meta = f.imageMediaMetadata || {};
    let w = meta.width;
    let h = meta.height;
    if (!w || !h) return null;
    if (meta.rotation === 1 || meta.rotation === 3) { const t = w; w = h; h = t; }
    return w / h;
  }

  // How much of a photo the screen will crop away (0 = none, 0.25 = a
  // quarter), since photos are scaled to fill the whole screen.
  function cropOf(f) {
    const r = ratioOf(f);
    if (!r) return 1;
    const s = window.innerWidth / window.innerHeight;
    return 1 - Math.min(r, s) / Math.max(r, s);
  }

  function orientationOf(f) {
    const meta = f.imageMediaMetadata || {};
    let w = meta.width;
    let h = meta.height;
    if (!w || !h) return null; // Drive couldn't read it (some PNGs, odd files)
    if (meta.rotation === 1 || meta.rotation === 3) { const t = w; w = h; h = t; }
    return w >= h ? "landscape" : "portrait"; // square counts as landscape
  }

  // Ask Drive for a thumbnail box that suits the photo's own shape. The old
  // fixed w1920-h1200 box capped portraits at 1200 tall, which is noticeably
  // soft on a tablet mounted in portrait.
  function thumbUrl(f) {
    const box = orientationOf(f) === "portrait" ? "w1280-h1920" : "w1920-h1280";
    if (f.thumb) return f.thumb.replace(/=s\d+(-[a-z]+)?$/, "=" + box);
    return `https://drive.google.com/thumbnail?id=${f.id}&sz=${box}`;
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

  // Drive returns at most 1000 files per call. That was fine when every photo
  // was used; once we filter by orientation, stopping at the first page could
  // silently cut the album short. So follow nextPageToken.
  // ------------------------------------------------------- private mode
  //
  // With CONFIG.SCRIPT_URL set, photos come from a PRIVATE Drive folder via
  // a Google Apps Script in the owner's account (apps-script/Code.gs). The
  // script only answers requests carrying the passcode, which each device
  // asks for once and then remembers.

  const PRIVATE = !!CFG.SCRIPT_URL;
  const PASS_KEY = "photoframe:passcode";

  function storedPasscode() {
    try { return localStorage.getItem(PASS_KEY) || ""; } catch (e) { return ""; }
  }
  function storePasscode(v) {
    try { v ? localStorage.setItem(PASS_KEY, v) : localStorage.removeItem(PASS_KEY); } catch (e) {}
  }

  // Shows the passcode screen and resolves with whatever is entered.
  function askPasscode(message) {
    return new Promise((resolve) => {
      let box = document.getElementById("passcode-screen");
      if (!box) {
        box = document.createElement("form");
        box.id = "passcode-screen";
        box.setAttribute("autocomplete", "off");
        box.style.cssText = "position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;" +
          "align-items:center;justify-content:center;gap:16px;background:#000;color:#ddd;" +
          "font:16px/1.4 -apple-system,system-ui,sans-serif;";
        box.innerHTML =
          '<div style="font-size:22px;letter-spacing:.04em">photoframe</div>' +
          '<div id="passcode-msg" style="opacity:.7;min-height:1.4em"></div>' +
          '<input id="passcode-input" type="password" inputmode="text" autocapitalize="off" ' +
          'style="font-size:22px;padding:10px 14px;width:min(320px,80vw);border-radius:8px;' +
          'border:1px solid #444;background:#111;color:#fff;text-align:center" placeholder="Passcode">' +
          '<button type="submit" style="font-size:18px;padding:10px 28px;border-radius:8px;' +
          'border:0;background:#ddd;color:#000">Unlock</button>';
        // Keep taps and keys on this screen from reaching the slideshow.
        ["pointerdown", "pointerup", "keydown"].forEach((t) =>
          box.addEventListener(t, (e) => e.stopPropagation()));
        document.body.appendChild(box);
      }
      box.style.display = "flex";
      document.getElementById("passcode-msg").textContent = message || "Enter the passcode to show photos";
      const input = document.getElementById("passcode-input");
      input.value = "";
      setTimeout(() => input.focus(), 50);
      box.onsubmit = (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        box.style.display = "none";
        resolve(v);
      };
    });
  }

  // Calls the script with the passcode, asking for it (again) when needed.
  async function callScript(payload) {
    let pass = storedPasscode();
    let message = "";
    for (;;) {
      if (!pass) pass = await askPasscode(message);
      // Sent as text/plain so the browser makes a simple request the
      // Apps Script web app accepts (no CORS preflight).
      const res = await fetch(CFG.SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(Object.assign({ pass }, payload)),
      });
      if (!res.ok) throw new Error(`Photo script ${res.status}`);
      const data = await res.json();
      if (data.error === "passcode") {
        storePasscode("");
        pass = "";
        message = "That passcode didn't work. Try again.";
        continue;
      }
      if (data.error === "locked") {
        throw new Error("Too many wrong passcodes. Wait 15 minutes, then reload.");
      }
      if (data.error) throw new Error(data.message || `Photo script error: ${data.error}`);
      storePasscode(pass);
      return data;
    }
  }

  // If a thumbnail link won't load, fetch the image through the script.
  async function loadViaScript(img, f) {
    try {
      const box = orientationOf(f) === "portrait" ? "w1280-h1920" : "w1920-h1280";
      const data = await callScript({ img: f.id, box });
      if (data.data) img.src = `data:${data.type || "image/jpeg"};base64,${data.data}`;
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchAllFiles() {
    if (PRIVATE) {
      const data = await callScript({});
      return data.files || [];
    }
    const all = [];
    let pageToken = null;

    do {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("key", CFG.GOOGLE_API_KEY);
      url.searchParams.set(
        "q",
        `'${CFG.DRIVE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`
      );
      // width/height/rotation are what make the orientation filter possible.
      url.searchParams.set(
        "fields",
        "nextPageToken,files(id,name,description,createdTime," +
        "imageMediaMetadata(time,cameraMake,cameraModel,location,width,height,rotation))"
      );
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Drive API ${res.status}`);
      const data = await res.json();

      all.push.apply(all, data.files || []);
      pageToken = data.nextPageToken || null;
    } while (pageToken && all.length < 10000); // sanity bound

    return all;
  }

  let builtFor = null; // which orientation the current playlist was built for

  // ------------------------------------------------------------ the round
  //
  // Photos are dealt like a deck of cards: each one once, in random order,
  // then a fresh shuffle for the next round. Checking the folder for changes
  // never reshuffles: new photos are slipped into the part of the round
  // that's still to come, and deleted ones drop out. Progress is saved, so a
  // reload (or the tablet restarting) carries on where it left off.

  function wantedFiles() {
    const want = wantedOrientation();
    let kept = want === "any"
      ? allFiles
      : allFiles.filter((f) => orientationOf(f) === want);

    if (kept.length === 0) {
      // In auto mode an empty match just means the folder has none of this
      // shape yet; show everything rather than a blank screen.
      if (orientationSetting() !== "auto") {
        throw new Error(
          `Found ${allFiles.length} photos but none are ${want}. ` +
          `Check the ?o= value, or whether Drive reported dimensions for these files.`
        );
      }
      kept = allFiles;
    }

    // CONFIG.MAX_CROP (or ?crop=0.1 in the address): skip photos whose shape
    // is so different from the screen's that filling it would cut off more
    // than this fraction. ?crop=1 turns it off.
    const q = new URLSearchParams(window.location.search).get("crop");
    const maxCrop = q !== null ? parseFloat(q) : CFG.MAX_CROP;
    if (maxCrop > 0 && maxCrop < 1) {
      const fits = kept.filter((f) => cropOf(f) <= maxCrop + 1e-9);
      // On an unusually shaped screen almost nothing may fit; then the filter
      // would gut the slideshow, so show everything instead.
      if (fits.length >= kept.length * 0.25) kept = fits;
    }
    return kept;
  }

  function roundKey() {
    return `${PREF_PREFIX}round:${CFG.DRIVE_FOLDER_ID}:${builtFor}`;
  }

  function saveRound() {
    try {
      localStorage.setItem(roundKey(), JSON.stringify({
        round,
        index: photoIndex,
        order: photos.map((f) => f.id),
      }));
    } catch (e) {} // storage full or blocked: the round just won't survive a reload
  }

  function loadRound() {
    try { return JSON.parse(localStorage.getItem(roundKey()) || "null"); }
    catch (e) { return null; }
  }

  // Puts each new photo at a random spot among the ones still to come.
  function slipIn(list, fromIndex, newcomers) {
    for (const f of shuffle(newcomers)) {
      const at = fromIndex + 1 + Math.floor(Math.random() * (list.length - fromIndex));
      list.splice(at, 0, f);
    }
  }

  // Brings the round in line with what's in the folder now. With `fresh`,
  // starts from saved progress (page load, or the screen changed shape).
  function buildPlaylist(fresh) {
    const files = wantedFiles();
    const want = wantedOrientation();
    const byId = new Map(files.map((f) => [f.id, f]));

    let order, index;
    if (fresh) {
      builtFor = want;
      const saved = loadRound();
      if (saved && Array.isArray(saved.order)) {
        order = saved.order;
        index = saved.index;
        round = saved.round || 1;
      } else {
        order = [];
        index = -1;
        round = 1;
      }
    } else {
      order = photos.map((f) => f.id);
      index = photoIndex;
    }

    // Drop photos that left the folder, keeping our place.
    const kept = [];
    let newIndex = -1;
    order.forEach((id, i) => {
      if (!byId.has(id)) return;
      kept.push(byId.get(id));
      if (i <= index) newIndex = kept.length - 1;
    });

    const known = new Set(kept.map((f) => f.id));
    const newcomers = files.filter((f) => !known.has(f.id));

    if (kept.length === 0) {
      photos = shuffle(newcomers.slice());
      photoIndex = -1;
    } else {
      photos = kept;
      photoIndex = newIndex;
      slipIn(photos, photoIndex, newcomers);
    }
    saveRound();
    updateStats();
  }

  // Starts the next round once every photo has had its turn.
  function newRound() {
    const last = photos[photos.length - 1];
    photos = shuffle(photos.slice());
    // Don't open the new round with the photo that just closed the last one.
    if (photos.length > 1 && photos[0] === last) {
      const j = 1 + Math.floor(Math.random() * (photos.length - 1));
      [photos[0], photos[j]] = [photos[j], photos[0]];
    }
    photoIndex = -1;
    round += 1;
  }

  async function fetchPhotos(fresh) {
    const files = await fetchAllFiles();
    if (files.length === 0) throw new Error("No images found in the Drive folder.");
    allFiles = files;
    buildPlaylist(fresh);
    if (!showStats) setStatus("");
  }

  // Auto mode: when a rotation or window resize flips the screen's shape,
  // swap to the matching round straight away instead of waiting for the
  // next refresh.
  let resizeTimer = null;
  function onResize() {
    if (orientationSetting() !== "auto" || allFiles.length === 0) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (wantedOrientation() === builtFor) return;
      buildPlaylist(true);
      showNextPhoto();
      restartAutoAdvance();
    }, 300);
  }

  function showPhotoAtOffset(offset) {
    if (photos.length === 0) return;
    let next = photoIndex + offset;
    if (next >= photos.length) {
      newRound();
      next = 0;
    } else if (next < 0) {
      next = photos.length - 1; // stepping back past the start wraps
    }
    photoIndex = next;
    saveRound();
    updateStats();

    const f = photos[photoIndex];
    const showEl = document.getElementById(activePhotoEl === "a" ? "photo-a" : "photo-b");
    const hideEl = document.getElementById(activePhotoEl === "a" ? "photo-b" : "photo-a");

    showEl.src = thumbUrl(f);
    document.getElementById("caption").textContent = buildCaption(f);
    // christartaro.com/photoframe loads its own music.js, which listens for
    // this to retune its ambient music. Nothing here listens for it.
    document.dispatchEvent(new CustomEvent("photoframe:photo", { detail: f }));
    showEl.onload = () => {
      showEl.classList.add("visible");
      hideEl.classList.remove("visible");
    };
    showEl.onerror = PRIVATE && !showEl.src.startsWith("data:")
      ? () => { showEl.onerror = null; loadViaScript(showEl, f); }
      : null;

    activePhotoEl = activePhotoEl === "a" ? "b" : "a";
  }

  // ----------------------------------------------------------- progress
  //
  // Press "i" (or add ?stats to the address) to see how far through the
  // round the frame is: "Round 2 · 37 of 212 shown".
  let showStats = /[?&]stats\b/.test(window.location.search);

  function updateStats() {
    if (!showStats) return;
    const shown = Math.max(0, photoIndex + 1);
    const label = builtFor && builtFor !== "any" ? ` ${builtFor}` : "";
    setStatus(`Round ${round} · ${shown} of ${photos.length}${label} shown`);
  }

  function toggleStats() {
    showStats = !showStats;
    if (showStats) updateStats(); else setStatus("");
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
      await fetchPhotos(true);
      showNextPhoto();
      restartAutoAdvance();
    } catch (err) {
      setStatus(PRIVATE
        ? (err.message.startsWith("Too many") ? err.message : "Couldn't load photos from the photo script. Check SCRIPT_URL in config.js.")
        : "Couldn't load photos — check config.js and the Drive folder sharing settings.");
      console.error(err);
    }
  }

  // -------------------------------------------------------------- gestures
  //
  // Single tap / swipe left  -> next photo
  // Swipe right              -> previous photo
  // Double tap                -> left half: caption; right half: clock/date
//                              (top strip: music on/off, on pages that
//                              load music.js)
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
  // Frames that share an origin (the family frame and any sub-frame) keep
  // their toggles apart via CONFIG.STORAGE_PREFIX (optional; the family frame
  // has none, so its existing saved choices still apply).
  const PREF_PREFIX = CFG.STORAGE_PREFIX || "";

  function savePref(key, hidden) {
    try { localStorage.setItem(PREF_PREFIX + key, hidden ? "hidden" : "shown"); } catch (e) {}
  }

  function loadPref(key, defaultHidden) {
    try {
      const v = localStorage.getItem(PREF_PREFIX + key);
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
    document.getElementById("overlay").classList.toggle(
      "hidden",
      loadPref("clockHidden", CFG.CLOCK_ON_BY_DEFAULT === false)
    );
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
      // Double-tap top strip = music; otherwise left half = caption,
      // right half = clock.
      if (e.clientY < window.innerHeight * 0.25 && window.photoMusic) window.photoMusic.toggle();
      else if (e.clientX < window.innerWidth / 2) toggleCaption();
      else toggleClock();
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

  // -------------------------------------------------------------- keyboard
  //
  // Left/Right (or Up/Down, PageUp/PageDown) step through photos.
  // Space pauses — the touch equivalent is press-and-hold, which a keyboard
  // has no way to do.
  //
  // PageUp/PageDown are here because a Bluetooth presentation clicker sends
  // those, which turns a $20 remote into a control for the wall frame.

  function onKeyDown(e) {
    // Ignore auto-repeat from a held key. Each press starts a fresh image
    // load, so holding one down would hammer Drive's thumbnail endpoint.
    if (e.repeat) return;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
        showNextPhoto();
        restartAutoAdvance();
        break;

      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        showPreviousPhoto();
        restartAutoAdvance();
        break;

      case " ":
      case "Spacebar":
        setPaused(!paused);
        break;

      case "i":
      case "I":
        toggleStats();
        break;

      case "m":
      case "M":
        if (window.photoMusic) window.photoMusic.toggle();
        break;

      default:
        return;  // leave every other key alone
    }
    e.preventDefault();
  }

  function initKeyboard() {
    document.addEventListener("keydown", onKeyDown);
  }

  function init() {
    updateClock();
    setInterval(updateClock, 15000);

    loadAndStart();
    // Pick up added/removed photos without disturbing the round in progress.
    setInterval(() => fetchPhotos(false).catch((err) => console.error(err)), CFG.PHOTOS_REFRESH_MINUTES * 60 * 1000);

    applySavedPrefs();
    window.addEventListener("resize", onResize);
    initGestures();
    initKeyboard();
    requestWakeLock();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
