// ====================================================================
//  app.js — site public arome (one-page)
//  Rend textes, albums, inspirations depuis la Realtime Database,
//  filtres, lightbox, mode ambiance, transitions entre onglets.
// ====================================================================

import {
  ref,
  onValue,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { db, isConfigured } from "./firebase.js?v=131";
import { DEFAULTS, DEMO, DEMO_INSP } from "./config.js?v=131";

const $ = (id) => document.getElementById(id);
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const yearEl = $("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Rejoue une apparition douce (fondu + léger glissé) sur un conteneur qui change.
function playIn(el) {
  if (!el) return;
  el.classList.remove("view-in");
  void el.offsetWidth;        // reflow → relance l'animation
  el.classList.add("view-in");
}

// Place / fait glisser le trait sous le filtre actif d'une barre de filtres.
function syncFilterUnderline(bar) {
  if (!bar) return;
  const act = bar.querySelector(".filter.is-active");
  let u = bar.querySelector(".filters__underline");
  if (!act) { if (u) u.style.opacity = "0"; return; }
  if (!u) { u = document.createElement("span"); u.className = "filters__underline"; bar.appendChild(u); }
  u.style.opacity = "1";
  u.style.width = act.offsetWidth + "px";
  u.style.top = (act.offsetTop + act.offsetHeight - 1) + "px";
  u.style.transform = `translateX(${act.offsetLeft}px)`;
}
window.addEventListener("resize", () => {
  syncFilterUnderline($("filters"));
  syncFilterUnderline($("inspFilters"));
});

// ====================================================================
//  Navigation : la marque glisse de l'accueil vers la barre du haut
//  (technique FLIP : on mesure avant/après et on anime la différence)
// ====================================================================
(function navigation() {
  const body = document.body;
  const brand = document.querySelector(".brand");
  const panels = document.querySelectorAll(".panel");
  const store = document.querySelector(".store");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flipEls = [
    brand.querySelector(".brand__logo"),
    ...brand.querySelectorAll(".brand__nav button"),
  ];

  // Trait actif glissant dans la barre du haut
  const navEl = brand.querySelector(".brand__nav");
  const navUnderline = document.createElement("span");
  navUnderline.className = "brand__nav__underline";
  navEl.appendChild(navUnderline);
  function syncNavUnderline() {
    if (body.classList.contains("mode-home")) { navUnderline.style.opacity = "0"; return; }
    const act = navEl.querySelector("button.is-active");
    if (!act) { navUnderline.style.opacity = "0"; return; }
    navUnderline.style.opacity = "1";
    navUnderline.style.width = act.offsetWidth + "px";
    navUnderline.style.top = (act.offsetTop + act.offsetHeight - 1) + "px";
    navUnderline.style.transform = `translateX(${act.offsetLeft}px)`;
  }
  window.addEventListener("resize", syncNavUnderline);

  function setActive(key) {
    panels.forEach((p) => p.classList.toggle("is-active", p.dataset.panel === key));
    document.querySelectorAll("[data-go]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.go === key));
    requestAnimationFrame(syncNavUnderline);
    // Recale le trait des filtres une fois la section visible (sinon largeur 0)
    if (key === "portfolio" || key === "inspirations") {
      const id = key === "portfolio" ? "filters" : "inspFilters";
      requestAnimationFrame(() => syncFilterUnderline(document.getElementById(id)));
    }
  }
  setActive("portfolio");

  // Accueil → section : déplacement + zoom ensemble (rapide, fluide).
  const TRANS_TO_SECTION = "transform 0.62s cubic-bezier(0.7, 0, 0.2, 1)";
  // Section → accueil : on SÉPARE déplacement et zoom.
  //  - le déplacement est court ;
  //  - le grossissement dure plus longtemps (il continue après l'arrivée au centre).
  const MOVE_TO_HOME = "transform 0.6s cubic-bezier(0.5, 0, 0.2, 1)";
  const ZOOM_TO_HOME = "transform 1.05s cubic-bezier(0.22, 0.7, 0.25, 1)";

  // Anime les éléments de la marque entre deux mises en page.
  // Si `zoom` est fourni, le grossissement (sur l'enfant) est désynchronisé
  // du déplacement (sur l'élément) pour un effet « zoom après / progressif ».
  function flip(change, move, zoom) {
    if (reduce) { change(); return; }
    move = move || TRANS_TO_SECTION;
    const first = flipEls.map((el) => el.getBoundingClientRect());
    change();
    const last = flipEls.map((el) => el.getBoundingClientRect());
    flipEls.forEach((el, i) => {
      const fcx = first[i].left + first[i].width / 2;
      const fcy = first[i].top + first[i].height / 2;
      const lcx = last[i].left + last[i].width / 2;
      const lcy = last[i].top + last[i].height / 2;
      const dx = fcx - lcx, dy = fcy - lcy;
      const s = last[i].height ? first[i].height / last[i].height : 1;
      const child = zoom ? el.firstElementChild : null;
      el.style.transition = "none";
      el.style.transformOrigin = "center center";
      if (child) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;       // déplacement
        child.style.transition = "none";
        child.style.transformOrigin = "center center";
        child.style.transform = `scale(${s})`;                    // zoom (séparé)
      } else {
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
      }
    });
    void brand.offsetWidth; // force un reflow
    requestAnimationFrame(() => {
      flipEls.forEach((el) => {
        el.style.transition = move;
        el.style.transform = "";
        const child = zoom ? el.firstElementChild : null;
        if (child) { child.style.transition = zoom; child.style.transform = ""; }
      });
    });
  }

  // Aller vers une section avec l'effet « store » qui remonte pour révéler.
  function goSection(key, fromHome) {
    const swap = () => {
      if (fromHome) body.classList.remove("mode-home");
      setActive(key);
      window.scrollTo(0, 0);
    };

    if (reduce || !store) {
      if (fromHome) flip(swap); else swap();
      return;
    }

    // 1. Le store couvre instantanément le contenu
    store.classList.add("no-anim", "is-cover");
    void store.offsetHeight; // reflow

    // 2. On change le contenu derrière le store (la marque glisse si on vient de l'accueil)
    if (fromHome) flip(swap); else swap();

    // 3. Le store remonte pour dévoiler la page
    requestAnimationFrame(() => {
      store.classList.remove("no-anim");
      requestAnimationFrame(() => store.classList.remove("is-cover"));
    });
  }

  function navTo(key) {
    const home = body.classList.contains("mode-home");

    if (key === "home") {
      if (home) return;
      flip(() => body.classList.add("mode-home"), MOVE_TO_HOME, ZOOM_TO_HOME);
      return;
    }

    // On revient sur une section → la remettre à zéro (« Tout »)
    if (key === "portfolio") resetPortfolioView();
    else if (key === "inspirations") resetInspView();

    // Déjà dans une section : transition douce (fondu sortant → entrant)
    if (!home) {
      const active = document.querySelector(".panel.is-active");
      if (active && active.dataset.panel === key) return;
      if (reduce || !active) {
        setActive(key);
        window.scrollTo(0, 0);
        return;
      }
      active.classList.add("is-leaving");
      setTimeout(() => {
        active.classList.remove("is-leaving");
        setActive(key);          // le nouveau panneau joue l'animation panelIn
        window.scrollTo(0, 0);
      }, 170);
      return;
    }

    // Depuis l'accueil → section
    goSection(key, true);
  }

  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", (e) => { e.preventDefault(); navTo(b.dataset.go); }));
})();

// ====================================================================
//  Accès admin : uniquement via #admin dans l'URL → ouvre admin.html
//  (plus de triple-clic sur le logo)
// ====================================================================
(function adminAccess() {
  if (location.hash === "#admin") location.href = "admin.html";
})();

// ====================================================================
//  Easter egg : taper « cyberpunk » → curseur spécial (et retour)
// ====================================================================
(function easterEgg() {
  let buf = "", el = null, timer = null;

  function flash(text) {
    if (!el) {
      el = document.createElement("div");
      el.className = "egg";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    el.textContent = text;
    requestAnimationFrame(() => el.classList.add("is-on"));
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove("is-on"), 4200);
  }

  const EGGS = [
    { seq: "cyberpunk", run: () => {
        const on = document.documentElement.classList.toggle("cursor-cyber");
        flash(on ? "▮ mode cyberpunk activé" : "curseur normal rétabli");
      } },
  ];

  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = (e.key || "").toLowerCase();
    if (k.length !== 1) return;          // ignore Shift, flèches, etc.
    buf = (buf + k).slice(-24);
    for (const egg of EGGS) {
      if (buf.endsWith(egg.seq)) { buf = ""; egg.run(); break; }
    }
  });
})();

// ====================================================================
//  Mode ambiance : si on reste sur l'accueil sans rien faire, la marque
//  s'efface, la brume s'intensifie sur fond noir, et un lecteur lance
//  une musique au hasard parmi les inspirations. Un clic = retour.
// ====================================================================
(function ambientMode() {
  const IDLE_MS = 12000;   // 12 s (test) — repasser à 300000 (5 min) en prod
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const body = document.body;
  const player = $("ambientPlayer");
  if (!player || reduceMotion) return;

  let idleTimer = null;
  const isHome = () => body.classList.contains("mode-home");
  const isAmbient = () => body.classList.contains("ambient");

  function pickMusic() {
    const list = allInsp.filter((it) => it.kind === "music" && it.embed);
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  function buildPlayer() {
    const m = pickMusic();
    let html = '<p class="ambient-hint">Cliquez n’importe où pour revenir</p>';
    if (m) {
      // lecteur "plein" : grande pochette + bouton lecture central bien visible
      const h = m.source === "apple" ? 450 : 352;
      html += `<iframe src="${esc(m.embed)}" height="${h}" loading="lazy"
        allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"></iframe>`;
    }
    player.innerHTML = html;
  }

  function enter() {
    if (!isHome() || isAmbient()) return;
    clearTimeout(idleTimer); idleTimer = null;
    buildPlayer();
    body.classList.add("ambient");
  }
  function exit() {
    if (!isAmbient()) return;
    body.classList.remove("ambient");
    player.innerHTML = "";   // retire l'iframe → coupe la musique
    arm();
  }
  function arm() {
    clearTimeout(idleTimer); idleTimer = null;
    if (!isHome() || isAmbient()) return;
    idleTimer = setTimeout(enter, IDLE_MS);
  }

  // Toute activité réarme le minuteur (sauf pendant l'ambiance)
  ["mousemove", "mousedown", "keydown", "wheel", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, () => { if (!isAmbient()) arm(); }, { passive: true })
  );

  // Sortie de l'ambiance : clic dans la page (hors lecteur) ou touche
  document.addEventListener("click", (e) => {
    if (!isAmbient()) return;
    if (e.target.closest("#ambientPlayer")) return;   // on n'interrompt pas le lecteur
    exit();
  });
  document.addEventListener("keydown", () => { if (isAmbient()) exit(); });

  // Si on quitte l'accueil (navigation), on coupe tout
  new MutationObserver(() => {
    if (!isHome()) { exit(); clearTimeout(idleTimer); idleTimer = null; }
    else if (!isAmbient()) arm();
  }).observe(body, { attributes: true, attributeFilter: ["class"] });

  arm();
})();

// ====================================================================
//  Contenu éditorial (hero / à propos / contact)
// ====================================================================
function renderContent(c) {
  const data = {
    hero: { ...DEFAULTS.hero, ...(c.hero || {}) },
    about: { ...DEFAULTS.about, ...(c.about || {}) },
    contact: { ...DEFAULTS.contact, ...(c.contact || {}) },
  };

  const tagline = $("heroTagline");
  if (tagline) tagline.textContent = data.hero.tagline;

  const aboutText = $("aboutText");
  if (aboutText) {
    aboutText.innerHTML = String(data.about.text)
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p.trim())}</p>`)
      .join("");
  }

  const skills = $("aboutSkills");
  if (skills) {
    const list = Array.isArray(data.about.skills)
      ? data.about.skills
      : String(data.about.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
    skills.innerHTML = list.map((s) => `<li>${esc(s)}</li>`).join("");
  }

  const links = $("contactLinks");
  if (links) {
    const out = [];
    if (data.contact.email)
      out.push(`<a class="btn" href="mailto:${esc(data.contact.email)}">Email</a>`);
    if (data.contact.instagram)
      out.push(`<a class="btn" href="${esc(data.contact.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
    if (data.contact.vinted)
      out.push(`<a class="btn" href="${esc(data.contact.vinted)}" target="_blank" rel="noopener">Vinted</a>`);
    links.innerHTML = out.join("");
  }
}

// ====================================================================
//  Portfolio : albums par catégorie → page album → photos
// ====================================================================
let allAlbums = [];
let allVideos = [];
let allInsp = [];
let allTextes = [];
let allTimeline = [];
let allSites = [];
let activeFilter = "all";
let inspFilter = "all";

// Frise « Mon parcours » dans À propos (description repliée → clic sur le titre)
function renderTimeline() {
  const wrap = $("timelineWrap"), list = $("aboutTimeline");
  if (!wrap || !list) return;
  if (!allTimeline.length) { wrap.hidden = true; list.innerHTML = ""; return; }
  wrap.hidden = false;
  list.innerHTML = allTimeline.map((e) => {
    const hasText = !!(e.text && e.text.trim());
    return `<li class="timeline__item">
      <span class="timeline__year">${esc(e.year || "")}</span>
      <button type="button" class="timeline__title"${hasText ? "" : " disabled"}>${esc(e.title || "")}</button>
      ${hasText ? `<p class="timeline__text">${esc(e.text)}</p>` : ""}
    </li>`;
  }).join("");
}
// Clic sur un titre → déplie / replie sa description
document.addEventListener("click", (e) => {
  const b = e.target.closest("#aboutTimeline .timeline__title");
  if (b) b.closest(".timeline__item").classList.toggle("is-open");
});

// Nettoie un HTML riche en ne gardant que gras/italique/souligné + sauts/paragraphes.
// IMPORTANT : appelé aussi à l'affichage public (les règles d'écriture sont ouvertes,
// on ne fait donc jamais confiance au HTML stocké) → empêche toute injection.
const RICH_OK = { B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u", P: "p", BR: "br", DIV: "p" };
function sanitizeRich(html) {
  let doc;
  try { doc = new DOMParser().parseFromString(String(html || ""), "text/html"); }
  catch (e) { return ""; }
  const walk = (node) => {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        out += esc(n.nodeValue);
      } else if (n.nodeType === 1) {
        const tag = RICH_OK[n.tagName];
        if (tag === "br") out += "<br>";
        else if (tag) out += `<${tag}>${walk(n)}</${tag}>`;
        else out += walk(n);   // balise inconnue : on garde juste le contenu
      }
    });
    return out;
  };
  return walk(doc.body).trim();
}

function shownAlbums() { return allAlbums.length ? allAlbums : DEMO; }
function isDemo() { return allAlbums.length === 0; }

// Photos d'un album sous forme de tableau trié
function photosOf(a) {
  if (!a.photos) return [];
  if (Array.isArray(a.photos)) return a.photos.slice().sort((x, y) => (x.order || 0) - (y.order || 0));
  return Object.entries(a.photos)
    .map(([id, p]) => ({ id, ...p }))
    .sort((x, y) => (x.order || 0) - (y.order || 0));
}
function mediaThumb(m) {
  if (!m) return "";
  return m.youtube ? `https://img.youtube.com/vi/${m.youtube}/hqdefault.jpg` : (m.src || "");
}
function coverSrc(a) {
  if (a.coverThumb) return a.coverThumb;       // mini-couverture légère (chargement paresseux)
  const ph = photosOf(a);                       // repli : ancien format inline / démo
  if (a.coverId && ph.length) {
    const c = ph.find((p) => p.id === a.coverId);
    if (c) return mediaThumb(c);
  }
  if (ph.length) return mediaThumb(ph[0]);
  return a.cover || "";
}

// Photos d'un album : chargées à la demande depuis albumPhotos/<id> (puis mises en cache).
// Repli sur les photos inline (anciens albums non migrés / albums de démo).
const photoCache = {};
async function loadAlbumPhotos(a) {
  if (photoCache[a.id]) return photoCache[a.id];
  let arr = [];
  if (isConfigured) {
    try {
      const snap = await get(ref(db, "albumPhotos/" + a.id));
      snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    } catch (e) { console.error("Chargement photos :", e); }
  }
  if (!arr.length) arr = photosOf(a);           // repli inline
  arr.sort((x, y) => (x.order || 0) - (y.order || 0));
  photoCache[a.id] = arr;
  return arr;
}

function categoriesOf(list) {
  const set = [];
  list.forEach((a) => {
    const cat = (a.category || "").trim();
    if (cat && !set.includes(cat)) set.push(cat);
  });
  return set;
}

function renderFilters() {
  const bar = $("filters");
  if (!bar) return;
  const cats = categoriesOf(shownAlbums());
  const hasYt = allVideos.length > 0;
  const hasTxt = allTextes.length > 0;
  const hasSite = allSites.length > 0;
  if (cats.length + (hasYt ? 1 : 0) + (hasTxt ? 1 : 0) + (hasSite ? 1 : 0) <= 1) { bar.innerHTML = ""; return; }

  let html = `<button class="filter${activeFilter === "all" ? " is-active" : ""}" data-filter="all">Tout</button>`;
  html += cats.map((c) =>
    `<button class="filter${activeFilter === c ? " is-active" : ""}" data-filter="${esc(c)}">${esc(c)}</button>`
  ).join("");
  if (hasTxt) {
    html += `<button class="filter${activeFilter === "__txt" ? " is-active" : ""}" data-filter="__txt">Textes</button>`;
  }
  if (hasSite) {
    html += `<button class="filter${activeFilter === "__site" ? " is-active" : ""}" data-filter="__site">Sites web</button>`;
  }
  if (hasYt) {
    html += `<button class="filter${activeFilter === "__yt" ? " is-active" : ""}" data-filter="__yt">YouTube</button>`;
  }
  bar.innerHTML = html;
  requestAnimationFrame(() => syncFilterUnderline(bar));
}

// Petite carte « écrit » (titre + type) — bloc plus compact
function texteCardHTML(t) {
  return `<button class="tile tile--text" data-texte="${esc(t.id)}" aria-label="${esc(t.title || "Texte")}">
      <span class="txtcard">
        <span class="txtcard__type">${esc(t.type || "Texte")}</span>
        <span class="txtcard__title">${esc(t.title || "Sans titre")}</span>
        <span class="txtcard__more">Lire →</span>
      </span>
    </button>`;
}
// Carte récapitulative « Textes » affichée dans l'onglet « Tout »
function textesSummaryHTML() {
  if (!allTextes.length) return "";
  return `<button class="tile tile--text" data-go-txt="1" aria-label="Textes">
      <span class="txtcard">
        <span class="txtcard__type">Écrits</span>
        <span class="txtcard__title">Textes</span>
        <span class="txtcard__more">${allTextes.length} texte${allTextes.length > 1 ? "s" : ""} →</span>
      </span>
    </button>`;
}

// Carte « site web » compacte (titre + courte description)
function siteCardHTML(s) {
  const sub = s.desc ? esc(s.desc) : "Ouvrir";
  return `<button class="tile tile--text" data-site="${esc(s.id)}" aria-label="${esc(s.title || "Site")}">
      <span class="txtcard">
        <span class="txtcard__type">Site web</span>
        <span class="txtcard__title">${esc(s.title || "Site")}</span>
        <span class="txtcard__more">${sub} →</span>
      </span>
    </button>`;
}
// Carte récapitulative « Sites web » dans l'onglet « Tout »
function sitesSummaryHTML() {
  if (!allSites.length) return "";
  return `<button class="tile tile--text" data-go-site="1" aria-label="Sites web">
      <span class="txtcard">
        <span class="txtcard__type">Web</span>
        <span class="txtcard__title">Sites web</span>
        <span class="txtcard__more">${allSites.length} site${allSites.length > 1 ? "s" : ""} →</span>
      </span>
    </button>`;
}

function youtubeCardHTML() {
  if (!allVideos.length) return "";
  const thumb = `https://img.youtube.com/vi/${esc(allVideos[0].vid)}/hqdefault.jpg`;
  return `<button class="tile" data-youtube="1" aria-label="Contenu YouTube">
      <span class="tile__media">
        <img src="${thumb}" alt="" loading="lazy" />
        <span class="tile__play" aria-hidden="true">▶</span>
      </span>
      <span class="tile__cap">
        <span class="tile__name">Contenu YouTube</span>
        <span class="tile__cat">${allVideos.length} vidéo${allVideos.length > 1 ? "s" : ""}</span>
      </span>
    </button>`;
}

function renderAlbums() {
  const grid = $("albums");
  if (!grid) return;

  // Onglet YouTube : on affiche directement les vidéos (chaque vignette ouvre le lecteur)
  if (activeFilter === "__yt") {
    if (!allVideos.length) {
      grid.innerHTML = '<div class="gallery__loading">Aucune vidéo.</div>';
      return;
    }
    grid.innerHTML = allVideos.map((v, i) => {
      const thumb = `https://img.youtube.com/vi/${esc(v.vid)}/hqdefault.jpg`;
      return `<button class="tile" data-ytlb="${i}" aria-label="${esc(v.title || "Vidéo")}">
          <span class="tile__media">
            <img src="${thumb}" alt="${esc(v.title || "")}" loading="lazy" />
            <span class="tile__play" aria-hidden="true">▶</span>
          </span>
          ${v.title ? `<span class="tile__cap"><span class="tile__name">${esc(v.title)}</span></span>` : ""}
        </button>`;
    }).join("");
    lbList = allVideos.map((v) => ({ type: "video", id: v.vid, title: v.title || "" }));
    requestAnimationFrame(updateAlbumArrows);
    return;
  }

  // Onglet Textes : petits blocs (titre + type)
  if (activeFilter === "__txt") {
    grid.innerHTML = allTextes.length
      ? allTextes.map(texteCardHTML).join("")
      : '<div class="gallery__loading">Aucun texte.</div>';
    requestAnimationFrame(updateAlbumArrows);
    return;
  }

  // Onglet Sites web : petits blocs (titre + description)
  if (activeFilter === "__site") {
    grid.innerHTML = allSites.length
      ? allSites.map(siteCardHTML).join("")
      : '<div class="gallery__loading">Aucun site.</div>';
    requestAnimationFrame(updateAlbumArrows);
    return;
  }

  const list = shownAlbums().filter((a) => activeFilter === "all" || a.category === activeFilter);

  if (list.length === 0) {
    grid.innerHTML = `<div class="gallery__loading">Aucun album${isConfigured ? " — crée-en un via l’admin." : "."}</div>`;
    return;
  }

  const demoNote = isDemo()
    ? '<p class="gallery__demo">Exemples — crée tes vrais albums via l’admin.</p>'
    : "";

  grid.innerHTML = demoNote + list.map((a) => {
    const cover = coverSrc(a);
    const n = a.count ?? photosOf(a).length;
    const media = cover
      ? `<span class="tile__media"><img src="${esc(cover)}" alt="${esc(a.title || "")}" loading="lazy" /></span>`
      : `<span class="tile__media"><span class="tile__empty">arome</span></span>`;
    const meta = n ? `${n} photo${n > 1 ? "s" : ""}` : (a.category || "");
    return `<button class="tile" data-album="${esc(a.id)}" aria-label="${esc(a.title || "Album")}">
        ${media}
        <span class="tile__cap">
          <span class="tile__name">${esc(a.title || "Sans titre")}</span>
          <span class="tile__cat">${esc(meta)}</span>
        </span>
      </button>`;
  }).join("");

  // Carte « Contenu YouTube » en fin de grille (vue « Tout »)
  // (les Textes ne sont accessibles que via leur onglet, pour ne pas
  //  casser l'harmonie de la rangée d'images)
  if (activeFilter === "all") {
    grid.insertAdjacentHTML("beforeend", sitesSummaryHTML());
    grid.insertAdjacentHTML("beforeend", youtubeCardHTML());
  }

  setupAlbumHover();
  upgradeCovers();                 // remplace les mini-couvertures par les photos pleine qualité
  requestAnimationFrame(updateAlbumArrows);
}

// Affiche les couvertures en pleine qualité (photo originale), pas la mini-version.
// La mini-couverture sert juste d'aperçu instantané, puis on charge la vraie photo.
async function upgradeCovers() {
  const grid = $("albums");
  if (!grid) return;
  const tiles = [...grid.querySelectorAll('.tile[data-album]')];
  for (const tile of tiles) {
    const a = shownAlbums().find((x) => x.id === tile.dataset.album);
    const img = tile.querySelector(".tile__media img");
    if (!a || !img) continue;
    try {
      const ph = await loadAlbumPhotos(a);
      const cov = (a.coverId && ph.find((p) => p.id === a.coverId)) || ph[0];
      const full = cov ? mediaThumb(cov) : "";
      if (full && full !== img.getAttribute("src")) {
        const pre = new Image();
        pre.onload = () => { img.src = full; };
        pre.src = full;
      }
    } catch (e) { /* on garde la mini-couverture en repli */ }
  }
}

// Survol d'une carte album → mini-diaporama de ses photos (fondu enchaîné)
const HOVER_FADE = 900;     // durée du fondu (doit suivre le CSS .tile__fade)
const HOVER_HOLD = 1400;    // intervalle entre deux photos (pause + fondu)
function setupAlbumHover() {
  const grid = $("albums");
  if (!grid) return;
  grid.querySelectorAll('.tile[data-album]').forEach((tile) => {
    const a = shownAlbums().find((x) => x.id === tile.dataset.album);
    const media = tile.querySelector(".tile__media");
    const base = media && media.querySelector("img");
    if (!a || !base) return;
    // S'il n'y a qu'une seule photo (d'après le compteur), inutile de préparer le diaporama
    if ((a.count ?? photosOf(a).length) < 2) return;

    const cover = base.getAttribute("src");
    let srcs = null, hovering = false, timer = null, i = 0, swap = null, fade = null;

    const show = (next) => {
      fade.classList.remove("is-on");
      fade.src = next;
      void fade.offsetWidth;            // reflow → garantit le fondu
      fade.classList.add("is-on");
      clearTimeout(swap);
      swap = setTimeout(() => { base.src = next; fade.classList.remove("is-on"); }, HOVER_FADE);
    };
    const step = () => {
      i = (i + 1) % srcs.length;
      const next = srcs[i];
      const pre = new Image();
      pre.onload = () => { if (hovering) show(next); };
      pre.src = next;
    };

    tile.addEventListener("mouseenter", async () => {
      hovering = true;
      if (!srcs) {                       // photos chargées à la demande, au 1er survol
        const ph = await loadAlbumPhotos(a);
        srcs = ph.map(mediaThumb).filter(Boolean);
        if (!hovering || srcs.length < 2) return;
        fade = document.createElement("img");
        fade.className = "tile__fade"; fade.alt = "";
        media.appendChild(fade);
      }
      if (srcs.length < 2) return;
      i = 0;
      clearInterval(timer); clearTimeout(swap);
      timer = setInterval(step, HOVER_HOLD);
    });
    tile.addEventListener("mouseleave", () => {
      hovering = false;
      clearInterval(timer); clearTimeout(swap);
      timer = null;
      if (fade) fade.classList.remove("is-on");
      base.src = cover;
    });
  });
}

function renderAll() { renderFilters(); renderAlbums(); playIn($("albums")); }

// Réinitialise le Portfolio sur « Tout » (referme album / texte / YouTube).
function resetPortfolioView() {
  activeFilter = "all";
  if ($("albumView")) $("albumView").hidden = true;
  if ($("youtubeView")) $("youtubeView").hidden = true;
  if ($("textView")) $("textView").hidden = true;
  if ($("siteView")) { $("siteView").hidden = true; if ($("siteFrame")) $("siteFrame").src = "about:blank"; }
  if ($("albumsView")) $("albumsView").hidden = false;
  document.body.classList.remove("reading");
  const bar = $("readProgress");
  if (bar) { bar.classList.remove("is-on"); bar.style.width = "0%"; }
  window.removeEventListener("scroll", updateReadProgress);
  renderAll();
}
// Réinitialise les Coups de cœur sur « Tout ».
function resetInspView() {
  inspFilter = "all";
  renderInspirations();
}

// Glisser-déposer à la souris pour faire défiler une rangée horizontale (avec inertie).
function attachDragScroll(el) {
  if (!el) return;
  let down = false, startX = 0, startScroll = 0, lastX = 0, vel = 0, moved = false, raf = null;

  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    down = true; moved = false;
    startX = e.pageX; lastX = e.pageX; startScroll = el.scrollLeft; vel = 0;
    if (raf) cancelAnimationFrame(raf);
  });
  window.addEventListener("mousemove", (e) => {
    if (!down) return;
    const dx = e.pageX - startX;
    if (Math.abs(dx) > 4) moved = true;
    el.scrollLeft = startScroll - dx;
    vel = e.pageX - lastX; lastX = e.pageX;
    el.style.userSelect = "none";
  });
  window.addEventListener("mouseup", () => {
    if (!down) return;
    down = false; el.style.userSelect = "";
    if (moved && Math.abs(vel) > 0.5) {
      const glide = () => {
        el.scrollLeft -= vel; vel *= 0.92;          // inertie qui s'amortit
        if (Math.abs(vel) > 0.4) raf = requestAnimationFrame(glide);
      };
      glide();
    }
  });
  // Empêche le clic « fantôme » d'ouvrir un projet après un glissé
  el.addEventListener("click", (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
  }, true);
}
attachDragScroll($("albums"));
attachDragScroll($("inspWall"));

// Flèches de défilement de la rangée d'albums
function updateAlbumArrows() {
  const el = $("albums"), prev = $("albumsPrev"), next = $("albumsNext");
  if (!el || !prev || !next) return;
  const max = el.scrollWidth - el.clientWidth;
  const overflow = max > 4;
  prev.hidden = !overflow || el.scrollLeft <= 2;
  next.hidden = !overflow || el.scrollLeft >= max - 2;
}
(function albumArrows() {
  const el = $("albums"), prev = $("albumsPrev"), next = $("albumsNext");
  const wrap = document.querySelector(".albums-wrap");
  if (!el || !prev || !next) return;
  const step = () => el.clientWidth * 0.85;
  prev.addEventListener("click", () => el.scrollBy({ left: -step(), behavior: "smooth" }));
  next.addEventListener("click", () => el.scrollBy({ left: step(), behavior: "smooth" }));
  el.addEventListener("scroll", updateAlbumArrows, { passive: true });
  window.addEventListener("resize", updateAlbumArrows);
  if ("ResizeObserver" in window) new ResizeObserver(updateAlbumArrows).observe(el);

  // --- Défilement automatique (onglet « Tout »), pause au survol ---
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SPEED = 0.28;          // px par frame (lent)
  const START_DELAY = 2500;   // pause avant de (re)démarrer le défilement
  let dir = 1, paused = false, pos = 0, wasOk = false, resumeAt = 0;
  el.style.scrollSnapType = "none";   // pas d'aimantation : s'arrête sur place, défilement fluide

  if (wrap) {
    wrap.addEventListener("mouseenter", () => (paused = true));
    wrap.addEventListener("mouseleave", () => (paused = false));
    wrap.addEventListener("touchstart", () => (paused = true), { passive: true });
  }

  function eligible() {
    if (reduceMotion || paused) return false;
    if (activeFilter !== "all") return false;
    if (document.body.classList.contains("mode-home")) return false;
    const portfolio = document.querySelector('.panel[data-panel="portfolio"]');
    if (!portfolio || !portfolio.classList.contains("is-active")) return false;
    if ($("albumsView") && $("albumsView").hidden) return false; // pas dans une page album
    return el.scrollWidth - el.clientWidth > 4;
  }

  function autoTick() {
    const ok = eligible();
    if (ok && !wasOk) resumeAt = performance.now() + START_DELAY;  // délai au (re)démarrage
    wasOk = ok;
    if (ok && performance.now() >= resumeAt) {
      const max = el.scrollWidth - el.clientWidth;
      pos += dir * SPEED;
      if (pos >= max) { pos = max; dir = -1; }
      else if (pos <= 0) { pos = 0; dir = 1; }
      el.scrollLeft = pos;
    } else {
      pos = el.scrollLeft;   // immobile (survol ou délai) → on reste synchro, sans saut
    }
    requestAnimationFrame(autoTick);
  }
  if (!reduceMotion) requestAnimationFrame(autoTick);
})();

// Filtres Inspirations : indicateur glissant, on ne reconstruit pas les boutons
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#inspFilters .filter");
  if (!btn) return;
  if (btn.dataset.ifilter === inspFilter) return;
  inspFilter = btn.dataset.ifilter;
  const bar = $("inspFilters");
  bar.querySelectorAll(".filter").forEach((b) => b.classList.toggle("is-active", b === btn));
  syncFilterUnderline(bar);
  $("inspWall").scrollLeft = 0;
  renderInspWall();
});

// Flèches + défilement auto de la rangée d'inspirations
function updateInspArrows() {
  const el = $("inspWall"), prev = $("inspPrev"), next = $("inspNext");
  if (!el || !prev || !next) return;
  const max = el.scrollWidth - el.clientWidth;
  const overflow = max > 4;
  prev.hidden = !overflow || el.scrollLeft <= 2;
  next.hidden = !overflow || el.scrollLeft >= max - 2;
}
(function inspArrows() {
  const el = $("inspWall"), prev = $("inspPrev"), next = $("inspNext");
  const wrap = el ? el.closest(".albums-wrap") : null;
  if (!el || !prev || !next) return;
  const step = () => el.clientWidth * 0.85;
  prev.addEventListener("click", () => el.scrollBy({ left: -step(), behavior: "smooth" }));
  next.addEventListener("click", () => el.scrollBy({ left: step(), behavior: "smooth" }));
  el.addEventListener("scroll", updateInspArrows, { passive: true });
  window.addEventListener("resize", updateInspArrows);
  if ("ResizeObserver" in window) new ResizeObserver(updateInspArrows).observe(el);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SPEED = 0.28;
  const START_DELAY = 2500;
  let dir = 1, paused = false, pos = 0, wasOk = false, resumeAt = 0;
  el.style.scrollSnapType = "none";
  if (wrap) {
    wrap.addEventListener("mouseenter", () => (paused = true));
    wrap.addEventListener("mouseleave", () => (paused = false));
    wrap.addEventListener("touchstart", () => (paused = true), { passive: true });
  }
  function eligible() {
    if (reduceMotion || paused) return false;
    if (inspFilter !== "all") return false;
    if (document.body.classList.contains("mode-home")) return false;
    const panel = document.querySelector('.panel[data-panel="inspirations"]');
    if (!panel || !panel.classList.contains("is-active")) return false;
    return el.scrollWidth - el.clientWidth > 4;
  }
  function autoTick() {
    const ok = eligible();
    if (ok && !wasOk) resumeAt = performance.now() + START_DELAY;
    wasOk = ok;
    if (ok && performance.now() >= resumeAt) {
      const max = el.scrollWidth - el.clientWidth;
      pos += dir * SPEED;
      if (pos >= max) { pos = max; dir = -1; }
      else if (pos <= 0) { pos = 0; dir = 1; }
      el.scrollLeft = pos;
    } else {
      pos = el.scrollLeft;
    }
    requestAnimationFrame(autoTick);
  }
  if (!reduceMotion) requestAnimationFrame(autoTick);
})();

// Filtres : on déplace l'indicateur (glissé) sans reconstruire les boutons
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#filters .filter");
  if (!btn) return;
  if (btn.dataset.filter === activeFilter) return;
  activeFilter = btn.dataset.filter;
  const bar = $("filters");
  bar.querySelectorAll(".filter").forEach((b) => b.classList.toggle("is-active", b === btn));
  syncFilterUnderline(bar);     // glisse vers le filtre cliqué
  renderAlbums();
  playIn($("albums"));
});

// Ouvrir un album (page dédiée)
document.addEventListener("click", (e) => {
  const card = e.target.closest(".tile[data-album]");
  if (card) openAlbum(card.dataset.album);
});

// Carte récap « Contenu YouTube » (vue « Tout ») → bascule sur l'onglet YouTube
document.addEventListener("click", (e) => {
  if (e.target.closest(".tile[data-youtube]")) { activeFilter = "__yt"; renderAll(); }
});

// Vignette vidéo de l'onglet YouTube → ouvre le lecteur en lightbox
document.addEventListener("click", (e) => {
  const t = e.target.closest("#albums .tile[data-ytlb]");
  if (t) openLb(parseInt(t.dataset.ytlb, 10));
});

// Textes : ouvrir un écrit, ou la carte récap (→ onglet Textes)
document.addEventListener("click", (e) => {
  const card = e.target.closest(".tile[data-texte]");
  if (card) { openTexte(card.dataset.texte); return; }
  if (e.target.closest(".tile[data-go-txt]")) { activeFilter = "__txt"; renderAll(); }
});

// Fil de progression de lecture (mode lecture des Écrits)
function updateReadProgress() {
  const bar = $("readProgress"), body = $("txtBody");
  if (!bar || !body) return;
  const r = body.getBoundingClientRect();
  const len = r.height - window.innerHeight + 120;
  if (len <= 40) { bar.style.width = "0%"; return; }      // texte court → pas de barre
  const p = Math.min(1, Math.max(0, (-r.top + 80) / len));
  bar.style.width = (p * 100).toFixed(1) + "%";
}

function openTexte(id) {
  const t = allTextes.find((x) => x.id === id);
  if (!t) return;
  $("txtType").textContent = t.type || "";
  $("txtTitle").textContent = t.title || "";
  $("txtBody").innerHTML = sanitizeRich(t.body || "");
  $("albumsView").hidden = true;
  $("albumView").hidden = true;
  $("youtubeView").hidden = true;
  $("textView").hidden = false;
  playIn($("textView"));
  document.body.classList.add("reading");
  window.scrollTo(0, 0);
  const bar = $("readProgress");
  if (bar) { bar.classList.add("is-on"); }
  window.addEventListener("scroll", updateReadProgress, { passive: true });
  requestAnimationFrame(updateReadProgress);
}
function closeTexte() {
  $("textView").hidden = true;
  $("albumsView").hidden = false;
  playIn($("albumsView"));
  document.body.classList.remove("reading");
  const bar = $("readProgress");
  if (bar) { bar.classList.remove("is-on"); bar.style.width = "0%"; }
  window.removeEventListener("scroll", updateReadProgress);
}
if ($("txtBack")) $("txtBack").addEventListener("click", closeTexte);

// Sites web : aperçu intégré (iframe) + description
function openSite(id) {
  const s = allSites.find((x) => x.id === id);
  if (!s) return;
  $("siteTitle").textContent = s.title || "Site";
  $("siteDesc").textContent = s.desc || "";
  $("siteLinkWrap").innerHTML = s.url
    ? `<a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">Visiter le site ↗</a>`
    : "";
  $("siteFrame").src = s.url || "about:blank";
  $("albumsView").hidden = true;
  $("albumView").hidden = true;
  $("youtubeView").hidden = true;
  $("textView").hidden = true;
  $("siteView").hidden = false;
  playIn($("siteView"));
  window.scrollTo(0, 0);
}
function closeSite() {
  $("siteFrame").src = "about:blank";   // stoppe le chargement
  $("siteView").hidden = true;
  $("albumsView").hidden = false;
  playIn($("albumsView"));
}
if ($("siteBack")) $("siteBack").addEventListener("click", closeSite);

// Clics : ouvrir un site, ou la carte récap (→ onglet Sites web)
document.addEventListener("click", (e) => {
  const card = e.target.closest(".tile[data-site]");
  if (card) { openSite(card.dataset.site); return; }
  if (e.target.closest(".tile[data-go-site]")) { activeFilter = "__site"; renderAll(); }
});

function openYoutube() {
  const listEl = $("youtubeList");
  listEl.innerHTML = allVideos.length
    ? allVideos.map((v) => {
        const thumb = `https://img.youtube.com/vi/${esc(v.vid)}/hqdefault.jpg`;
        return `<div class="yt-item">
            <button class="yt-frame" data-vid="${esc(v.vid)}" aria-label="Lire ${esc(v.title || "la vidéo")}">
              <img src="${thumb}" alt="" loading="lazy" />
              <span class="yt-frame__play" aria-hidden="true">▶</span>
            </button>
            ${v.title ? `<p class="yt-item__title">${esc(v.title)}</p>` : ""}
          </div>`;
      }).join("")
    : '<div class="gallery__loading">Aucune vidéo pour l’instant.</div>';

  $("albumsView").hidden = true;
  $("albumView").hidden = true;
  $("youtubeView").hidden = false;
  window.scrollTo(0, 0);
}
function closeYoutube() {
  $("youtubeView").hidden = true;
  $("albumsView").hidden = false;
}
if ($("ytBack")) $("ytBack").addEventListener("click", closeYoutube);

// Lecture directe : remplace la vignette par le lecteur YouTube
document.addEventListener("click", (e) => {
  const f = e.target.closest(".yt-frame[data-vid]");
  if (!f) return;
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${f.dataset.vid}?rel=0&autoplay=1`;
  iframe.title = "Lecteur vidéo";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  f.replaceWith(iframe);
});

// ====================================================================
//  Inspirations : films, musiques, lectures (lecteurs intégrés + posters)
// ====================================================================
const KIND_LABEL = {
  music: "Musique", video: "Vidéo", film: "Film",
  serie: "Série", livre: "Livre", autre: "Autre",
};

function shownInsp() { return allInsp.length ? allInsp : DEMO_INSP; }

// Ordre des onglets Inspirations
const INSP_KIND_ORDER = ["music", "video", "film", "serie", "livre", "autre"];

function renderInspFilters() {
  const bar = $("inspFilters");
  if (!bar) return;
  const list = shownInsp();
  const present = INSP_KIND_ORDER.filter((k) => list.some((it) => (it.kind || "autre") === k));
  if (present.length <= 1) { bar.innerHTML = ""; return; }

  let html = `<button class="filter${inspFilter === "all" ? " is-active" : ""}" data-ifilter="all">Tout</button>`;
  html += present.map((k) =>
    `<button class="filter${inspFilter === k ? " is-active" : ""}" data-ifilter="${k}">${esc(KIND_LABEL[k])}</button>`
  ).join("");
  bar.innerHTML = html;
  requestAnimationFrame(() => syncFilterUnderline(bar));
}

function inspCardHTML(it) {
  const kind = it.kind || "autre";
  const title = esc(it.title || "");
  const sub = esc(it.subtitle || "");
  const label = KIND_LABEL[kind] || "Autre";
  const isEmbed = (kind === "music" || kind === "video") && it.embed;

  // Toutes les cartes : même zone média, hauteur fixe (calée sur Apple Music)
  let inner;
  if (kind === "video" && it.embed) {
    inner = `<iframe src="${esc(it.embed)}" title="${title || label}" loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  } else if (kind === "music" && it.embed) {
    inner = `<iframe src="${esc(it.embed)}" title="${title || label}" loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
  } else {
    inner = (it.cover
      ? `<img src="${esc(it.cover)}" alt="${title}" loading="lazy" />`
      : `<span class="insp-media__empty">${esc((it.title || label).slice(0, 1).toUpperCase())}</span>`)
      + `<span class="insp-poster__tag">${esc(label)}</span>`;
  }
  const media = `<span class="insp-media insp-media--${isEmbed ? "embed" : "poster"}">${inner}</span>`;

  const subText = sub || label;
  const cap = `<div class="insp-cap">
      ${title ? `<span class="insp-cap__title">${title}</span>` : ""}
      <span class="insp-cap__sub">${subText}${!isEmbed && it.url ? " · Voir ↗" : ""}</span>
    </div>`;

  // Poster avec lien externe → carte cliquable
  return (!isEmbed && it.url)
    ? `<a class="insp-card" href="${esc(it.url)}" target="_blank" rel="noopener">${media}${cap}</a>`
    : `<div class="insp-card">${media}${cap}</div>`;
}

function renderInspirations() {
  renderInspFilters();
  renderInspWall();
}
function renderInspWall() {
  const wall = $("inspWall");
  if (!wall) return;
  const all = shownInsp();
  const list = inspFilter === "all" ? all : all.filter((it) => (it.kind || "autre") === inspFilter);
  wall.innerHTML = list.length
    ? list.map(inspCardHTML).join("")
    : '<div class="gallery__loading">Bientôt — mes inspirations arrivent ici.</div>';
  playIn(wall);
  if (typeof updateInspArrows === "function") requestAnimationFrame(updateInspArrows);
}

async function openAlbum(id) {
  const a = shownAlbums().find((x) => x.id === id);
  if (!a) return;

  $("albumCat").textContent = a.category || "";
  $("albumTitle").textContent = a.title || "";
  $("albumDesc").textContent = a.description || "";
  $("albumLinkWrap").innerHTML = a.link
    ? `<a class="btn" href="${esc(a.link)}" target="_blank" rel="noopener">Voir ↗</a>`
    : "";

  const grid = $("albumPhotos");
  grid.innerHTML = '<div class="gallery__loading">Chargement…</div>';
  $("albumsView").hidden = true;
  $("albumView").hidden = false;
  playIn($("albumView"));
  window.scrollTo(0, 0);

  const ph = await loadAlbumPhotos(a);   // ← photos téléchargées seulement maintenant
  grid.innerHTML = ph.length
    ? ph.map((m, i) => {
        if (m.youtube) {
          const thumb = `https://img.youtube.com/vi/${esc(m.youtube)}/hqdefault.jpg`;
          return `<button class="tile" data-lb="${i}">
              <span class="tile__media">
                <img src="${thumb}" alt="${esc(m.title || "")}" loading="lazy" />
                <span class="tile__play" aria-hidden="true">▶</span>
              </span>
              ${m.title ? `<span class="tile__cap"><span class="tile__name">${esc(m.title)}</span></span>` : ""}
            </button>`;
        }
        return `<button class="tile" data-lb="${i}">
            <span class="tile__media"><img src="${esc(m.src)}" alt="${esc(m.title || "")}" loading="lazy" /></span>
            ${m.title ? `<span class="tile__cap"><span class="tile__name">${esc(m.title)}</span></span>` : ""}
          </button>`;
      }).join("")
    : '<div class="gallery__loading">Album vide pour l’instant.</div>';

  // Éléments pour la lightbox (image ou vidéo)
  lbList = ph.map((m) =>
    m.youtube
      ? { type: "video", id: m.youtube, title: m.title || "" }
      : { type: "image", src: m.src, title: m.title || "" }
  );
}

function closeAlbum() {
  $("albumView").hidden = true;
  $("albumsView").hidden = false;
  playIn($("albumsView"));
}
if ($("albumBack")) $("albumBack").addEventListener("click", closeAlbum);

// ====================================================================
//  Lightbox avec navigation (préc / suiv) dans l'album
// ====================================================================
let lbList = [];
let lbIndex = 0;
const lb = $("lightbox"), lbImg = $("lbImg");
function showLb(i) {
  if (!lbList.length) return;
  lbIndex = (i + lbList.length) % lbList.length;
  const item = lbList[lbIndex];
  const img = $("lbImg"), vWrap = $("lbVideoWrap"), vFrame = $("lbVideo"), title = $("lbTitle");

  if (item.type === "video") {
    img.hidden = true; img.src = "";
    vWrap.hidden = false;
    vFrame.src = `https://www.youtube.com/embed/${item.id}?rel=0&autoplay=1`;
  } else {
    vWrap.hidden = true; vFrame.src = "";
    img.hidden = false; img.src = item.src;
  }
  title.textContent = item.title || "";

  const multi = lbList.length > 1;
  $("lbPrev").style.display = multi ? "" : "none";
  $("lbNext").style.display = multi ? "" : "none";
  // Zones cliquables désactivées : un clic en dehors de la photo ferme la lightbox.
  // (navigation via les flèches, le clavier et le swipe)
  $("lbZonePrev").hidden = true;
  $("lbZoneNext").hidden = true;
}
function openLb(i) {
  showLb(i);
  lb.classList.add("is-open");
  lb.setAttribute("aria-hidden", "false");
}
function closeLb() {
  lb.classList.remove("is-open");
  lb.setAttribute("aria-hidden", "true");
  $("lbImg").src = "";
  $("lbVideo").src = ""; // stoppe la lecture
  $("lbVideoWrap").hidden = true;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("#albumPhotos .tile[data-lb]");
  if (t) openLb(parseInt(t.dataset.lb, 10));
});
if ($("lbClose")) $("lbClose").addEventListener("click", closeLb);
if ($("lbPrev")) $("lbPrev").addEventListener("click", (e) => { e.stopPropagation(); showLb(lbIndex - 1); });
if ($("lbNext")) $("lbNext").addEventListener("click", (e) => { e.stopPropagation(); showLb(lbIndex + 1); });
if ($("lbZonePrev")) $("lbZonePrev").addEventListener("click", (e) => { e.stopPropagation(); showLb(lbIndex - 1); });
if ($("lbZoneNext")) $("lbZoneNext").addEventListener("click", (e) => { e.stopPropagation(); showLb(lbIndex + 1); });
if (lb) lb.addEventListener("click", (e) => {
  // Ferme si le clic n'est pas sur la photo, la vidéo, les flèches ou le bouton fermer
  if (e.target.closest("#lbImg, #lbVideoWrap, .lightbox__nav, .lightbox__close, .lightbox__title")) return;
  closeLb();
});

// Glissé (swipe) pour changer de photo sur mobile
if (lb) {
  let sx = 0, sy = 0;
  lb.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY;
  }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) showLb(lbIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });
}
document.addEventListener("keydown", (e) => {
  if (!lb.classList.contains("is-open")) return;
  if (e.key === "Escape") closeLb();
  else if (e.key === "ArrowLeft") showLb(lbIndex - 1);
  else if (e.key === "ArrowRight") showLb(lbIndex + 1);
});

// ====================================================================
//  Apparitions au scroll
// ====================================================================
let io = null;
function observeReveals() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    return;
  }
  if (!io) {
    io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
  }
  document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => io.observe(el));
}
observeReveals();

// ====================================================================
//  Démarrage
// ====================================================================
if (isConfigured) {
  onValue(ref(db, "content"), (snap) => renderContent(snap.val() || {}));
  onValue(ref(db, "albums"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    allAlbums = arr;
    renderAll();
  });
  onValue(ref(db, "youtube"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    allVideos = arr;
    renderAll();
  });
  onValue(ref(db, "inspirations"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    allInsp = arr;
    renderInspirations();
  });
  onValue(ref(db, "textes"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    allTextes = arr;
    renderAll();
  });
  onValue(ref(db, "sites"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    allSites = arr;
    renderAll();
  });
  onValue(ref(db, "timeline"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    allTimeline = arr;
    renderTimeline();
  });
} else {
  renderContent({});
  renderAll();
  renderInspirations();
}
