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

// Albums fictifs affichés tant qu'aucun vrai album n'est dans la base.
// Ils disparaissent dès que tu crées un album via l'admin.
// Structure : { id, title, category, description, order, photos:[{id,src}] }
export const DEMO = [
  { id: "demo-aquarium", title: "Aquarium", category: "Photo", order: 0,
    description: "Exemple d'album. Crée le tien via l'admin.", photos: [] },
  { id: "demo-portraits", title: "Portraits", category: "Photo", order: 1, photos: [] },
  { id: "demo-affiches", title: "Affiches", category: "Design", order: 2, photos: [] },
  { id: "demo-echos", title: "Échos — clip", category: "Vidéo", order: 3, link: "#", photos: [] },
];
