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

  // Clic (manuel ou automatique via dwell), hors bouton son
  const CLICKABLE = "a, button, .tile, .filter, .albums-arrow, [role='button'], summary, label";
  document.addEventListener("click", (e) => {
    if (e.target.closest(".sound-toggle")) return;
    if (e.target.closest(CLICKABLE)) drop();
  });

  // Bouton bascule
  function mount() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sound-toggle" + (enabled ? " is-on" : "");
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    btn.setAttribute("aria-label", enabled ? "Couper le son" : "Activer le son");
    btn.innerHTML = iconFor(enabled);
    document.body.appendChild(btn);

    btn.addEventListener("click", () => {
      enabled = !enabled;
      try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch (e) {}
      btn.classList.toggle("is-on", enabled);
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
      btn.setAttribute("aria-label", enabled ? "Couper le son" : "Activer le son");
      btn.innerHTML = iconFor(enabled);
      if (enabled) { ensureCtx(); drop(); }   // petit retour sonore
    });
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
