// ====================================================================
//  config.js — réglages de l'admin + contenu par défaut
//  ⚠️ CHANGE ADMIN_PASSWORD. Ce mot de passe est vérifié dans le
//     navigateur : il évite les modifications accidentelles mais
//     n'est PAS une vraie sécurité (le code est public). Voir README.
// ====================================================================

export const ADMIN_PASSWORD = "arome2026";

// Compression des images avant stockage en base64 (dans la base).
export const IMAGE_MAX_DIM = 1400;   // px (plus grand côté)
export const IMAGE_QUALITY = 0.82;   // 0–1 (qualité JPEG)

// Contenu affiché tant que la base est vide.
export const DEFAULTS = {
  hero: {
    tagline: "photographie · vidéo · design",
  },
  about: {
    text:
      "arome est le nom sous lequel je signe mes créations.\n\n" +
      "Deux phrases sur ta démarche et ton regard — là où le numérique " +
      "et l'organique se rencontrent. (À modifier dans l'admin.)",
    skills: ["Photographie", "Vidéo", "Design", "Direction artistique"],
  },
  contact: {
    email: "mathys.lemarie@gmail.com",
    instagram: "",
    vinted: "",
  },
};

// Projets fictifs affichés tant qu'aucun vrai projet n'est dans la base.
// Ils disparaissent dès que tu ajoutes un projet via l'admin.
export const DEMO = [
  { title: "Lumière liquide", category: "Photo", order: 0 },
  { title: "Nocturne", category: "Photo", order: 1 },
  { title: "Échos — clip", category: "Vidéo", link: "#", order: 2 },
  { title: "Affiche festival", category: "Design", order: 3 },
  { title: "Identité — studio K", category: "Design", order: 4 },
  { title: "Brume — EP", category: "Musique", link: "#", order: 5 },
];
