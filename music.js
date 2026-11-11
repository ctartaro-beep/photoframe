// ==========================================================================
// Family Photo Frame — generative ambient music
//
// Two layers, both synthesized live in the browser (no audio files):
//
//   1. An Eno-style engine. A drone holds the key's root. A soft pad holds a
//      chord. Six "bell" loops repeat at different, unrelated lengths
//      (13.1s, 16.7s, 19.9s...), so they drift in and out of phase and the
//      piece never lines up the same way twice.
//
//   2. The photos steer it. Each time a photo appears, a tiny 24x24 copy is
//      read and turned into a "mood":
//        warmth (red vs blue)      -> mode: aeolian ... dorian ... lydian
//        dominant hue              -> which chord (I, IV, V, vi, ii, iii)
//        brightness                -> how open the pad's filter is
//        saturation                -> how often the bells ring, and how loud
//        haze (low contrast)       -> more reverb
//        age (EXIF year)           -> tape wobble, and a little hiss
//      The pad crossfades over a few seconds, so changes feel like weather,
//      not cuts.
//
// Browsers won't start sound until someone touches the page. If audio is
// blocked, a small "Tap for sound" pill appears; that first tap only turns
// the sound on (it doesn't skip the photo).
//
// Controls: double-tap the top of the screen, or press "m", to turn music
// on/off. ?music=off / ?music=on in the address overrides the saved choice.
// ==========================================================================

(function () {
  "use strict";

  // ------------------------------------------------------------ the music

  const MODES = {
    aeolian:    [0, 2, 3, 5, 7, 8, 10],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    ionian:     [0, 2, 4, 5, 7, 9, 11],
    lydian:     [0, 2, 4, 6, 7, 9, 11],
  };
  const MODE_ORDER = ["aeolian", "dorian", "mixolydian", "ionian", "lydian"]; // cool -> warm
  const KEYS = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6,
                 Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };

  // Loop lengths for the bells, in seconds. Unrelated numbers on purpose.
  const LOOP_SECONDS = [13.1, 16.7, 19.9, 23.3, 29.7, 31.9];
  const CROSSFADE_SECONDS = 6;

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function reverbImpulse(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    return buf;
  }

  function noiseBuffer(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Works with a live AudioContext or an OfflineAudioContext (for renders).
  function Engine(ctx, out, opts) {
    const keyRoot = KEYS[opts.key] !== undefined ? KEYS[opts.key] : 2;
    const volume = opts.volume !== undefined ? opts.volume : 0.5;

    // Signal chain:  pad -> filter -+
    //                bells ---------+-> mix -> dry ------+-> compressor -> master -> out
    //                drone ---------+       -> reverb -> wet -+
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3;
    comp.attack.value = 0.05; comp.release.value = 0.6;
    const makeup = ctx.createGain(); makeup.gain.value = 3;
    const master = ctx.createGain();
    master.gain.value = 0;
    comp.connect(makeup); makeup.connect(master); master.connect(out);

    const dry = ctx.createGain(); dry.gain.value = 0.75; dry.connect(comp);
    const verb = ctx.createConvolver(); verb.buffer = reverbImpulse(ctx, 3.8);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    verb.connect(wet); wet.connect(comp);
    const mix = ctx.createGain(); mix.connect(dry); mix.connect(verb);

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass"; padFilter.frequency.value = 900; padFilter.Q.value = 0.6;
    const padBus = ctx.createGain(); padBus.connect(padFilter); padFilter.connect(mix);
    const bellBus = ctx.createGain(); bellBus.gain.value = 0.7; bellBus.connect(mix);

    // Tape wobble: one slow LFO bends the pitch of everything, in cents.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.31;
    const wobble = ctx.createGain(); wobble.gain.value = 3;
    lfo.connect(wobble);

    // Hiss for old photos.
    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = noiseBuffer(ctx, 2); hissSrc.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "bandpass"; hissFilter.frequency.value = 5000; hissFilter.Q.value = 0.4;
    const hiss = ctx.createGain(); hiss.gain.value = 0;
    hissSrc.connect(hissFilter); hissFilter.connect(hiss); hiss.connect(comp);

    // Drone on the root, two octaves down, the same for every photo.
    const droneGain = ctx.createGain(); droneGain.gain.value = 0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass"; droneFilter.frequency.value = 500;
    droneGain.connect(droneFilter); droneFilter.connect(mix);
    const droneOscs = [[36 + keyRoot, "sine", 0.55], [48 + keyRoot, "triangle", 0.16]].map(([m, type, lvl]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m);
      wobble.connect(o.detune);
      const g = ctx.createGain(); g.gain.value = lvl;
      o.connect(g); g.connect(droneGain);
      return o;
    });

    let pad = null;
    let chord = null;
    let chordKey = "";
    let density = 0.6;
    let bellLevel = 0.7;
    let loops = [];
    let running = false;

    function startPad(notes, t, attack) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.setTargetAtTime(1, t, attack / 3);
      g.connect(padBus);
      const oscs = [];
      notes.forEach((n, i) => {
        const pan = ctx.createStereoPanner();
        pan.pan.value = [-0.45, 0.35, -0.2, 0.5][i % 4];
        pan.connect(g);
        [["sawtooth", -6, 0.02], ["triangle", 5, 0.05]].forEach(([type, det, lvl]) => {
          const o = ctx.createOscillator();
          o.type = type; o.frequency.value = mtof(n);
          o.detune.value = det + (Math.random() * 4 - 2);
          wobble.connect(o.detune);
          const og = ctx.createGain(); og.gain.value = lvl;
          o.connect(og); og.connect(pan);
          o.start(t);
          oscs.push(o);
        });
      });
      return {
        stop(t2, release) {
          g.gain.cancelScheduledValues(t2);
          g.gain.setTargetAtTime(0, t2, release / 3);
          oscs.forEach((o) => o.stop(t2 + release * 1.6));
        },
      };
    }

    function bell(n, t, vel) {
      const f = mtof(n);
      const car = ctx.createOscillator(); car.frequency.value = f;
      const mod = ctx.createOscillator(); mod.frequency.value = f * (Math.random() < 0.7 ? 2 : 3.01);
      const modDepth = ctx.createGain();
      modDepth.gain.setValueAtTime(f * 1.1 * vel, t);
      modDepth.gain.setTargetAtTime(f * 0.04, t, 0.5);
      mod.connect(modDepth); modDepth.connect(car.frequency);
      wobble.connect(car.detune);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.085 * vel, t + 0.04);
      env.gain.setTargetAtTime(0, t + 0.04, 1.7);
      const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.4 - 0.7;
      car.connect(env); env.connect(pan); pan.connect(bellBus);
      car.start(t); mod.start(t);
      car.stop(t + 9); mod.stop(t + 9);
    }

    function chordFor(mood) {
      const scale = MODES[MODE_ORDER[mood.mode]] || MODES.ionian;
      const base = 48 + keyRoot; // pad sits around octave 3
      const note = (i) => base + 12 * Math.floor(i / 7) + scale[((i % 7) + 7) % 7];
      const d = mood.degree;
      // Open voicing: root, fifth, then the third and seventh an octave up.
      let notes = [note(d), note(d + 4), note(d + 9), note(d + 13)];
      if (d >= 4) notes = notes.map((n) => n - 12);
      return notes;
    }

    // The bells play "their" chord tone, an octave or two above the pad,
    // so each loop is a fixed melody that recolors as the chord changes.
    function bellNote(slot) {
      let n = chord[slot % chord.length] + (slot < 3 ? 12 : 24);
      while (n < 64) n += 12;
      while (n > 91) n -= 12;
      return n;
    }

    return {
      start(t) {
        running = true;
        lfo.start(t);
        hissSrc.start(t);
        droneOscs.forEach((o) => o.start(t));
        droneGain.gain.setTargetAtTime(0.11, t, 2);
        master.gain.setTargetAtTime(volume, t, 1.5);
        loops = LOOP_SECONDS.map((p, i) => ({ p, slot: i, next: t + 3 + i * 2.3 + Math.random() * 3 }));
        if (!chord) this.setMood(DEFAULT_MOOD, t);
      },

      // Schedule bell notes up to tEnd. Call often (every ~250ms) with a
      // small lookahead; Web Audio's clock does the precise timing.
      scheduleUntil(tEnd) {
        if (!running || !chord) return;
        const now = ctx.currentTime;
        for (const v of loops) {
          // After a pause, skip missed notes instead of playing them all at once.
          while (v.next < now) v.next += v.p;
          while (v.next < tEnd) {
            if (Math.random() < density) {
              bell(bellNote(v.slot), v.next, (0.55 + Math.random() * 0.45) * bellLevel);
            }
            v.next += v.p;
          }
        }
      },

      setMood(mood, t) {
        const notes = chordFor(mood);
        const key = notes.join(",");
        if (key !== chordKey) {
          const next = startPad(notes, t, chord ? CROSSFADE_SECONDS : 4);
          if (pad) pad.stop(t, CROSSFADE_SECONDS);
          pad = next;
          chord = notes;
          chordKey = key;
        }
        const ageDim = clamp(1 - mood.age / 120, 0.6, 1);
        padFilter.frequency.setTargetAtTime((350 + Math.pow(mood.brightness, 1.5) * 2600) * ageDim, t, 2);
        wet.gain.setTargetAtTime(0.35 + mood.haze * 0.45, t, 2);
        dry.gain.setTargetAtTime(0.85 - mood.haze * 0.25, t, 2);
        wobble.gain.setTargetAtTime(2 + Math.min(mood.age, 60) * 0.35, t, 3);
        hiss.gain.setTargetAtTime(mood.age > 10 ? Math.min(0.012, (mood.age - 10) * 0.0004) : 0, t, 3);
        bellLevel = 0.45 + mood.saturation * 0.55;
        density = 0.35 + mood.saturation * 0.6;
      },

      setVolume(v, t) { master.gain.setTargetAtTime(v, t, 0.8); },
    };
  }

  const DEFAULT_MOOD = { mode: 3, degree: 0, brightness: 0.5, saturation: 0.5, haze: 0.5, age: 5 };

  // ------------------------------------------------ reading each photo

  function hue6(r, g, b, max, min) {
    const c = max - min;
    let h;
    if (max === r) h = ((g - b) / c) % 6;
    else if (max === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    return (h + 6) % 6; // 0 red, 1 yellow, 2 green, 3 cyan, 4 blue, 5 magenta
  }

  // Hue -> chord: red I, yellow IV, green V, cyan vi, blue ii, magenta iii.
  const HUE_TO_DEGREE = [0, 3, 4, 5, 1, 2];

  function yearsOld(f) {
    const t = (f.imageMediaMetadata || {}).time;
    const m = t && t.match(/^(\d{4})/);
    if (!m) return 5;
    return Math.max(0, new Date().getFullYear() - +m[1]);
  }

  function moodFromPixels(img, f) {
    const W = 24, H = 24;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data; // throws if the image is cross-origin tainted

    const n = W * H;
    const hueBins = [0, 0, 0, 0, 0, 0];
    let L = 0, L2 = 0, S = 0, RB = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i] / 255, gr = px[i + 1] / 255, b = px[i + 2] / 255;
      const max = Math.max(r, gr, b), min = Math.min(r, gr, b);
      const l = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      const s = max > 0 ? (max - min) / max : 0;
      L += l; L2 += l * l; S += s; RB += r - b;
      if (s > 0.25 && max > 0.15) hueBins[Math.floor(hue6(r, gr, b, max, min)) % 6] += s;
    }
    const brightness = L / n;
    const contrast = Math.sqrt(Math.max(0, L2 / n - brightness * brightness));
    const warmth = RB / n;

    let degree = 0, best = 0;
    hueBins.forEach((v, i) => { if (v > best) { best = v; degree = HUE_TO_DEGREE[i]; } });
    if (best < n * 0.03) degree = 0; // basically colorless: stay home

    return {
      mode: Math.min(4, Math.floor(clamp((warmth + 0.12) / 0.24, 0, 1) * 5)),
      degree,
      brightness: clamp(brightness, 0, 1),
      saturation: clamp((S / n) / 0.45, 0, 1),
      haze: clamp(1 - contrast / 0.28, 0, 1),
      age: yearsOld(f),
    };
  }

  // If the pixels can't be read, still give each photo its own consistent
  // mood, using its ID and what time of day it was taken.
  function moodFromMetadata(f) {
    let h = 0;
    for (let i = 0; i < f.id.length; i++) h = (h * 31 + f.id.charCodeAt(i)) >>> 0;
    const t = (f.imageMediaMetadata || {}).time;
    const hour = t ? +(t.match(/ (\d{2}):/) || [0, 12])[1] : 12;
    return {
      mode: h % 5,
      degree: [0, 3, 4, 5][(h >>> 3) % 4],
      brightness: hour >= 7 && hour <= 18 ? 0.6 : 0.25,
      saturation: 0.5,
      haze: 0.5,
      age: yearsOld(f),
    };
  }

  const moodCache = new Map();

  function moodFor(f) {
    if (moodCache.has(f.id)) return Promise.resolve(moodCache.get(f.id));
    return new Promise((resolve) => {
      let done = false;
      const finish = (m) => {
        if (done) return;
        done = true;
        moodCache.set(f.id, m);
        resolve(m);
      };
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try { finish(moodFromPixels(img, f)); } catch (e) { finish(moodFromMetadata(f)); }
      };
      img.onerror = () => finish(moodFromMetadata(f));
      setTimeout(() => finish(moodFromMetadata(f)), 6000);
      // Straight to Google's image host: it allows cross-origin reads, while
      // the drive.google.com/thumbnail redirect in front of it doesn't.
      img.src = `https://lh3.googleusercontent.com/d/${f.id}=w64`;
    });
  }

  // ---------------------------------------------------- on the frame

  // Exposed so a preview can be rendered offline with the same engine.
  window.PhotoMusicEngine = { Engine, MODE_ORDER, moodFor };

  const CFG = window.CONFIG || {};
  const PREFIX = CFG.STORAGE_PREFIX || "";
  const PREF_KEY = PREFIX + "music";

  let ctx = null;
  let engine = null;
  let enabled = initialEnabled();
  let currentFile = null;
  let moodToken = 0;
  let swallowPointerUp = false;
  let pill = null;
  let pillTimer = null;

  function initialEnabled() {
    const q = new URLSearchParams(window.location.search).get("music");
    if (q === "on" || q === "off") return q === "on";
    try {
      const v = localStorage.getItem(PREF_KEY);
      if (v) return v === "on";
    } catch (e) {}
    return CFG.MUSIC_ON_BY_DEFAULT !== false;
  }

  function audioRunning() { return !!ctx && ctx.state === "running"; }

  function ensureEngine() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: "playback" });
    engine = Engine(ctx, ctx.destination, {
      key: CFG.MUSIC_KEY || "D",
      volume: CFG.MUSIC_VOLUME !== undefined ? CFG.MUSIC_VOLUME : 0.5,
    });
    engine.start(ctx.currentTime + 0.1);
    setInterval(() => { if (enabled && audioRunning()) engine.scheduleUntil(ctx.currentTime + 1.2); }, 250);
    ctx.onstatechange = updatePill;
    if (currentFile) onPhoto(currentFile);
  }

  function onPhoto(f) {
    currentFile = f;
    if (!engine || !enabled) return;
    const token = ++moodToken;
    moodFor(f).then((m) => {
      if (token !== moodToken) return; // a newer photo took over
      engine.setMood(m, ctx.currentTime + 0.05);
    });
  }

  function savePref() {
    try { localStorage.setItem(PREF_KEY, enabled ? "on" : "off"); } catch (e) {}
  }

  function toggle() {
    enabled = !enabled;
    savePref();
    if (enabled) {
      ensureEngine();
      if (!ctx) return;
      ctx.resume();
      engine.setVolume(CFG.MUSIC_VOLUME !== undefined ? CFG.MUSIC_VOLUME : 0.5, ctx.currentTime);
      if (currentFile) onPhoto(currentFile);
      flash("♪ Music on");
    } else if (ctx) {
      engine.setVolume(0, ctx.currentTime);
      setTimeout(() => { if (!enabled) ctx.suspend(); }, 3000); // fade, then let the CPU rest
      flash("Music off");
    }
  }

  // ---- the "Tap for sound" pill

  function updatePill() {
    if (!pill || pillTimer) return;
    const blocked = enabled && !audioRunning();
    pill.textContent = "♪ Tap for sound";
    pill.classList.toggle("visible", blocked);
  }

  function flash(text) {
    if (!pill) return;
    clearTimeout(pillTimer);
    pill.textContent = text;
    pill.classList.add("visible");
    pillTimer = setTimeout(() => {
      pillTimer = null;
      pill.classList.remove("visible");
      updatePill();
    }, 1800);
  }

  // The first touch while sound is blocked just turns the sound on. It's
  // caught before the slideshow's own gesture handling sees it, so it
  // doesn't also skip to the next photo.
  function onPointerDownCapture(e) {
    if (!enabled || audioRunning()) return;
    ensureEngine();
    if (!ctx) return;
    ctx.resume().then(updatePill);
    swallowPointerUp = true;
    e.stopPropagation();
  }

  function onPointerUpCapture(e) {
    if (!swallowPointerUp) return;
    swallowPointerUp = false;
    e.stopPropagation();
  }

  function init() {
    pill = document.createElement("div");
    pill.id = "music-pill";
    (document.getElementById("frame") || document.body).appendChild(pill);

    window.addEventListener("pointerdown", onPointerDownCapture, true);
    window.addEventListener("pointerup", onPointerUpCapture, true);
    window.addEventListener("keydown", () => {
      if (enabled && ctx && !audioRunning()) ctx.resume().then(updatePill);
    }, true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && enabled && ctx) ctx.resume().then(updatePill);
    });
    document.addEventListener("photoframe:photo", (e) => onPhoto(e.detail));

    // Try to start right away. Where autoplay is allowed (the Electron app,
    // some kiosk browsers) this just plays; elsewhere the pill appears.
    if (enabled) ensureEngine();
    setTimeout(updatePill, 600);
  }

  window.photoMusic = { toggle, onPhoto };
  document.addEventListener("DOMContentLoaded", init);
})();
