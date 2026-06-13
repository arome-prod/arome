// ====================================================================
//  cursor.js — curseur personnalisé (petit anneau qui suit la souris)
//  Grossit sur les éléments cliquables. Uniquement sur pointeur fin.
//  + Dwell-click : en restant ~1 s sur un élément cliquable, l'anneau
//    se remplit doucement, puis déclenche un clic automatique.
//    (Le clic manuel reste actif et annule un remplissage en cours.)
// ====================================================================

const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const cur = document.getElementById("cursor");

if (fine && cur) {
  document.documentElement.classList.add("cursor-on");

  // Disque de remplissage à l'intérieur de l'anneau
  const fill = document.createElement("span");
  fill.className = "cursor__fill";
  cur.appendChild(fill);

  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  let tx = x, ty = y;

  // ---- Dwell-click ----
  const DWELL_SEL = "a, button, .tile, .filter, .albums-arrow, [role='button']";
  const DWELL_DELAY = 1000;   // attente avant que le remplissage démarre
  const DWELL_FILL = 700;     // durée du remplissage
  let dwellTarget = null, dwellTimer = null, fillActive = false;

  // Signale au son (sound.js) le début / la fin du remplissage
  const emitDwell = (phase) =>
    window.dispatchEvent(new CustomEvent("arome:dwell", { detail: { phase, ms: DWELL_FILL } }));

  function resetFill() {
    fill.style.transition = "none";
    fill.style.transform = "scale(0)";
  }
  function cancelDwell() {
    clearTimeout(dwellTimer); dwellTimer = null;
    dwellTarget = null;
    if (fillActive) { fillActive = false; emitDwell("end"); }
    resetFill();
  }
  function startDwell(el) {
    cancelDwell();
    dwellTarget = el;
    dwellTimer = setTimeout(() => {
      void fill.offsetWidth;                 // reflow → garantit la transition
      fill.style.transition = `transform ${DWELL_FILL}ms linear`;
      fill.style.transform = "scale(1)";
      fillActive = true;
      emitDwell("start");                    // → son de progression synchronisé
    }, DWELL_DELAY);
  }
  // Quand le remplissage atteint sa taille pleine → petit « pop » + clic automatique
  fill.addEventListener("transitionend", (e) => {
    if (e.propertyName !== "transform" || !dwellTarget) return;
    const el = dwellTarget;
    cancelDwell();
    cur.classList.remove("is-bump"); void cur.offsetWidth;   // relance l'animation
    cur.classList.add("is-bump");
    setTimeout(() => cur.classList.remove("is-bump"), 320);
    el.click();
  });

  document.addEventListener("mousemove", (e) => {
    tx = e.clientX; ty = e.clientY;
    cur.classList.add("is-on");
    let el = e.target.closest(DWELL_SEL);
    if (el && el.closest(".tile[data-album]")) el = null;   // pas de dwell sur les albums (conflit diaporama)
    if (el && el.closest("#inspWall")) el = null;           // ni sur les Coups de cœur
    if (el !== dwellTarget) { if (el) startDwell(el); else cancelDwell(); }
  });
  document.addEventListener("mouseleave", () => { cur.classList.remove("is-on"); cancelDwell(); });
  document.addEventListener("mousedown", () => { cur.classList.add("is-down"); cancelDwell(); });
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
