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

import { db, isConfigured } from "./firebase.js";
import { DEFAULTS, DEMO } from "./config.js";

const $ = (id) => document.getElementById(id);
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const yearEl = $("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

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
      out.push(`<a class="btn" href="mailto:${esc(data.contact.email)}">✉ Email</a>`);
    if (data.contact.instagram)
      out.push(`<a class="btn" href="${esc(data.contact.instagram)}" target="_blank" rel="noopener">◎ Instagram</a>`);
    if (data.contact.vinted)
      out.push(`<a class="btn" href="${esc(data.contact.vinted)}" target="_blank" rel="noopener">◈ Vinted</a>`);
    links.innerHTML = out.join("");
  }
}

// ====================================================================
//  Portfolio : projets + filtres par catégorie
// ====================================================================
let allItems = [];
let activeFilter = "all";

// Tant qu'aucun vrai projet n'existe, on montre les exemples.
function shownItems() { return allItems.length ? allItems : DEMO; }
function isDemo() { return allItems.length === 0; }

function categoriesOf(items) {
  const set = [];
  items.forEach((it) => {
    const cat = (it.category || "").trim();
    if (cat && !set.includes(cat)) set.push(cat);
  });
  return set;
}

function renderFilters() {
  const bar = $("filters");
  if (!bar) return;
  const cats = categoriesOf(shownItems());
  if (cats.length <= 1) { bar.innerHTML = ""; return; }
  bar.innerHTML =
    `<button class="filter${activeFilter === "all" ? " is-active" : ""}" data-filter="all">Tout</button>` +
    cats.map((c) =>
      `<button class="filter${activeFilter === c ? " is-active" : ""}" data-filter="${esc(c)}">${esc(c)}</button>`
    ).join("");
}

function renderPortfolio() {
  const gallery = $("gallery");
  if (!gallery) return;

  const list = shownItems().filter((it) => activeFilter === "all" || it.category === activeFilter);

  if (list.length === 0) {
    gallery.innerHTML =
      `<div class="gallery__loading">Aucun projet${isConfigured ? " — ajoute-en via l’admin." : "."}</div>`;
    return;
  }

  const demoNote = isDemo()
    ? '<p class="gallery__demo">Exemples — remplace-les par tes vrais projets via l’admin (#admin).</p>'
    : "";

  gallery.innerHTML = demoNote + list.map((it) => {
    const cat = it.category ? `<span class="tile__cat">${esc(it.category)}</span>` : "";
    const titleBar = `<span class="tile__title">${esc(it.title || "")}${cat}</span>`;
    const media = it.image
      ? `<img src="${esc(it.image)}" alt="${esc(it.title || "")}" loading="lazy" />`
      : `<span class="tile__empty">${esc(it.category || "projet")}</span>`;

    // Lien externe → ouvre dans un onglet ; sinon image cliquable (lightbox)
    if (it.link) {
      return `<a class="tile tile--link reveal" data-cat="${esc(it.category || "")}" href="${esc(it.link)}" target="_blank" rel="noopener">
          ${media}<span class="tile__play" aria-hidden="true">↗</span>${titleBar}
        </a>`;
    }
    return `<button class="tile reveal" data-cat="${esc(it.category || "")}" data-full="${esc(it.image || "")}" aria-label="${esc(it.title || "Projet")}">
        ${media}${titleBar}
      </button>`;
  }).join("");

  observeReveals();
}

function renderAll() { renderFilters(); renderPortfolio(); }

document.addEventListener("click", (e) => {
  const btn = e.target.closest("#filters .filter");
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  renderAll();
});

// ====================================================================
//  Lightbox
// ====================================================================
const lb = $("lightbox"), lbImg = $("lbImg"), lbClose = $("lbClose");
function closeLightbox() {
  if (!lb) return;
  lb.classList.remove("is-open");
  lb.setAttribute("aria-hidden", "true");
  lbImg.src = "";
}
document.addEventListener("click", (e) => {
  const tile = e.target.closest(".tile[data-full]");
  if (tile && tile.dataset.full) {
    lbImg.src = tile.dataset.full;
    lb.classList.add("is-open");
    lb.setAttribute("aria-hidden", "false");
  }
});
if (lbClose) lbClose.addEventListener("click", closeLightbox);
if (lb) lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

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
    snap.forEach((c) => items.push({ id: c.key, ...c.val() }));
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
  onValue(query(ref(db, "portfolio"), orderByChild("order")), (snap) => {
    const items = [];
    snap.forEach((c) => items.push({ id: c.key, ...c.val() }));
    allItems = items;
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
