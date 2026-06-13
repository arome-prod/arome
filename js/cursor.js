// ====================================================================
//  cursor.js — curseur personnalisé (petit anneau qui suit la souris)
//  Grossit sur les éléments cliquables. Effet d'aimantation sur les
//  boutons : l'anneau se centre dessus et le bouton se penche vers le
//  curseur (magnétisme doux). Uniquement sur pointeur fin.
// ====================================================================

const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const cur = document.getElementById("cursor");

if (fine && cur) {
  document.documentElement.classList.add("cursor-on");

  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  let tx = x, ty = y;

  // Boutons aimantés (on évite ceux qui ont déjà un transform de mise en page,
  // comme les flèches .albums-arrow centrées en translateY).
  const MAGNET = ".brand__nav button, .filter, .btn, .album-back";
  const PULL_EL = 0.3;     // le bouton se déplace vers le curseur
  const PULL_RING = 0.45;  // l'anneau est attiré vers le centre du bouton
  let magEl = null, magCX = 0, magCY = 0;

  function clearMag() {
    if (!magEl) return;
    const el = magEl; magEl = null;
    el.style.transform = "";                       // revient en douceur (transition CSS .is-magnet)
    setTimeout(() => { if (el !== magEl) el.classList.remove("is-magnet"); }, 260);
  }

  document.addEventListener("mousemove", (e) => {
    tx = e.clientX; ty = e.clientY;
    cur.classList.add("is-on");

    const el = e.target.closest(MAGNET);
    if (el !== magEl) { clearMag(); magEl = el; if (magEl) magEl.classList.add("is-magnet"); }
    if (magEl) {
      const r = magEl.getBoundingClientRect();
      magCX = r.left + r.width / 2;
      magCY = r.top + r.height / 2;
      const dx = e.clientX - magCX, dy = e.clientY - magCY;
      magEl.style.transform = `translate(${dx * PULL_EL}px, ${dy * PULL_EL}px)`;
    }
  });

  document.addEventListener("mouseleave", () => { cur.classList.remove("is-on"); clearMag(); });
  document.addEventListener("mousedown", () => cur.classList.add("is-down"));
  document.addEventListener("mouseup", () => cur.classList.remove("is-down"));

  const CLICKABLE = "a, button, .tile, .filter, .albums-arrow, [role='button'], label, input, textarea, summary";
  document.addEventListener("mouseover", (e) => {
    cur.classList.toggle("is-hover", !!e.target.closest(CLICKABLE));
  });

  function loop() {
    let gx = tx, gy = ty;
    if (magEl) {                          // attiré vers le centre du bouton survolé
      gx = tx + (magCX - tx) * PULL_RING;
      gy = ty + (magCY - ty) * PULL_RING;
    }
    x += (gx - x) * 0.4;   // peu de traîne → précis
    y += (gy - y) * 0.4;
    cur.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  }
  loop();
}
