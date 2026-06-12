// ====================================================================
//  home-fx.js — brume sombre qui ondule derrière le mot-marque
//  Rendu basse résolution + flou CSS (GPU) = très léger.
//  Actif uniquement sur l'accueil (mode-home) ; coupé sinon et si
//  l'utilisateur a demandé à réduire les animations.
// ====================================================================

const canvas = document.getElementById("homeFx");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas && !reduce) {
  const ctx = canvas.getContext("2d");
  const SCALE = 0.18;            // résolution interne (très basse → fluide)
  let W = 1, H = 1, blobs = [], raf = null, running = false;

  function resize() {
    W = Math.max(1, Math.floor(window.innerWidth * SCALE));
    H = Math.max(1, Math.floor(window.innerHeight * SCALE));
    canvas.width = W;
    canvas.height = H;
  }

  function init() {
    blobs = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      blobs.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.28 + Math.random() * 0.32,   // taille relative
        ph: Math.random() * Math.PI * 2,  // phase
        sp: 0.12 + Math.random() * 0.22,  // vitesse d'ondulation
        a: 0.08 + Math.random() * 0.1,    // opacité de la volute
      });
    }
  }

  function frame(t) {
    if (!running) return;
    const time = t * 0.001;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter"; // les volutes s'additionnent en lumière
    for (const b of blobs) {
      const cx = (b.x + Math.sin(time * b.sp + b.ph) * 0.14) * W;
      const cy = (b.y + Math.cos(time * b.sp * 0.8 + b.ph) * 0.14) * H;
      const rad = b.r * Math.min(W, H) * (0.9 + Math.sin(time * b.sp + b.ph) * 0.1);
      // Gris clair / blanc (fumée)
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `rgba(230, 231, 235, ${b.a})`);
      g.addColorStop(1, "rgba(230, 231, 235, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

  resize();
  init();
  window.addEventListener("resize", resize);

  // Actif seulement en mode accueil ; on suit la classe du <body>
  const sync = () => (document.body.classList.contains("mode-home") ? start() : stop());
  sync();
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
