// ====================================================================
//  guard.js — dissuasion côté visiteur (clic droit, copie d'images)
//  ⚠️ Purement cosmétique : n'empêche PAS de modifier la base de données.
//     Sert surtout à décourager le téléchargement facile des images.
// ====================================================================

// Clic droit désactivé (sauf dans les champs de saisie, par confort)
document.addEventListener("contextmenu", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  e.preventDefault();
});

// Empêche de glisser/déposer une image pour la récupérer
document.addEventListener("dragstart", (e) => {
  if (e.target && e.target.tagName === "IMG") e.preventDefault();
});

// Petit clin d'œil pour les curieux qui ouvrent la console
console.log(
  "%c✦ arome",
  "color:#d8d2c6;font-family:Georgia,serif;font-size:22px;letter-spacing:2px;"
);
console.log(
  "%cEspace privé — merci de ne pas réutiliser les images sans autorisation.",
  "color:#9a9a9a;font-size:12px;"
);
