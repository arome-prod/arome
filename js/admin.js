// ====================================================================
//  admin.js — mini-CMS arome (édition en direct via Realtime Database)
//  Accès : #admin dans l'URL, ou triple-clic sur la signature « arome »
//          du footer. Mot de passe : voir js/config.js.
//  Images : compressées dans le navigateur puis stockées en base64.
//  ⚠️ Protection côté navigateur uniquement, PAS une vraie sécurité.
// ====================================================================

import {
  ref, onValue, set, update, push, remove,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { db, isConfigured } from "./firebase.js";
import { ADMIN_PASSWORD, DEFAULTS, IMAGE_MAX_DIM, IMAGE_QUALITY } from "./config.js";

const overlay = document.getElementById("adminOverlay");
if (overlay) {
  let unlocked = false;
  let content = structuredClone(DEFAULTS);
  let items = [];
  let pendingImage = null; // data URL préparée pour l'ajout

  const esc = (s = "") =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // --- Compression image → data URL base64 -------------------------
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) { reject(new Error("Pas une image")); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  const kb = (dataUrl) => Math.round((dataUrl.length * 0.75) / 1024);

  // --- Ouverture / fermeture ---------------------------------------
  function openAdmin() {
    if (!isConfigured) {
      alert("Configure d'abord Firebase (js/firebase-config.js) pour utiliser l'admin.");
      return;
    }
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    render();
  }
  function closeAdmin() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    if (location.hash === "#admin") history.replaceState(null, "", location.pathname);
  }

  if (location.hash === "#admin") openAdmin();
  window.addEventListener("hashchange", () => { if (location.hash === "#admin") openAdmin(); });

  const sign = document.querySelector(".footer__sign");
  if (sign) {
    let clicks = 0, timer = null;
    sign.addEventListener("click", () => {
      clicks++; clearTimeout(timer);
      timer = setTimeout(() => (clicks = 0), 600);
      if (clicks >= 3) { clicks = 0; openAdmin(); }
    });
  }

  // --- Données en direct -------------------------------------------
  if (isConfigured) {
    onValue(ref(db, "content"), (snap) => {
      const v = snap.val() || {};
      content = {
        hero: { ...DEFAULTS.hero, ...(v.hero || {}) },
        about: { ...DEFAULTS.about, ...(v.about || {}) },
        contact: { ...DEFAULTS.contact, ...(v.contact || {}) },
      };
      if (unlocked) render();
    });
    onValue(ref(db, "portfolio"), (snap) => {
      const arr = [];
      snap.forEach((c) => arr.push({ id: c.key, ...c.val() }));
      arr.sort((a, b) => (a.order || 0) - (b.order || 0));
      items = arr;
      if (unlocked) render();
    });
  }

  // --- Rendu --------------------------------------------------------
  function render() {
    if (!unlocked) return renderGate();

    const skillsStr = Array.isArray(content.about.skills)
      ? content.about.skills.join(", ") : (content.about.skills || "");
    const cats = [...new Set(items.map((i) => (i.category || "").trim()).filter(Boolean))];

    overlay.innerHTML = `
      <div class="admin__panel">
        <button class="admin__close" data-act="close" aria-label="Fermer">✕</button>
        <h2 class="admin__title">arome · admin</h2>
        <p class="admin__hint">Tout est enregistré en direct dans la base.</p>

        <section class="admin__block">
          <h3>Hero</h3>
          <label>Accroche<input id="f-tagline" value="${esc(content.hero.tagline)}" /></label>
          <button class="btn btn--sm" data-act="save-hero">Enregistrer</button>
        </section>

        <section class="admin__block">
          <h3>À propos</h3>
          <label>Texte (ligne vide = nouveau paragraphe)
            <textarea id="f-about" rows="5">${esc(content.about.text)}</textarea></label>
          <label>Compétences (séparées par des virgules)
            <input id="f-skills" value="${esc(skillsStr)}" /></label>
          <button class="btn btn--sm" data-act="save-about">Enregistrer</button>
        </section>

        <section class="admin__block">
          <h3>Contact</h3>
          <label>Email <input id="f-email" value="${esc(content.contact.email)}" /></label>
          <label>Instagram (URL) <input id="f-insta" value="${esc(content.contact.instagram)}" /></label>
          <label>Vinted (URL) <input id="f-vinted" value="${esc(content.contact.vinted)}" /></label>
          <button class="btn btn--sm" data-act="save-contact">Enregistrer</button>
        </section>

        <section class="admin__block">
          <h3>Projets <span class="admin__count">${items.length}</span></h3>
          <div class="admin__items">
            ${items.map(renderItem).join("") || '<p class="admin__hint">Aucun projet.</p>'}
          </div>

          <h4>Ajouter un projet</h4>
          <div class="admin__addform">
            <input id="n-title" placeholder="Titre" />
            <input id="n-cat" list="catlist" placeholder="Catégorie (Photo, Design, Musique…)" />
            <datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
            <label class="admin__file">
              <span>Image (depuis l'ordi — compressée auto)</span>
              <input id="n-file" type="file" accept="image/*" />
            </label>
            <div id="n-preview" class="admin__preview"></div>
            <input id="n-imgurl" placeholder="…ou colle une URL d'image (optionnel)" />
            <input id="n-link" placeholder="Lien externe (vidéo, site… optionnel)" />
            <button class="btn btn--sm" data-act="add">Ajouter le projet</button>
          </div>
        </section>

        <p class="admin__hint admin__foot">Astuce : garde des images légères. La compression vise ~150–300 Ko chacune.</p>
      </div>`;

    bind();
  }

  function renderGate() {
    overlay.innerHTML = `
      <div class="admin__panel admin__panel--gate">
        <button class="admin__close" data-act="close" aria-label="Fermer">✕</button>
        <h2 class="admin__title">arome · admin</h2>
        <p class="admin__hint">Accès réservé.</p>
        <form id="gateForm" class="admin__gate">
          <input type="password" id="gatePass" placeholder="Mot de passe" autocomplete="current-password" />
          <button class="btn" type="submit">Entrer</button>
          <p id="gateErr" class="admin__err"></p>
        </form>
      </div>`;
    overlay.querySelector("#gateForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if (overlay.querySelector("#gatePass").value === ADMIN_PASSWORD) { unlocked = true; render(); }
      else overlay.querySelector("#gateErr").textContent = "Mot de passe incorrect.";
    });
    bindClose();
  }

  function renderItem(it) {
    const thumb = it.image
      ? `<img class="admin__thumb" src="${esc(it.image)}" alt="" />`
      : `<span class="admin__thumb admin__thumb--empty">${it.link ? "↗" : "◻"}</span>`;
    return `<div class="admin__item">
        ${thumb}
        <span class="admin__item-title">${esc(it.title || "(sans titre)")}<br><small>${esc(it.category || "")}</small></span>
        <span class="admin__item-actions">
          <button data-act="up" data-id="${it.id}" aria-label="Monter">↑</button>
          <button data-act="down" data-id="${it.id}" aria-label="Descendre">↓</button>
          <button data-act="del" data-id="${it.id}" aria-label="Supprimer">🗑</button>
        </span>
      </div>`;
  }

  // --- Liaisons -----------------------------------------------------
  function bind() {
    bindClose();
    overlay.querySelector('[data-act="save-hero"]').addEventListener("click", saveHero);
    overlay.querySelector('[data-act="save-about"]').addEventListener("click", saveAbout);
    overlay.querySelector('[data-act="save-contact"]').addEventListener("click", saveContact);
    overlay.querySelector('[data-act="add"]').addEventListener("click", addItem);
    overlay.querySelectorAll('[data-act="del"]').forEach((b) =>
      b.addEventListener("click", () => delItem(b.dataset.id)));
    overlay.querySelectorAll('[data-act="up"]').forEach((b) =>
      b.addEventListener("click", () => moveItem(b.dataset.id, -1)));
    overlay.querySelectorAll('[data-act="down"]').forEach((b) =>
      b.addEventListener("click", () => moveItem(b.dataset.id, 1)));

    pendingImage = null;
    const file = overlay.querySelector("#n-file");
    const prev = overlay.querySelector("#n-preview");
    if (file) file.addEventListener("change", async () => {
      const f = file.files[0];
      if (!f) { pendingImage = null; prev.innerHTML = ""; return; }
      prev.textContent = "Compression…";
      try {
        pendingImage = await fileToDataURL(f);
        prev.innerHTML = `<img src="${pendingImage}" alt="" /><span>${kb(pendingImage)} Ko</span>`;
      } catch (e) { prev.textContent = "Image illisible."; pendingImage = null; }
    });
  }

  function bindClose() {
    overlay.querySelectorAll('[data-act="close"]').forEach((b) =>
      b.addEventListener("click", closeAdmin));
  }

  // --- Toast --------------------------------------------------------
  function toast(msg) {
    let t = overlay.querySelector(".admin__toast");
    if (!t) { t = document.createElement("div"); t.className = "admin__toast"; overlay.appendChild(t); }
    t.textContent = msg; t.classList.add("is-on");
    setTimeout(() => t.classList.remove("is-on"), 1800);
  }

  // --- Écritures ----------------------------------------------------
  async function saveHero() {
    await update(ref(db, "content/hero"), { tagline: overlay.querySelector("#f-tagline").value.trim() });
    toast("Hero enregistré ✦");
  }
  async function saveAbout() {
    const skills = overlay.querySelector("#f-skills").value.split(",").map((s) => s.trim()).filter(Boolean);
    await set(ref(db, "content/about"), { text: overlay.querySelector("#f-about").value, skills });
    toast("À propos enregistré ✦");
  }
  async function saveContact() {
    await set(ref(db, "content/contact"), {
      email: overlay.querySelector("#f-email").value.trim(),
      instagram: overlay.querySelector("#f-insta").value.trim(),
      vinted: overlay.querySelector("#f-vinted").value.trim(),
    });
    toast("Contact enregistré ✦");
  }
  async function addItem() {
    const title = overlay.querySelector("#n-title").value.trim();
    const category = overlay.querySelector("#n-cat").value.trim();
    const link = overlay.querySelector("#n-link").value.trim();
    const imgUrl = overlay.querySelector("#n-imgurl").value.trim();
    const image = pendingImage || imgUrl || "";
    if (!title && !image && !link) { toast("Ajoute au moins un titre, une image ou un lien."); return; }
    const order = items.length ? Math.max(...items.map((i) => i.order || 0)) + 1 : 0;
    const data = { title, category, order, createdAt: Date.now() };
    if (image) data.image = image;
    if (link) data.link = link;
    try {
      await push(ref(db, "portfolio"), data);
      toast("Projet ajouté ✦");
    } catch (e) {
      console.error(e);
      toast("Échec — image peut-être trop lourde ?");
    }
  }
  async function delItem(id) {
    if (!confirm("Supprimer ce projet ?")) return;
    await remove(ref(db, "portfolio/" + id));
    toast("Projet supprimé");
  }
  async function moveItem(id, dir) {
    const idx = items.findIndex((i) => i.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    const a = items[idx], b = items[swap];
    await update(ref(db, "portfolio"), {
      [`${a.id}/order`]: b.order ?? swap,
      [`${b.id}/order`]: a.order ?? idx,
    });
  }

  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAdmin(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) closeAdmin();
  });
}
