// ====================================================================
//  firebase.js — initialisation unique, partagée par app.js et admin-page.js
// ====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=70";

export let db = null;
try {
  db = getDatabase(initializeApp(firebaseConfig));
} catch (err) {
  console.error("Firebase non initialisé :", err);
}

export const isConfigured =
  !!db && !firebaseConfig.databaseURL.includes("VOTRE_PROJET");
