// ====================================================================
//  cursor.js — curseur personnalisé « deux vitesses »
//  Un point plein colle à la souris (précision) + un anneau qui suit
//  avec une légère traîne et grossit sur les éléments cliquables.
//  Les deux s'inversent selon le fond (mix-blend-mode dans le CSS).
//  Uniquement sur pointeur fin.
// ====================================================================

const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const cur = document.getElementById("cursor");

if (fine && cur) {
  document.documentElement.classList.add("cursor-on");

  // Point central créé à la volée
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  dot.setAttribute("aria-hidden", "true");
  document.body.appendChild(dot);

  let x = window.innerWidth / 2, y = window.innerHeight / 2;  // anneau (traîne)
  let tx = x, ty = y;                                         // cible (souris)

  document.addEventListener("mousemove", (e) => {
    tx = e.clientX; ty = e.clientY;
    cur.classList.add("is-on");
    dot.classList.add("is-on");
    // le point colle à la souris, sans traîne
    dot.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -50%)`;
  });
  document.addEventListener("mouseleave", () => {
    cur.classList.remove("is-on");
    dot.classList.remove("is-on");
  });
  document.addEventListener("mousedown", () => { cur.classList.add("is-down"); dot.classList.add("is-down"); });
  document.addEventListener("mouseup", () => { cur.classList.remove("is-down"); dot.classList.remove("is-down"); });

  const CLICKABLE = "a, button, .tile, .filter, .albums-arrow, [role='button'], label, input, textarea, summary";
  document.addEventListener("mouseover", (e) => {
    cur.classList.toggle("is-hover", !!e.target.closest(CLICKABLE));
  });

  function loop() {
    x += (tx - x) * 0.18;   // traîne plus marquée que le point → effet deux vitesses
    y += (ty - y) * 0.18;
    cur.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  }
  loop();
}
