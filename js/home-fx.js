// ====================================================================
//  home-fx.js — fumée / brume qui ondule derrière le mot-marque
//  Volutes allongées qui dérivent lentement vers le haut, ondulent,
//  et respirent (apparition / estompage). Rendu basse résolution +
//  flou CSS = très léger. Accueil uniquement, coupé si reduce-motion.
// ====================================================================

const canvas = document.getElementById("homeFx");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas && !reduce) {
  const ctx = canvas.getContext("2d");
  const SCALE = 0.2;
  let W = 1, H = 1, wisps = [], raf = null, running = false;

  function resize() {
    W = Math.max(1, Math.floor(window.innerWidth * SCALE));
    H = Math.max(1, Math.floor(window.innerHeight * SCALE));
    canvas.width = W;
    canvas.height = H;
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  function makeWisp() {
    return {
      x: Math.random(),
      y: Math.random(),
      vx: rand(-0.012, 0.012),     // dérive horizontale lente
      vy: rand(-0.03, -0.012),     // dérive vers le haut (fumée qui monte)
      r: rand(0.2, 0.42),          // rayon relatif
      elong: rand(1.5, 3),         // allongement (traînée)
      rot: rand(0, Math.PI),
      rotSp: rand(-0.05, 0.05),
      ph: rand(0, Math.PI * 2),
      pulse: rand(0.15, 0.35),     // vitesse de respiration
      a: rand(0.08, 0.18),         // opacité max
      sway: rand(0.04, 0.1),       // amplitude d'ondulation horizontale
      swaySp: rand(0.15, 0.4),
    };
  }

  function init() {
    wisps = [];
    for (let i = 0; i < 11; i++) wisps.push(makeWisp());
  }

  function frame(t) {
    if (!running) return;
    const time = t * 0.001;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    for (const w of wisps) {
      // déplacement (avec ré-entrée par le bas quand ça sort en haut)
      w.x += w.vx * 0.016;
      w.y += w.vy * 0.016;
      if (w.y < -0.3) { w.y = 1.3; w.x = Math.random(); }
      if (w.x < -0.3) w.x = 1.3; else if (w.x > 1.3) w.x = -0.3;

      const cx = (w.x + Math.sin(time * w.swaySp + w.ph) * w.sway) * W;
      const cy = w.y * H;
      const rad = w.r * Math.min(W, H);
      const alpha = w.a * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * w.pulse + w.ph)));

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(w.rot + time * w.rotSp);
      ctx.scale(w.elong, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      g.addColorStop(0, `rgba(232, 233, 237, ${alpha})`);
      g.addColorStop(1, "rgba(232, 233, 237, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();
    }

    ctx.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

  resize();
  init();
  window.addEventListener("resize", resize);

  const sync = () => (document.body.classList.contains("mode-home") ? start() : stop());
  sync();
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
