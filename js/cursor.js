// ====================================================================
//  cursor.js — curseur personnalisé (anneau qui suit la souris)
//  Grossit sur les éléments cliquables, affiche « Voir » sur les
//  vignettes. Uniquement sur appareils à pointeur fin (pas tactile).
// ====================================================================

const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const cur = document.getElementById("cursor");
const lab = document.getElementById("cursorLabel");

if (fine && cur && lab) {
  document.documentElement.classList.add("cursor-on");

  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  let tx = x, ty = y;

  document.addEventListener("mousemove", (e) => {
    tx = e.clientX; ty = e.clientY;
    cur.classList.add("is-on");
  });
  document.addEventListener("mouseleave", () => cur.classList.remove("is-on"));
  document.addEventListener("mousedown", () => cur.classList.add("is-down"));
  document.addEventListener("mouseup", () => cur.classList.remove("is-down"));

  const CLICKABLE = "a, button, .tile, .filter, .albums-arrow, [role='button'], label, input, textarea, summary";
  const VIEWABLE = ".tile[data-album], .tile[data-youtube], .tile[data-lb], .yt-frame";

  document.addEventListener("mouseover", (e) => {
    cur.classList.toggle("is-hover", !!e.target.closest(CLICKABLE));
    lab.classList.toggle("is-on", !!e.target.closest(VIEWABLE));
  });

  function loop() {
    x += (tx - x) * 0.2;
    y += (ty - y) * 0.2;
    cur.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    lab.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, 22px)`;
    requestAnimationFrame(loop);
  }
  loop();
}
