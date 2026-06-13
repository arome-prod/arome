// ====================================================================
//  sound.js — sons discrets et organiques (activables)
//  Générés à la volée (WebAudio), aucun fichier à charger.
//   • clic  : petite « goutte d'eau » douce
//   • dwell : nappe aquatique qui gonfle, synchronisée au remplissage
//             du curseur (événement « arome:dwell »)
//  Désactivé par défaut, préférence mémorisée. Bouton en bas à gauche.
// ====================================================================

(function () {
  const KEY = "arome-sound";
  let enabled = false;
  try { enabled = localStorage.getItem(KEY) === "on"; } catch (e) {}
  let ctx = null, master = null;

  function iconFor(on) {
    const base = '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>';
    const waves = '<path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7.5 7.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    const cross = '<path d="M17 9.5l5 5M22 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${base}${on ? waves : cross}</svg>`;
  }

  // Réverbération générée (impulsion bruitée à déclin exponentiel) → côté planant
  function makeReverb(c, seconds, decay) {
    const rate = c.sampleRate, len = Math.floor(rate * seconds);
    const buf = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    const conv = c.createConvolver(); conv.buffer = buf; return conv;
  }

  function ensureCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
      // chaîne maître : passe-bas TRÈS doux (étouffé) + réverbe (planant)
      master = ctx.createGain();
      master.gain.value = 0.9;
      const soft = ctx.createBiquadFilter();
      soft.type = "lowpass";
      soft.frequency.value = 760;          // bas → son feutré, « sous une couche »
      soft.Q.value = 0.4;
      const dry = ctx.createGain(); dry.gain.value = 0.5;
      const wet = ctx.createGain(); wet.gain.value = 0.65;
      const rev = makeReverb(ctx, 2.6, 2.4);
      master.connect(soft);
      soft.connect(dry).connect(ctx.destination);
      soft.connect(rev).connect(wet).connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // ---- Clic : « goutte » feutrée et planante (attaque douce, longue traîne réverbérée) ----
  function drop() {
    if (!enabled) return;
    const c = ensureCtx(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(360, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.035);     // attaque douce (pas de « tic »)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.8);
  }

  // ---- Dwell : nappe douce qui monte/s'ouvre pendant le remplissage ----
  let dwell = null;
  function dwellStart(ms) {
    if (!enabled) return;
    const c = ensureCtx(); if (!c) return;
    dwellStop(0);
    const t = c.currentTime, dur = Math.max(0.2, ms / 1000);
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(220, t);
    f.frequency.linearRampToValueAtTime(620, t + dur);      // s'ouvre doucement → progression feutrée
    const o1 = c.createOscillator(); o1.type = "sine";
    const o2 = c.createOscillator(); o2.type = "sine"; o2.detune.value = 5; // battement lent, organique
    o1.frequency.setValueAtTime(130, t);
    o1.frequency.linearRampToValueAtTime(174, t + dur);     // glisse doucement vers le haut (grave)
    o2.frequency.setValueAtTime(130 * 1.5, t);
    o2.frequency.linearRampToValueAtTime(174 * 1.5, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.95);   // gonfle en arrivant à terme
    o1.connect(f); o2.connect(f); f.connect(g).connect(master);
    o1.start(t); o2.start(t);
    dwell = { o1, o2, g };
  }
  function dwellStop(fade) {
    if (!dwell || !ctx) { dwell = null; return; }
    const { o1, o2, g } = dwell; dwell = null;
    const t = ctx.currentTime, f = (fade == null ? 0.12 : fade);
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + f);
      o1.stop(t + f + 0.02); o2.stop(t + f + 0.02);
    } catch (e) {}
  }

  // Synchronisation avec le curseur
  window.addEventListener("arome:dwell", (e) => {
    if (!enabled) return;
    if (e.detail && e.detail.phase === "start") dwellStart(e.detail.ms);
    else dwellStop();
  });

  // Clic (manuel ou automatique via dwell), hors menu réglages
  const CLICKABLE = "a, button, .tile, .filter, .albums-arrow, [role='button'], summary, label";
  document.addEventListener("click", (e) => {
    if (e.target.closest(".settings")) return;
    if (e.target.closest(CLICKABLE)) drop();
  });

  // ---- Plein écran ----
  const fsEl = () => document.documentElement;
  function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFs() {
    if (isFs()) {
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
    } else {
      const el = fsEl();
      (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
    }
  }
  const ICON_FS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_FS_EXIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  const ICON_GEAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.49.49 0 0 0-.48-.41h-3.84a.49.49 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94 0 .32.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>';

  // ---- Menu réglages (roue crantée → son + plein écran) ----
  function mount() {
    const wrap = document.createElement("div");
    wrap.className = "settings";
    wrap.innerHTML =
      '<div class="settings__menu">' +
        '<button type="button" class="set-btn set-sound' + (enabled ? " is-on" : "") +
          '" aria-pressed="' + (enabled ? "true" : "false") + '" aria-label="' +
          (enabled ? "Couper le son" : "Activer le son") + '">' + iconFor(enabled) + '</button>' +
        '<button type="button" class="set-btn set-fs" aria-pressed="false" aria-label="Plein écran">' + ICON_FS + '</button>' +
      '</div>' +
      '<button type="button" class="set-btn settings__gear" aria-expanded="false" aria-label="Réglages">' + ICON_GEAR + '</button>';
    document.body.appendChild(wrap);

    const gear = wrap.querySelector(".settings__gear");
    const sound = wrap.querySelector(".set-sound");
    const fs = wrap.querySelector(".set-fs");

    gear.addEventListener("click", () => {
      const open = wrap.classList.toggle("is-open");
      gear.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // fermer le menu si on clique ailleurs
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) { wrap.classList.remove("is-open"); gear.setAttribute("aria-expanded", "false"); }
    });

    sound.addEventListener("click", () => {
      enabled = !enabled;
      try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch (e) {}
      sound.classList.toggle("is-on", enabled);
      sound.setAttribute("aria-pressed", enabled ? "true" : "false");
      sound.setAttribute("aria-label", enabled ? "Couper le son" : "Activer le son");
      sound.innerHTML = iconFor(enabled);
      if (enabled) { ensureCtx(); drop(); }
    });

    fs.addEventListener("click", toggleFs);
    function syncFs() {
      const on = isFs();
      fs.innerHTML = on ? ICON_FS_EXIT : ICON_FS;
      fs.classList.toggle("is-on", on);
      fs.setAttribute("aria-pressed", on ? "true" : "false");
      fs.setAttribute("aria-label", on ? "Quitter le plein écran" : "Plein écran");
    }
    document.addEventListener("fullscreenchange", syncFs);
    document.addEventListener("webkitfullscreenchange", syncFs);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
