// ====================================================================
//  sound.js — petits sons discrets au survol / clic (activables)
//  Sons générés à la volée (WebAudio) : aucun fichier à charger.
//  Désactivé par défaut, préférence mémorisée. Bouton en bas à gauche.
// ====================================================================

(function () {
  const KEY = "arome-sound";
  let enabled = false;
  try { enabled = localStorage.getItem(KEY) === "on"; } catch (e) {}
  let ctx = null;

  function iconFor(on) {
    // Haut-parleur ; ondes si activé, croix si coupé
    const base = '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>';
    const waves = '<path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7.5 7.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    const cross = '<path d="M17 9.5l5 5M22 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${base}${on ? waves : cross}</svg>`;
  }

  function ensureCtx() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Petit « tick » : onde courte avec attaque/déclin rapides, volume bas
  function tick(freq, peak, dur) {
    if (!enabled) return;
    const c = ensureCtx(); if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const CLICKABLE = "a, button, .tile, .filter, .albums-arrow, [role='button'], summary, label";

  // Survol (changement d'élément, avec petit throttle pour le défilement auto)
  let lastHover = null, lastHoverAt = 0;
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest(CLICKABLE);
    if (!el) { lastHover = null; return; }
    if (el === lastHover) return;
    lastHover = el;
    const now = performance.now();
    if (now - lastHoverAt < 80) return;     // évite les rafales (autoscroll)
    lastHoverAt = now;
    tick(900, 0.016, 0.05);
  });

  // Clic
  document.addEventListener("click", (e) => {
    if (e.target.closest(".sound-toggle")) return;   // géré séparément
    if (e.target.closest(CLICKABLE)) tick(430, 0.05, 0.09);
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
      if (enabled) { ensureCtx(); tick(660, 0.05, 0.1); }   // petit retour sonore
    });
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
