// ====================================================================
//  admin-page.js — page d'administration dédiée (admin.html)
//  CRUD complet des projets (ajouter / MODIFIER / supprimer / réordonner)
//  + édition des textes. Stockage dans la Realtime Database.
//  ⚠️ Mot de passe côté navigateur : pas une vraie sécurité (voir README).
// ====================================================================

import {
  ref, onValue, set, update, push, remove,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { db, isConfigured } from "./firebase.js?v=8";
import { ADMIN_PASSWORD, DEFAULTS, IMAGE_MAX_DIM, IMAGE_QUALITY } from "./config.js?v=8";

console.log("admin-page chargé · Firebase configuré :", isConfigured);

const $ = (id) => document.getElementById(id);

// Indicateur visible : prouve que le script s'exécute bien.
if (document.getElementById("gateHint")) {
  document.getElementById("gateHint").textContent = isConfigured
    ? "Accès réservé."
    : "⚠️ Firebase non configuré (vérifie js/firebase-config.js).";
}
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

let content = JSON.parse(JSON.stringify(DEFAULTS));
let items = [];
let editingId = null;     // null = mode "ajout"
let pendingImage = null;  // nouvelle image (data URL) choisie dans l'éditeur

// ====================================================================
//  CONNEXION — attachée tout de suite, sans condition
// ====================================================================
function unlock() {
  $("gate").hidden = true;
  $("app").hidden = false;
  try { fillContentForms(); } catch (e) { console.error(e); }
  if (!isConfigured) {
    toast("⚠️ Firebase non configuré : l'enregistrement ne marchera pas.");
  }
}

const gateForm = $("gateForm");
if (gateForm) {
  gateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = ($("gatePass").value || "").trim();
    if (val === ADMIN_PASSWORD) {
      $("gateErr").textContent = "";
      unlock();
    } else {
      $("gateErr").textContent = "Mot de passe incorrect.";
    }
  });
} else {
  console.error("Formulaire de connexion introuvable (#gateForm).");
}

if ($("logout")) $("logout").addEventListener("click", () => { location.href = "index.html"; });

// ====================================================================
//  Helpers
// ====================================================================
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("is-on");
  setTimeout(() => t.classList.remove("is-on"), 2200);
}

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
const kb = (d) => Math.round((d.length * 0.75) / 1024);

// ====================================================================
//  Textes
// ====================================================================
function fillContentForms() {
  $("c-tagline").value = content.hero.tagline || "";
  $("c-about").value = content.about.text || "";
  $("c-skills").value = Array.isArray(content.about.skills)
    ? content.about.skills.join(", ") : (content.about.skills || "");
  $("c-email").value = content.contact.email || "";
  $("c-insta").value = content.contact.instagram || "";
  $("c-vinted").value = content.contact.vinted || "";
}

// ====================================================================
//  Projets
// ====================================================================
function refreshCatList() {
  const dl = $("catlist");
  if (!dl) return;
  const cats = [...new Set(items.map((i) => (i.category || "").trim()).filter(Boolean))];
  dl.innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join("");
}

function renderList() {
  const box = $("projList");
  if (!box) return;
  $("projCount").textContent = items.length;
  if (!items.length) { box.innerHTML = '<p class="adm-empty">Aucun projet pour l\'instant.</p>'; return; }
  box.innerHTML = items.map((it, i) => {
    const thumb = it.image
      ? `<img class="adm-card__img" src="${esc(it.image)}" alt="" />`
      : `<span class="adm-card__img adm-card__img--empty">${it.link ? "↗" : "—"}</span>`;
    return `<div class="adm-card${editingId === it.id ? " is-editing" : ""}">
        ${thumb}
        <div class="adm-card__body">
          <span class="adm-card__title">${esc(it.title || "(sans titre)")}</span>
          <span class="adm-card__cat">${esc(it.category || "—")}</span>
        </div>
        <div class="adm-card__actions">
          <button data-act="edit" data-id="${it.id}">Modifier</button>
          <button data-act="up" data-id="${it.id}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
          <button data-act="down" data-id="${it.id}" ${i === items.length - 1 ? "disabled" : ""} aria-label="Descendre">↓</button>
          <button data-act="del" data-id="${it.id}" class="adm-danger" aria-label="Supprimer">Supprimer</button>
        </div>
      </div>`;
  }).join("");

  box.querySelectorAll("[data-act]").forEach((b) => {
    const id = b.dataset.id, act = b.dataset.act;
    b.addEventListener("click", () => {
      if (act === "edit") startEdit(id);
      else if (act === "del") delProject(id);
      else if (act === "up") moveProject(id, -1);
      else if (act === "down") moveProject(id, 1);
    });
  });
}

function startEdit(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  editingId = id;
  pendingImage = null;
  $("editorTitle").textContent = "Modifier le projet";
  $("f-title").value = it.title || "";
  $("f-cat").value = it.category || "";
  $("f-link").value = it.link || "";
  $("f-imgurl").value = "";
  $("f-file").value = "";
  $("newPreview").innerHTML = "";
  const cur = $("curImage");
  if (it.image) { cur.hidden = false; $("curImageImg").src = it.image; }
  else { cur.hidden = true; $("curImageImg").src = ""; }
  $("resetEditor").hidden = false;
  $("saveProject").textContent = "Enregistrer les modifications";
  renderList();
  document.querySelector(".adm-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetEditor() {
  editingId = null;
  pendingImage = null;
  $("editorTitle").textContent = "Ajouter un projet";
  ["f-title", "f-cat", "f-link", "f-imgurl", "f-file"].forEach((id) => ($(id).value = ""));
  $("newPreview").innerHTML = "";
  $("curImage").hidden = true;
  $("resetEditor").hidden = true;
  $("saveProject").textContent = "Enregistrer";
  renderList();
}

async function saveProject() {
  if (!isConfigured) { toast("Firebase non configuré."); return; }
  const title = $("f-title").value.trim();
  const category = $("f-cat").value.trim();
  const link = $("f-link").value.trim();
  const imgUrl = $("f-imgurl").value.trim();
  const newImage = pendingImage || imgUrl || "";
  const existingImage = editingId && items.find((i) => i.id === editingId)?.image;

  if (!title && !newImage && !link && !existingImage) {
    toast("Ajoute au moins un titre, une image ou un lien.");
    return;
  }

  const btn = $("saveProject");
  btn.disabled = true;
  try {
    if (editingId) {
      const patch = { title, category };
      patch.link = link || null;            // null = supprime le champ
      if (newImage) patch.image = newImage; // sinon on garde l'image existante
      await update(ref(db, "portfolio/" + editingId), patch);
      toast("Projet modifié ✦");
    } else {
      const order = items.length ? Math.max(...items.map((i) => i.order || 0)) + 1 : 0;
      const data = { title, category, order, createdAt: Date.now() };
      if (newImage) data.image = newImage;
      if (link) data.link = link;
      await push(ref(db, "portfolio"), data);
      toast("Projet ajouté ✦");
    }
    resetEditor();
  } catch (e) {
    console.error("Enregistrement échoué :", e);
    toast("Échec : " + (e && e.message ? e.message : "écriture refusée"));
  } finally {
    btn.disabled = false;
  }
}

async function delProject(id) {
  if (!confirm("Supprimer définitivement ce projet ?")) return;
  await remove(ref(db, "portfolio/" + id));
  if (editingId === id) resetEditor();
  toast("Projet supprimé");
}

async function moveProject(id, dir) {
  const idx = items.findIndex((i) => i.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= items.length) return;
  const a = items[idx], b = items[swap];
  await update(ref(db, "portfolio"), {
    [`${a.id}/order`]: b.order ?? swap,
    [`${b.id}/order`]: a.order ?? idx,
  });
}

// ====================================================================
//  Boutons « enregistrer » des textes + champ image
// ====================================================================
function wire() {
  $("saveHero").addEventListener("click", async () => {
    if (!isConfigured) { toast("Firebase non configuré."); return; }
    await update(ref(db, "content/hero"), { tagline: $("c-tagline").value.trim() });
    toast("Accueil enregistré ✦");
  });
  $("saveAbout").addEventListener("click", async () => {
    if (!isConfigured) { toast("Firebase non configuré."); return; }
    const skills = $("c-skills").value.split(",").map((s) => s.trim()).filter(Boolean);
    await set(ref(db, "content/about"), { text: $("c-about").value, skills });
    toast("À propos enregistré ✦");
  });
  $("saveContact").addEventListener("click", async () => {
    if (!isConfigured) { toast("Firebase non configuré."); return; }
    await set(ref(db, "content/contact"), {
      email: $("c-email").value.trim(),
      instagram: $("c-insta").value.trim(),
      vinted: $("c-vinted").value.trim(),
    });
    toast("Contact enregistré ✦");
  });

  $("saveProject").addEventListener("click", saveProject);
  $("resetEditor").addEventListener("click", resetEditor);

  $("f-file").addEventListener("change", async () => {
    const f = $("f-file").files[0];
    const prev = $("newPreview");
    if (!f) { pendingImage = null; prev.innerHTML = ""; return; }
    prev.textContent = "Compression…";
    try {
      pendingImage = await fileToDataURL(f);
      prev.innerHTML = `<img src="${pendingImage}" alt="" /><span>${kb(pendingImage)} Ko</span>`;
    } catch (e) { prev.textContent = "Image illisible."; pendingImage = null; }
  });
}

// ====================================================================
//  Données en direct (seulement si configuré)
// ====================================================================
if (isConfigured) {
  onValue(ref(db, "content"), (snap) => {
    const v = snap.val() || {};
    content = {
      hero: { ...DEFAULTS.hero, ...(v.hero || {}) },
      about: { ...DEFAULTS.about, ...(v.about || {}) },
      contact: { ...DEFAULTS.contact, ...(v.contact || {}) },
    };
  });
  onValue(ref(db, "portfolio"), (snap) => {
    const arr = [];
    snap.forEach((c) => arr.push({ id: c.key, ...c.val() }));
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    items = arr;
    renderList();
    refreshCatList();
  });
}

// Branche les boutons de l'interface (sans dépendre de Firebase)
wire();
