// ====================================================================
//  parallax.js — le fond réagit très légèrement à la souris
//  (et à l'inclinaison sur mobile) pour une sensation de profondeur.
// ====================================================================

const bg = document.getElementById("bg");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (bg && !reduce) {
  const MAX = 14;          // amplitude max en px
  let tx = 0, ty = 0, x = 0, y = 0, raf = null;

  function loop() {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    bg.style.transform = `scale(1.06) translate(${x}px, ${y}px)`;
    if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = null;
    }
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  window.addEventListener("mousemove", (e) => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    tx = -((e.clientX - cx) / cx) * MAX;
    ty = -((e.clientY - cy) / cy) * MAX;
    kick();
  });

  window.addEventListener("deviceorientation", (e) => {
    if (e.gamma == null || e.beta == null) return;
    tx = Math.max(-MAX, Math.min(MAX, -(e.gamma / 45) * MAX));
    ty = Math.max(-MAX, Math.min(MAX, -((e.beta - 45) / 45) * MAX));
    kick();
  }, true);
}
