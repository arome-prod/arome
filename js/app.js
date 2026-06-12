// ====================================================================
//  app.js — site public arome (one-page)
//  Rend textes + projets depuis la Realtime Database, filtres par
//  catégorie, lightbox, apparitions au scroll, livre d'or, compteur.
// ====================================================================

import {
  ref,
  push,
  onValue,
  runTransaction,
  query,
  orderByChild,
  limitToLast,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { db, isConfigured } from "./firebase.js?v=21";
import { DEFAULTS, DEMO } from "./config.js?v=21";

const $ = (id) => document.getElementById(id);
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const yearEl = $("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ====================================================================
//  Navigation : la marque glisse de l'accueil vers la barre du haut
//  (technique FLIP : on mesure avant/après et on anime la différence)
// ====================================================================
(function navigation() {
  const body = document.body;
  const brand = document.querySelector(".brand");
  const panels = document.querySelectorAll(".panel");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flipEls = [
    brand.querySelector(".brand__logo"),
    ...brand.querySelectorAll(".brand__nav button"),
  ];

  function setActive(key) {
    panels.forEach((p) => p.classList.toggle("is-active", p.dataset.panel === key));
    document.querySelectorAll("[data-go]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.go === key));
  }
  setActive("portfolio");

  // Anime les éléments de la marque entre deux mises en page.
  function flip(change) {
    if (reduce) { change(); return; }
    const first = flipEls.map((el) => el.getBoundingClientRect());
    change();
    const last = flipEls.map((el) => el.getBoundingClientRect());
    flipEls.forEach((el, i) => {
      const dx = first[i].left - last[i].left;
      const dy = first[i].top - last[i].top;
      const s = last[i].height ? first[i].height / last[i].height : 1;
      el.style.transition = "none";
      el.style.transformOrigin = "left top";
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
    });
    void brand.offsetWidth; // force un reflow
    requestAnimationFrame(() => {
      flipEls.forEach((el) => {
        el.style.transition = "transform 0.62s cubic-bezier(0.7, 0, 0.2, 1)";
        el.style.transform = "";
      });
    });
  }

  function navTo(key) {
    const home = body.classList.contains("mode-home");

    if (key === "home") {
      if (home) return;
      flip(() => body.classList.add("mode-home"));
      return;
    }

    // Déjà dans une section : on change juste de panneau (la barre ne bouge pas)
    if (!home) {
      const active = document.querySelector(".panel.is-active");
      if (active && active.dataset.panel === key) return;
      setActive(key);
      window.scrollTo(0, 0);
      return;
    }

    // Depuis l'accueil → section : la marque glisse vers le haut
    flip(() => { body.classList.remove("mode-home"); setActive(key); });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", (e) => { e.preventDefault(); navTo(b.dataset.go); }));
})();

// ====================================================================
//  Accès admin : #admin dans l'URL, ou triple-clic sur « arome »
//  → ouvre la page dédiée admin.html
// ====================================================================
(function adminAccess() {
  if (location.hash === "#admin") { location.href = "admin.html"; return; }
  document.querySelectorAll("[data-admin-trigger]").forEach((el) => {
    let clicks = 0, timer = null;
    el.addEventListener("click", () => {
      clicks++; clearTimeout(timer);
      timer = setTimeout(() => (clicks = 0), 600);
      if (clicks >= 3) { location.href = "admin.html"; }
    });
  });
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
let activeFilter = "all";

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
function coverSrc(a) {
  const ph = photosOf(a);
  if (a.coverId && ph.length) {
    const c = ph.find((p) => p.id === a.coverId);
    if (c) return c.src;
  }
  if (ph.length) return ph[0].src;
  return a.cover || "";
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
  if (cats.length <= 1) { bar.innerHTML = ""; return; }
  bar.innerHTML =
    `<button class="filter${activeFilter === "all" ? " is-active" : ""}" data-filter="all">Tout</button>` +
    cats.map((c) =>
      `<button class="filter${activeFilter === c ? " is-active" : ""}" data-filter="${esc(c)}">${esc(c)}</button>`
    ).join("");
}

function renderAlbums() {
  const grid = $("albums");
  if (!grid) return;
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
    const n = photosOf(a).length;
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
}

function renderAll() { renderFilters(); renderAlbums(); }

// Filtres
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#filters .filter");
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  renderAll();
});

// Ouvrir un album (page dédiée)
document.addEventListener("click", (e) => {
  const card = e.target.closest(".tile[data-album]");
  if (card) openAlbum(card.dataset.album);
});

function openAlbum(id) {
  const a = shownAlbums().find((x) => x.id === id);
  if (!a) return;
  const ph = photosOf(a);

  $("albumCat").textContent = a.category || "";
  $("albumTitle").textContent = a.title || "";
  $("albumDesc").textContent = a.description || "";
  $("albumLinkWrap").innerHTML = a.link
    ? `<a class="btn" href="${esc(a.link)}" target="_blank" rel="noopener">Voir ↗</a>`
    : "";

  const grid = $("albumPhotos");
  grid.innerHTML = ph.length
    ? ph.map((p, i) =>
        `<button class="tile" data-lb="${i}"><span class="tile__media"><img src="${esc(p.src)}" alt="" loading="lazy" /></span></button>`
      ).join("")
    : '<div class="gallery__loading">Album vide pour l’instant.</div>';

  // Liste pour la lightbox
  lbList = ph.map((p) => p.src);

  $("albumsView").hidden = true;
  $("albumView").hidden = false;
  window.scrollTo(0, 0);
}

function closeAlbum() {
  $("albumView").hidden = true;
  $("albumsView").hidden = false;
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
  lbImg.src = lbList[lbIndex];
  const multi = lbList.length > 1;
  $("lbPrev").style.display = multi ? "" : "none";
  $("lbNext").style.display = multi ? "" : "none";
}
function openLb(i) {
  showLb(i);
  lb.classList.add("is-open");
  lb.setAttribute("aria-hidden", "false");
}
function closeLb() {
  lb.classList.remove("is-open");
  lb.setAttribute("aria-hidden", "true");
  lbImg.src = "";
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("#albumPhotos .tile[data-lb]");
  if (t) openLb(parseInt(t.dataset.lb, 10));
});
if ($("lbClose")) $("lbClose").addEventListener("click", closeLb);
if ($("lbPrev")) $("lbPrev").addEventListener("click", (e) => { e.stopPropagation(); showLb(lbIndex - 1); });
if ($("lbNext")) $("lbNext").addEventListener("click", (e) => { e.stopPropagation(); showLb(lbIndex + 1); });
if (lb) lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); });
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
//  Firebase : compteur + livre d'or
// ====================================================================
function initVisitCounter() {
  const el = $("visitCount");
  if (!el) return;
  const counterRef = ref(db, "stats/visits");
  if (sessionStorage.getItem("counted") !== "1") {
    runTransaction(counterRef, (cur) => (cur || 0) + 1)
      .then(() => sessionStorage.setItem("counted", "1"))
      .catch((err) => console.error("Compteur :", err));
  }
  onValue(counterRef, (snap) => {
    el.textContent = (snap.val() || 0).toLocaleString("fr-FR");
  });
}

function initGuestbook() {
  const messagesRef = ref(db, "guestbook");
  const form = $("guestbookForm"), statusEl = $("gbStatus"), listEl = $("gbList");
  if (!form || !listEl) return;

  const recent = query(messagesRef, orderByChild("createdAt"), limitToLast(50));
  onValue(recent, (snap) => {
    const items = [];
    snap.forEach((c) => { items.push({ id: c.key, ...c.val() }); });
    items.reverse();
    listEl.innerHTML = items.length
      ? items.map(renderMessage).join("")
      : '<li class="gb-list__empty">Aucun message. Sois le premier !</li>';
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("gbName").value.trim();
    const message = $("gbMessage").value.trim();
    if (!name || !message) return;
    const btn = form.querySelector("button");
    btn.disabled = true; statusEl.textContent = "Envoi…";
    try {
      await push(messagesRef, {
        name: name.slice(0, 40),
        message: message.slice(0, 280),
        createdAt: serverTimestamp(),
      });
      form.reset();
      statusEl.textContent = "Merci pour ton message ! ✦";
    } catch (err) {
      console.error("Envoi :", err);
      statusEl.textContent = "Oups, échec de l'envoi.";
    } finally {
      btn.disabled = false;
      setTimeout(() => (statusEl.textContent = ""), 4000);
    }
  });
}

function renderMessage(it) {
  const date = it.createdAt
    ? new Date(it.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  return `<li class="gb-list__item">
      <div class="gb-list__head">
        <span class="gb-list__name">${esc(it.name)}</span>
        <span class="gb-list__date">${date}</span>
      </div>
      <p class="gb-list__msg">${esc(it.message)}</p>
    </li>`;
}

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
    // Si l'album ouvert a changé, on reste cohérent : on re-render la grille
    renderAll();
  });
  initVisitCounter();
  initGuestbook();
} else {
  renderContent({});
  renderAll();
  const vc = $("visitCount"); if (vc) vc.textContent = "—";
  const gb = $("gbList");
  if (gb)
    gb.innerHTML =
      '<li class="gb-list__empty">⚙️ Configure Firebase dans js/firebase-config.js pour activer le livre d\'or et l’admin.</li>';
}
