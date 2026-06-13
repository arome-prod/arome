// ====================================================================
//  admin-page.js — page d'administration (admin.html)
//  Modèle ALBUMS : catégorie → album → photos.
//  Crée des albums, gère leurs photos visuellement (ajout multiple,
//  couverture, réorganisation), édite les textes du site.
//  ⚠️ Mot de passe côté navigateur : pas une vraie sécurité (voir README).
// ====================================================================

import {
  ref, onValue, set, update, push, remove, get,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { db, isConfigured } from "./firebase.js?v=104";
import { ADMIN_PASSWORD, DEFAULTS, IMAGE_MAX_DIM, IMAGE_QUALITY } from "./config.js?v=104";

console.log("admin-page chargé · Firebase configuré :", isConfigured);

const $ = (id) => document.getElementById(id);
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

if ($("gateHint")) {
  $("gateHint").textContent = isConfigured
    ? "Accès réservé."
    : "⚠️ Firebase non configuré (vérifie js/firebase-config.js).";
}

let content = JSON.parse(JSON.stringify(DEFAULTS));
let albums = [];
let videos = [];
let insp = [];
let inspCover = "";
let writings = [];
let editingWr = null;
let tl = [];
let editingTl = null;
let managingId = null;
let mgrPhotos = [];          // photos de l'album en cours de gestion (depuis albumPhotos/<id>)
let mgrUnsub = null;
const migrating = new Set();  // évite les migrations en double
const refreshingCov = new Set();
const COVER_VER = 3;          // version des couvertures (incrémenter = régénération auto)

// Génère une couverture allégée mais nette (assez grande pour les écrans Retina).
function makeThumb(dataURL, max = 1000, q = 0.86) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      const s = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", q));
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}

// Recalcule coverThumb + count d'un album à partir de ses photos (albumPhotos/<id>).
async function refreshAlbumCover(id) {
  let ph = [];
  try {
    const snap = await get(ref(db, "albumPhotos/" + id));
    snap.forEach((c) => { ph.push({ id: c.key, ...c.val() }); });
  } catch (e) { console.error(e); }
  ph.sort((x, y) => (x.order || 0) - (y.order || 0));
  const a = albumById(id) || {};
  let cov = ph.find((p) => p.id === a.coverId) || ph[0] || null;
  // Couverture en pleine qualité : on stocke directement l'image complète
  // (pas de mini-vignette compressée) pour une netteté maximale dans la grille.
  let thumb = null;
  if (cov) {
    thumb = cov.youtube
      ? `https://img.youtube.com/vi/${cov.youtube}/hqdefault.jpg`
      : (cov.src || null);
  }
  await update(ref(db, "albums/" + id), { coverThumb: thumb || null, count: ph.length, cv: COVER_VER });
}

// Régénère les couvertures des albums qui ne sont pas à la dernière version (une seule fois).
function maybeRefreshCovers(list) {
  list.forEach((a) => {
    if (a.photos) return;                 // pas encore migré → la migration s'en charge
    if (a.cv === COVER_VER) return;       // déjà à jour
    if (refreshingCov.has(a.id)) return;
    refreshingCov.add(a.id);
    refreshAlbumCover(a.id).finally(() => refreshingCov.delete(a.id));
  });
}

// Migre un album de l'ancien format (photos inline) vers albumPhotos/<id>.
async function migrateAlbum(a) {
  if (!a || !a.photos || migrating.has(a.id)) return;
  migrating.add(a.id);
  try {
    const updates = {};
    Object.entries(a.photos).forEach(([pid, p]) => { updates[pid] = p; });
    await update(ref(db, "albumPhotos/" + a.id), updates);
    await update(ref(db, "albums/" + a.id), { migrated: true });
    await refreshAlbumCover(a.id);
    await remove(ref(db, "albums/" + a.id + "/photos"));  // libère le poids dans albums
  } catch (e) {
    console.error("Migration échouée :", e);
  } finally {
    migrating.delete(a.id);
  }
}
function maybeMigrate(list) {
  list.forEach((a) => { if (a.photos) migrateAlbum(a); });
}

// Nettoie le HTML de l'éditeur : on ne garde que gras / italique / souligné + paragraphes.
const RICH_OK = { B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u", P: "p", BR: "br", DIV: "p" };
function sanitizeRich(html) {
  let doc;
  try { doc = new DOMParser().parseFromString(String(html || ""), "text/html"); }
  catch (e) { return ""; }
  const walk = (node) => {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += esc(n.nodeValue);
      else if (n.nodeType === 1) {
        const tag = RICH_OK[n.tagName];
        if (tag === "br") out += "<br>";
        else if (tag) out += `<${tag}>${walk(n)}</${tag}>`;
        else out += walk(n);
      }
    });
    return out;
  };
  return walk(doc.body).trim();
}

const INSP_LABEL = {
  music: "Musique", video: "Vidéo", film: "Film",
  serie: "Série", livre: "Livre", autre: "Autre",
};

// ====================================================================
//  Connexion
// ====================================================================
function unlock() {
  $("gate").hidden = true;
  $("app").hidden = false;
  try { fillContentForms(); } catch (e) { console.error(e); }
  if (!isConfigured) toast("⚠️ Firebase non configuré : l'enregistrement ne marchera pas.");
}
const gateForm = $("gateForm");
if (gateForm) {
  gateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (($("gatePass").value || "").trim() === ADMIN_PASSWORD) { $("gateErr").textContent = ""; unlock(); }
    else $("gateErr").textContent = "Mot de passe incorrect.";
  });
}
if ($("logout")) $("logout").addEventListener("click", () => { location.href = "index.html"; });

// ====================================================================
//  Helpers
// ====================================================================
function toast(msg) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.add("is-on");
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
        width = Math.round(width * scale); height = Math.round(height * scale);
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

function photosOf(a) {
  if (!a || !a.photos) return [];
  return Object.entries(a.photos)
    .map(([id, p]) => ({ id, ...p }))
    .sort((x, y) => (x.order || 0) - (y.order || 0));
}
function mediaThumb(m) {
  if (!m) return "";
  return m.youtube ? `https://img.youtube.com/vi/${m.youtube}/hqdefault.jpg` : (m.src || "");
}
function coverSrc(a) {
  if (a.coverThumb) return a.coverThumb;
  const ph = photosOf(a);
  if (a.coverId) { const c = ph.find((p) => p.id === a.coverId); if (c) return mediaThumb(c); }
  return ph.length ? mediaThumb(ph[0]) : (a.cover || "");
}
const albumById = (id) => albums.find((a) => a.id === id);

// Extrait l'identifiant d'une vidéo YouTube depuis un lien (plusieurs formats)
function youtubeId(url) {
  const s = String(url || "").trim();
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return "";
}
// Tente de récupérer le titre via l'oEmbed YouTube (sans clé API ; best effort)
async function fetchYoutubeTitle(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!r.ok) return "";
    const data = await r.json();
    return data.title || "";
  } catch (e) { return ""; }
}

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
//  Catégories (datalist)
// ====================================================================
function refreshCatList() {
  const dl = $("catlist"); if (!dl) return;
  const cats = [...new Set(albums.map((a) => (a.category || "").trim()).filter(Boolean))];
  dl.innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join("");
}

// ====================================================================
//  Liste des albums
// ====================================================================
function renderAdminAlbums() {
  const box = $("adminAlbums"); if (!box) return;
  $("albumCount").textContent = albums.length;
  if (!albums.length) { box.innerHTML = '<p class="adm-empty">Aucun album. Crée le premier ci-dessus.</p>'; return; }

  box.innerHTML = albums.map((a, i) => {
    const cover = coverSrc(a);
    const n = a.count ?? photosOf(a).length;
    const thumb = cover
      ? `<img class="adm-arow__img" src="${esc(cover)}" alt="" />`
      : `<span class="adm-arow__img adm-arow__img--empty">○</span>`;
    return `<div class="adm-arow">
        ${thumb}
        <div class="adm-arow__body">
          <span class="adm-arow__title">${esc(a.title || "(sans titre)")}</span>
          <span class="adm-arow__meta">${esc(a.category || "—")} · ${n} photo${n > 1 ? "s" : ""}</span>
        </div>
        <div class="adm-arow__actions">
          <button data-aact="manage" data-id="${a.id}" class="btn btn--sm">Gérer</button>
          <button data-aact="up" data-id="${a.id}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
          <button data-aact="down" data-id="${a.id}" ${i === albums.length - 1 ? "disabled" : ""} aria-label="Descendre">↓</button>
          <button data-aact="del" data-id="${a.id}" class="adm-danger" aria-label="Supprimer">Suppr.</button>
        </div>
      </div>`;
  }).join("");

  box.querySelectorAll("[data-aact]").forEach((b) => {
    const id = b.dataset.id, act = b.dataset.aact;
    b.addEventListener("click", () => {
      if (act === "manage") openManager(id);
      else if (act === "del") delAlbum(id);
      else if (act === "up") moveAlbum(id, -1);
      else if (act === "down") moveAlbum(id, 1);
    });
  });
}

async function createAlbum() {
  if (!isConfigured) { toast("Firebase non configuré."); return; }
  const title = $("na-title").value.trim();
  const category = $("na-cat").value.trim();
  const description = $("na-desc").value.trim();
  if (!title) { toast("Donne un titre à l'album."); return; }
  const order = albums.length ? Math.max(...albums.map((a) => a.order || 0)) + 1 : 0;
  const btn = $("createAlbum");
  btn.disabled = true;
  try {
    await push(ref(db, "albums"), { title, category, description, order, createdAt: Date.now() });
    $("na-title").value = ""; $("na-cat").value = ""; $("na-desc").value = "";
    toast("Album créé ✦ — clique « Gérer » pour y ajouter des photos.");
  } catch (e) {
    console.error(e);
    toast("Échec : " + (e.message || "écriture refusée"));
  } finally {
    btn.disabled = false;
  }
}

async function delAlbum(id) {
  const a = albumById(id);
  if (!confirm(`Supprimer l'album « ${a ? a.title : ""} » et ses photos ?`)) return;
  await remove(ref(db, "albums/" + id));
  await remove(ref(db, "albumPhotos/" + id));   // supprime aussi les photos séparées
  if (managingId === id) closeManager();
  toast("Album supprimé");
}

async function moveAlbum(id, dir) {
  const idx = albums.findIndex((a) => a.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= albums.length) return;
  const a = albums[idx], b = albums[swap];
  await update(ref(db, "albums"), {
    [`${a.id}/order`]: b.order ?? swap,
    [`${b.id}/order`]: a.order ?? idx,
  });
}

// ====================================================================
//  Gestionnaire d'un album
// ====================================================================
async function openManager(id) {
  managingId = id;
  const a = albumById(id) || {};
  $("albumsSection").hidden = true;
  $("albumManager").hidden = false;
  $("mgrTitle").textContent = a.title || "Album";
  $("m-title").value = a.title || "";
  $("m-cat").value = a.category || "";
  $("m-desc").value = a.description || "";
  $("m-link").value = a.link || "";
  mgrPhotos = [];
  renderManagerPhotos();
  window.scrollTo(0, 0);

  // Sécurité : migre tout de suite si cet album est encore en ancien format
  if (a.photos) await migrateAlbum(a);

  // Abonnement en direct aux photos de CET album (séparées des albums)
  if (mgrUnsub) mgrUnsub();
  mgrUnsub = onValue(ref(db, "albumPhotos/" + id), (snap) => {
    if (managingId !== id) return;
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((x, y) => (x.order || 0) - (y.order || 0));
    mgrPhotos = arr;
    renderManagerPhotos();
  });
}
function closeManager() {
  if (mgrUnsub) { mgrUnsub(); mgrUnsub = null; }
  managingId = null;
  mgrPhotos = [];
  $("albumManager").hidden = true;
  $("albumsSection").hidden = false;
}

async function saveAlbumMeta() {
  if (!managingId) return;
  const patch = {
    title: $("m-title").value.trim(),
    category: $("m-cat").value.trim(),
    description: $("m-desc").value.trim(),
    link: $("m-link").value.trim() || null,
  };
  await update(ref(db, "albums/" + managingId), patch);
  $("mgrTitle").textContent = patch.title || "Album";
  toast("Infos enregistrées ✦");
}

function renderManagerPhotos() {
  const a = albumById(managingId) || {};
  const grid = $("mgrPhotos");
  if (!grid) return;
  const ph = mgrPhotos;
  $("mgrPhotoCount").textContent = ph.length;
  if (!ph.length) { grid.innerHTML = '<p class="adm-empty">Aucun média. Ajoute des photos ou une vidéo ci-dessus.</p>'; return; }

  grid.innerHTML = ph.map((p, i) => {
    const isCover = (a.coverId && a.coverId === p.id) || (!a.coverId && i === 0);
    const thumb = mediaThumb(p);
    const badge = p.youtube ? '<span class="adm-photo__badge adm-photo__badge--vid">▶ vidéo</span>'
      : (isCover ? '<span class="adm-photo__badge">Couverture</span>' : "");
    return `<div class="adm-photo${isCover ? " is-cover" : ""}">
        <img src="${esc(thumb)}" alt="" />
        ${badge}
        <input class="adm-photo__title" data-ptitle="${p.id}" value="${esc(p.title || "")}" placeholder="Titre (optionnel)" maxlength="200" />
        <div class="adm-photo__bar">
          <button data-pact="cover" data-id="${p.id}" title="Définir comme couverture">★</button>
          <button data-pact="up" data-id="${p.id}" ${i === 0 ? "disabled" : ""} title="Avancer">↑</button>
          <button data-pact="down" data-id="${p.id}" ${i === ph.length - 1 ? "disabled" : ""} title="Reculer">↓</button>
          <button data-pact="del" data-id="${p.id}" class="adm-danger" title="Supprimer">✕</button>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll("[data-pact]").forEach((b) => {
    const pid = b.dataset.id, act = b.dataset.pact;
    b.addEventListener("click", () => {
      if (act === "cover") setCover(pid);
      else if (act === "del") delPhoto(pid);
      else if (act === "up") movePhoto(pid, -1);
      else if (act === "down") movePhoto(pid, 1);
    });
  });

  // Enregistre le titre d'une photo (à la perte de focus / Entrée)
  grid.querySelectorAll("[data-ptitle]").forEach((inp) => {
    const save = async () => {
      if (!managingId) return;
      try {
        await update(ref(db, `albumPhotos/${managingId}/${inp.dataset.ptitle}`), { title: inp.value.trim() });
        toast("Titre enregistré ✦");
      } catch (e) { console.error(e); toast("Échec de l'enregistrement du titre."); }
    };
    inp.addEventListener("blur", save);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } });
  });
}

async function addPhotos(files) {
  if (!managingId) return;
  const id = managingId;
  let order = mgrPhotos.length ? Math.max(...mgrPhotos.map((p) => p.order || 0)) + 1 : 0;
  const list = [...files];
  let done = 0;
  $("m-progress").textContent = `Traitement de ${list.length} photo(s)…`;
  for (const f of list) {
    try {
      const src = await fileToDataURL(f);
      await push(ref(db, `albumPhotos/${id}`), { src, order: order++, createdAt: Date.now() });
      done++;
      $("m-progress").textContent = `${done}/${list.length} ajoutée(s)…`;
    } catch (e) {
      console.error("Photo ignorée :", e);
      toast("Une image n'a pas pu être ajoutée.");
    }
  }
  $("m-files").value = "";
  $("m-progress").textContent = "";
  await refreshAlbumCover(id);
  toast(`${done} photo(s) ajoutée(s) ✦`);
}

async function setCover(pid) {
  if (!managingId) return;
  await update(ref(db, "albums/" + managingId), { coverId: pid });
  await refreshAlbumCover(managingId);
  toast("Couverture définie ✦");
}
async function delPhoto(pid) {
  if (!managingId) return;
  if (!confirm("Supprimer cette photo ?")) return;
  await remove(ref(db, `albumPhotos/${managingId}/${pid}`));
  await refreshAlbumCover(managingId);
}
async function movePhoto(pid, dir) {
  const ph = mgrPhotos;
  const idx = ph.findIndex((p) => p.id === pid);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= ph.length) return;
  const x = ph[idx], y = ph[swap];
  await update(ref(db, `albumPhotos/${managingId}`), {
    [`${x.id}/order`]: y.order ?? swap,
    [`${y.id}/order`]: x.order ?? idx,
  });
  await refreshAlbumCover(managingId);   // si la 1re photo change, la couverture suit
}

// ====================================================================
//  Branchements UI
// ====================================================================
function wire() {
  $("saveHero").addEventListener("click", async () => {
    if (!isConfigured) return toast("Firebase non configuré.");
    await update(ref(db, "content/hero"), { tagline: $("c-tagline").value.trim() });
    toast("Accueil enregistré ✦");
  });
  $("saveAbout").addEventListener("click", async () => {
    if (!isConfigured) return toast("Firebase non configuré.");
    const skills = $("c-skills").value.split(",").map((s) => s.trim()).filter(Boolean);
    await set(ref(db, "content/about"), { text: $("c-about").value, skills });
    toast("À propos enregistré ✦");
  });
  $("saveContact").addEventListener("click", async () => {
    if (!isConfigured) return toast("Firebase non configuré.");
    await set(ref(db, "content/contact"), {
      email: $("c-email").value.trim(),
      instagram: $("c-insta").value.trim(),
      vinted: $("c-vinted").value.trim(),
    });
    toast("Contact enregistré ✦");
  });

  $("createAlbum").addEventListener("click", createAlbum);
  $("mgrBack").addEventListener("click", closeManager);
  $("saveAlbumMeta").addEventListener("click", saveAlbumMeta);
  $("m-files").addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length) addPhotos(e.target.files);
  });

  // Contenu YouTube (indépendant)
  $("ytAdd").addEventListener("click", addYoutube);
  $("yt-url").addEventListener("blur", async () => {
    const id = youtubeId($("yt-url").value);
    if (id && !$("yt-title").value.trim()) {
      const t = await fetchYoutubeTitle(id);
      if (t) $("yt-title").value = t;
    }
  });

  // Écrits (textes) — barre de mise en forme + enregistrement
  document.querySelectorAll(".adm-rich-tools [data-cmd]").forEach((b) => {
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();                       // garde le focus/la sélection dans l'éditeur
      document.execCommand(b.dataset.cmd, false, null);
    });
  });
  $("wrSave").addEventListener("click", saveWriting);
  $("wrCancel").addEventListener("click", resetWritingForm);

  // Mon parcours
  $("tlSave").addEventListener("click", saveTl);
  $("tlCancel").addEventListener("click", resetTlForm);

  // Inspirations
  $("inspAdd").addEventListener("click", addInspiration);
  $("insp-kind").addEventListener("change", toggleInspCover);
  $("insp-cover").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      inspCover = await fileToDataURL(f);
      $("insp-coverPrev").innerHTML = `<img src="${inspCover}" alt="" /><span>Couverture prête ✦</span>`;
    } catch (err) { console.error(err); toast("Image non valide."); }
  });
  toggleInspCover();
}

// ====================================================================
//  Contenu YouTube
// ====================================================================
function renderVideos() {
  const box = $("ytList"); if (!box) return;
  $("ytCount").textContent = videos.length;
  if (!videos.length) { box.innerHTML = '<p class="adm-empty">Aucune vidéo. Ajoute-en ci-dessus.</p>'; return; }
  box.innerHTML = videos.map((v, i) => `
    <div class="adm-arow">
      <img class="adm-arow__img" src="https://img.youtube.com/vi/${esc(v.vid)}/default.jpg" alt="" />
      <div class="adm-arow__body">
        <span class="adm-arow__title">${esc(v.title || "(sans titre)")}</span>
        <span class="adm-arow__meta">YouTube · ${esc(v.vid)}</span>
      </div>
      <div class="adm-arow__actions">
        <button data-vact="up" data-id="${v.id}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
        <button data-vact="down" data-id="${v.id}" ${i === videos.length - 1 ? "disabled" : ""} aria-label="Descendre">↓</button>
        <button data-vact="del" data-id="${v.id}" class="adm-danger" aria-label="Supprimer">Suppr.</button>
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-vact]").forEach((b) => {
    const id = b.dataset.id, act = b.dataset.vact;
    b.addEventListener("click", () => {
      if (act === "del") delVideo(id);
      else if (act === "up") moveVideo(id, -1);
      else if (act === "down") moveVideo(id, 1);
    });
  });
}

async function addYoutube() {
  if (!isConfigured) { toast("Firebase non configuré."); return; }
  const id = youtubeId($("yt-url").value);
  if (!id) { toast("Lien YouTube non reconnu."); return; }
  let title = $("yt-title").value.trim();
  if (!title) title = await fetchYoutubeTitle(id);
  const order = videos.length ? Math.max(...videos.map((v) => v.order || 0)) + 1 : 0;
  const btn = $("ytAdd"); btn.disabled = true;
  try {
    await push(ref(db, "youtube"), { vid: id, title: title || "", order, createdAt: Date.now() });
    $("yt-url").value = ""; $("yt-title").value = "";
    toast("Vidéo ajoutée ✦");
  } catch (e) {
    console.error(e);
    toast("Échec : " + (e.message || "écriture refusée"));
  } finally { btn.disabled = false; }
}
async function delVideo(id) {
  if (!confirm("Supprimer cette vidéo ?")) return;
  await remove(ref(db, "youtube/" + id));
  toast("Vidéo supprimée");
}
async function moveVideo(id, dir) {
  const idx = videos.findIndex((v) => v.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= videos.length) return;
  const a = videos[idx], b = videos[swap];
  await update(ref(db, "youtube"), {
    [`${a.id}/order`]: b.order ?? swap,
    [`${b.id}/order`]: a.order ?? idx,
  });
}

// ====================================================================
//  Inspirations
// ====================================================================
// Construit l'URL d'intégration d'un lien Spotify / Apple Music.
function musicEmbed(url) {
  const s = String(url || "").trim();
  let m = s.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
  if (m) {
    const type = m[1], id = m[2];
    const compact = (type === "track" || type === "episode");
    return { source: "spotify", embed: `https://open.spotify.com/embed/${type}/${id}`, h: compact ? 152 : 352 };
  }
  if (/music\.apple\.com\//.test(s)) {
    let embed = s.replace("music.apple.com", "embed.music.apple.com");
    embed += (embed.includes("?") ? "&" : "?") + "theme=dark";
    return { source: "apple", embed, h: 450 };
  }
  return null;
}
function ytIdFromEmbed(e) {
  const m = String(e || "").match(/embed\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

function toggleInspCover() {
  const kind = $("insp-kind").value;
  const poster = !(kind === "music" || kind === "video");
  $("insp-coverLabel").style.display = poster ? "" : "none";
  $("insp-url").placeholder = kind === "music"
    ? "Lien Spotify ou Apple Music"
    : kind === "video" ? "Lien YouTube (youtu.be/… ou watch?v=…)"
      : "Lien externe (optionnel — Letterboxd, Babelio, IMDb…)";
}

function renderInspAdmin() {
  const box = $("inspList"); if (!box) return;
  $("inspCount").textContent = insp.length;
  if (!insp.length) { box.innerHTML = '<p class="adm-empty">Aucune inspiration. Ajoute-en ci-dessus.</p>'; return; }
  box.innerHTML = insp.map((it, i) => {
    const label = INSP_LABEL[it.kind] || "Autre";
    const ytId = it.source === "youtube" ? ytIdFromEmbed(it.embed) : "";
    const thumb = it.cover
      ? `<img class="adm-arow__img" src="${esc(it.cover)}" alt="" />`
      : (ytId
          ? `<img class="adm-arow__img" src="https://img.youtube.com/vi/${esc(ytId)}/default.jpg" alt="" />`
          : `<span class="adm-arow__img adm-arow__img--empty">${esc(label.slice(0, 1))}</span>`);
    return `<div class="adm-arow">
        ${thumb}
        <div class="adm-arow__body">
          <span class="adm-arow__title">${esc(it.title || "(sans titre)")}</span>
          <span class="adm-arow__meta">${esc(label)}${it.subtitle ? " · " + esc(it.subtitle) : ""}</span>
        </div>
        <div class="adm-arow__actions">
          <button data-iact="up" data-id="${it.id}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
          <button data-iact="down" data-id="${it.id}" ${i === insp.length - 1 ? "disabled" : ""} aria-label="Descendre">↓</button>
          <button data-iact="del" data-id="${it.id}" class="adm-danger" aria-label="Supprimer">Suppr.</button>
        </div>
      </div>`;
  }).join("");
  box.querySelectorAll("[data-iact]").forEach((b) => {
    const id = b.dataset.id, act = b.dataset.iact;
    b.addEventListener("click", () => {
      if (act === "del") delInsp(id);
      else if (act === "up") moveInsp(id, -1);
      else if (act === "down") moveInsp(id, 1);
    });
  });
}

async function addInspiration() {
  if (!isConfigured) { toast("Firebase non configuré."); return; }
  const kind = $("insp-kind").value;
  const url = $("insp-url").value.trim();
  const title = $("insp-title").value.trim();
  const subtitle = $("insp-sub").value.trim();
  let source = "", embed = "", h = 0;

  if (kind === "music") {
    const e = musicEmbed(url);
    if (!e) { toast("Lien Spotify ou Apple Music non reconnu."); return; }
    source = e.source; embed = e.embed; h = e.h;
  } else if (kind === "video") {
    const vid = youtubeId(url);
    if (!vid) { toast("Lien YouTube non reconnu."); return; }
    source = "youtube"; embed = `https://www.youtube.com/embed/${vid}?rel=0`;
  } else if (!title) {
    toast("Donne un titre."); return;
  }

  const order = insp.length ? Math.max(...insp.map((x) => x.order || 0)) + 1 : 0;
  const btn = $("inspAdd"); btn.disabled = true;
  try {
    await push(ref(db, "inspirations"), {
      kind, source, embed, h,
      url: url || "", title: title || "", subtitle: subtitle || "",
      cover: inspCover || "", order, createdAt: Date.now(),
    });
    $("insp-url").value = ""; $("insp-title").value = ""; $("insp-sub").value = "";
    $("insp-cover").value = ""; inspCover = ""; $("insp-coverPrev").innerHTML = "";
    toast("Inspiration ajoutée ✦");
  } catch (e) {
    console.error(e);
    toast("Échec : " + (e.message || "écriture refusée"));
  } finally { btn.disabled = false; }
}

async function delInsp(id) {
  if (!confirm("Supprimer cette inspiration ?")) return;
  await remove(ref(db, "inspirations/" + id));
  toast("Inspiration supprimée");
}
async function moveInsp(id, dir) {
  const idx = insp.findIndex((x) => x.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= insp.length) return;
  const a = insp[idx], b = insp[swap];
  await update(ref(db, "inspirations"), {
    [`${a.id}/order`]: b.order ?? swap,
    [`${b.id}/order`]: a.order ?? idx,
  });
}

// ====================================================================
//  Écrits (projets « Textes »)
// ====================================================================
function resetWritingForm() {
  editingWr = null;
  $("wr-title").value = ""; $("wr-type").value = ""; $("wr-body").innerHTML = "";
  $("wrSave").textContent = "+ Ajouter le texte";
  $("wrCancel").style.display = "none";
}

function renderWritings() {
  const box = $("wrList"); if (!box) return;
  $("wrCount").textContent = writings.length;
  if (!writings.length) { box.innerHTML = '<p class="adm-empty">Aucun texte. Ajoute-en ci-dessus.</p>'; return; }
  box.innerHTML = writings.map((w, i) => `
    <div class="adm-arow">
      <span class="adm-arow__img adm-arow__img--empty">¶</span>
      <div class="adm-arow__body">
        <span class="adm-arow__title">${esc(w.title || "(sans titre)")}</span>
        <span class="adm-arow__meta">${esc(w.type || "Texte")}</span>
      </div>
      <div class="adm-arow__actions">
        <button data-wact="edit" data-id="${w.id}" class="btn btn--sm">Modifier</button>
        <button data-wact="up" data-id="${w.id}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
        <button data-wact="down" data-id="${w.id}" ${i === writings.length - 1 ? "disabled" : ""} aria-label="Descendre">↓</button>
        <button data-wact="del" data-id="${w.id}" class="adm-danger" aria-label="Supprimer">Suppr.</button>
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-wact]").forEach((b) => {
    const id = b.dataset.id, act = b.dataset.wact;
    b.addEventListener("click", () => {
      if (act === "edit") editWriting(id);
      else if (act === "del") delWriting(id);
      else if (act === "up") moveWriting(id, -1);
      else if (act === "down") moveWriting(id, 1);
    });
  });
}

function editWriting(id) {
  const w = writings.find((x) => x.id === id);
  if (!w) return;
  editingWr = id;
  $("wr-title").value = w.title || "";
  $("wr-type").value = w.type || "";
  $("wr-body").innerHTML = sanitizeRich(w.body || "");
  $("wrSave").textContent = "Enregistrer les modifications";
  $("wrCancel").style.display = "";
  $("writingsSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveWriting() {
  if (!isConfigured) { toast("Firebase non configuré."); return; }
  const title = $("wr-title").value.trim();
  const type = $("wr-type").value.trim();
  const body = sanitizeRich($("wr-body").innerHTML);
  if (!title) { toast("Donne un titre."); return; }
  if (!body) { toast("Le texte est vide."); return; }
  const btn = $("wrSave"); btn.disabled = true;
  try {
    if (editingWr) {
      await update(ref(db, "textes/" + editingWr), { title, type, body });
      toast("Texte mis à jour ✦");
    } else {
      const order = writings.length ? Math.max(...writings.map((w) => w.order || 0)) + 1 : 0;
      await push(ref(db, "textes"), { title, type, body, order, createdAt: Date.now() });
      toast("Texte ajouté ✦");
    }
    resetWritingForm();
  } catch (e) {
    console.error(e);
    toast("Échec : " + (e.message || "écriture refusée"));
  } finally { btn.disabled = false; }
}

async function delWriting(id) {
  if (!confirm("Supprimer ce texte ?")) return;
  await remove(ref(db, "textes/" + id));
  if (editingWr === id) resetWritingForm();
  toast("Texte supprimé");
}
async function moveWriting(id, dir) {
  const idx = writings.findIndex((w) => w.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= writings.length) return;
  const a = writings[idx], b = writings[swap];
  await update(ref(db, "textes"), {
    [`${a.id}/order`]: b.order ?? swap,
    [`${b.id}/order`]: a.order ?? idx,
  });
}

// ====================================================================
//  Mon parcours (frise À propos)
// ====================================================================
function resetTlForm() {
  editingTl = null;
  $("tl-year").value = ""; $("tl-title").value = ""; $("tl-text").value = "";
  $("tlSave").textContent = "+ Ajouter l'étape";
  $("tlCancel").style.display = "none";
}
function renderTl() {
  const box = $("tlList"); if (!box) return;
  $("tlCount").textContent = tl.length;
  if (!tl.length) { box.innerHTML = '<p class="adm-empty">Aucune étape. Ajoute-en ci-dessus.</p>'; return; }
  box.innerHTML = tl.map((e, i) => `
    <div class="adm-arow">
      <span class="adm-arow__img adm-arow__img--empty">${esc((e.year || "•").slice(0, 4))}</span>
      <div class="adm-arow__body">
        <span class="adm-arow__title">${esc(e.title || "(sans titre)")}</span>
        <span class="adm-arow__meta">${esc(e.year || "")}</span>
      </div>
      <div class="adm-arow__actions">
        <button data-tact="edit" data-id="${e.id}" class="btn btn--sm">Modifier</button>
        <button data-tact="up" data-id="${e.id}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
        <button data-tact="down" data-id="${e.id}" ${i === tl.length - 1 ? "disabled" : ""} aria-label="Descendre">↓</button>
        <button data-tact="del" data-id="${e.id}" class="adm-danger" aria-label="Supprimer">Suppr.</button>
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-tact]").forEach((b) => {
    const id = b.dataset.id, act = b.dataset.tact;
    b.addEventListener("click", () => {
      if (act === "edit") editTl(id);
      else if (act === "del") delTl(id);
      else if (act === "up") moveTl(id, -1);
      else if (act === "down") moveTl(id, 1);
    });
  });
}
function editTl(id) {
  const e = tl.find((x) => x.id === id);
  if (!e) return;
  editingTl = id;
  $("tl-year").value = e.year || "";
  $("tl-title").value = e.title || "";
  $("tl-text").value = e.text || "";
  $("tlSave").textContent = "Enregistrer les modifications";
  $("tlCancel").style.display = "";
  $("timelineSection").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function saveTl() {
  if (!isConfigured) { toast("Firebase non configuré."); return; }
  const year = $("tl-year").value.trim();
  const title = $("tl-title").value.trim();
  const text = $("tl-text").value.trim();
  if (!title) { toast("Donne un titre à l'étape."); return; }
  const btn = $("tlSave"); btn.disabled = true;
  try {
    if (editingTl) {
      await update(ref(db, "timeline/" + editingTl), { year, title, text });
      toast("Étape mise à jour ✦");
    } else {
      const order = tl.length ? Math.max(...tl.map((e) => e.order || 0)) + 1 : 0;
      await push(ref(db, "timeline"), { year, title, text, order, createdAt: Date.now() });
      toast("Étape ajoutée ✦");
    }
    resetTlForm();
  } catch (e) {
    console.error(e);
    toast("Échec : " + (e.message || "écriture refusée"));
  } finally { btn.disabled = false; }
}
async function delTl(id) {
  if (!confirm("Supprimer cette étape ?")) return;
  await remove(ref(db, "timeline/" + id));
  if (editingTl === id) resetTlForm();
  toast("Étape supprimée");
}
async function moveTl(id, dir) {
  const idx = tl.findIndex((e) => e.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= tl.length) return;
  const a = tl[idx], b = tl[swap];
  await update(ref(db, "timeline"), {
    [`${a.id}/order`]: b.order ?? swap,
    [`${b.id}/order`]: a.order ?? idx,
  });
}

// ====================================================================
//  Données en direct
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
  onValue(ref(db, "albums"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    albums = arr;
    renderAdminAlbums();
    refreshCatList();
    maybeMigrate(arr);        // bascule les albums encore en ancien format
    maybeRefreshCovers(arr);  // régénère les couvertures basse qualité une fois
  });
  onValue(ref(db, "youtube"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    videos = arr;
    renderVideos();
  });
  onValue(ref(db, "inspirations"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    insp = arr;
    renderInspAdmin();
  });
  onValue(ref(db, "textes"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    writings = arr;
    renderWritings();
  });
  onValue(ref(db, "timeline"), (snap) => {
    const arr = [];
    snap.forEach((c) => { arr.push({ id: c.key, ...c.val() }); });
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    tl = arr;
    renderTl();
  });
}

wire();
