// ====================================================================
//  cursor.js — curseur personnalisé (petit anneau qui suit la souris)
//  Grossit sur les éléments cliquables. Uniquement sur pointeur fin.
// ====================================================================

const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const cur = document.getElementById("cursor");

if (fine && cur) {
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
  document.addEventListener("mouseover", (e) => {
    cur.classList.toggle("is-hover", !!e.target.closest(CLICKABLE));
  });

  function loop() {
    x += (tx - x) * 0.4;   // peu de traîne → précis
    y += (ty - y) * 0.4;
    cur.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  }
  loop();
}
