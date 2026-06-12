# arome — portfolio créatif

Site **one-page** statique (HTML / CSS / JavaScript, **sans build**) de **arome**, signature créative de Mathys Lemarié — catégories libres (photo, vidéo, design, musique, web, écrits…).

**Direction artistique :** nuit numérique — fond quasi-noir, grain argentique, lueurs néon, trames de points façon braille. Trois accents : violet (`.acc-violet`), cyan (`.acc-cyan`), braise (`.acc-ember`).

**Propulsé par Firebase Realtime Database** (sans authentification) :

- 🖼️ **Portfolio éditable** : projets à catégorie libre, rendus en direct depuis la base
- ✍️ **Admin secret** : ajoute/modifie projets, images et textes sans toucher au code
- 📝 **Livre d'or** en temps réel · 👀 **Compteur de visites**

## Structure

```
.
├── index.html            # Le site (hero, portfolio, à propos, contact)
├── css/style.css         # DA complète + admin (responsive)
├── js/
│   ├── firebase.js       # Initialisation Firebase (partagée)
│   ├── firebase-config.js # ⬅️ Tes clés Firebase
│   ├── config.js         # Mot de passe admin + réglages images + contenu par défaut
│   ├── app.js            # Site public : rendu, filtres, lightbox, livre d'or, compteur
│   └── admin.js          # Admin (édition + upload images base64)
├── database.rules.json   # Règles de sécurité
├── .gitignore
└── README.md
```

## 1. Firebase

1. https://console.firebase.google.com → **Ajouter un projet**.
2. **Realtime Database** (pas Firestore) → **Créer une base de données** → région → **mode verrouillé**.
3. **⚙️ Paramètres du projet** → **Général** → *Vos applications* → **Web `</>`** → enregistre une app.
4. Copie `firebaseConfig` dans **`js/firebase-config.js`** (vérifie `databaseURL`).
5. Console → **Realtime Database** → **Règles** → colle `database.rules.json` → **Publier**.

## 2. L'admin (page dédiée `admin.html`)

- **Ouvrir :** va sur **`admin.html`** (ou `…/index.html#admin`, ou triple-clique sur le mot-marque « arome » — ça redirige vers la page admin).
- **Mot de passe :** dans `js/config.js` (`ADMIN_PASSWORD`, défaut `arome2026`). **Change-le.**
- C'est une vraie page pleine, confortable. Tu peux **ajouter, MODIFIER, réordonner et supprimer** des projets, et éditer les textes (accroche d'accueil, « à propos » + compétences, liens de contact). Chaque projet a une **catégorie libre** que tu tapes (les filtres du site se génèrent à partir des catégories utilisées), une **image**, et un **lien externe** optionnel (si renseigné, cliquer le projet ouvre ce lien ; sinon l'image s'ouvre en grand).
- **Modifier un projet :** clique « Modifier » sur sa carte → ses infos se chargent dans l'éditeur en haut → change ce que tu veux (l'image n'est remplacée que si tu en choisis une nouvelle) → « Enregistrer les modifications ».

### ⚠️ Sécurité de l'admin

Tu as choisi **sans authentification Firebase**. Le mot de passe est donc vérifié **dans le navigateur** : il évite les modifications par hasard, mais **ne protège pas réellement** la base (les règles autorisent l'écriture publique sur `content` et `portfolio`). Pour une vraie protection plus tard : active **Firebase Authentication** et remplace les `".write": true` de `content` et `portfolio` par `".write": "auth != null"`.

## 3. Les images (base64)

Quand tu choisis un fichier dans l'admin, il est **redimensionné et compressé dans le navigateur** (max ~1400 px, qualité ~80 % — réglable dans `js/config.js`), puis converti en **texte base64** et stocké directement dans la base. Pas de service externe, pas de carte bancaire.

À garder en tête :

- Le base64 pèse ~33 % de plus que le fichier. La compression vise ~150–300 Ko/image.
- La base gratuite : 1 Go stocké, 10 Go/mois de téléchargement. Chaque visite recharge les images → bon pour **quelques dizaines** d'images, pas des centaines en pleine résolution.
- Besoin de transparence (PNG) ou d'une très grande image ? Utilise plutôt le champ **« coller une URL »** (héberge l'image ailleurs).
- Le jour où ça devient trop lourd, on bascule vers un hébergeur d'images (ex. Cloudinary) sans tout refaire : seul le mode d'ajout d'image change.

## 4. Tester en local

```bash
python3 -m http.server 5500   # puis http://localhost:5500
# ou : npx serve .
```

Sans config Firebase, le site s'affiche avec le contenu par défaut ; admin, livre d'or et compteur sont désactivés.

## 5. Déployer sur GitHub Pages

```bash
git init && git add . && git commit -m "arome"
git branch -M main
git remote add origin https://github.com/TON_USER/TON_REPO.git
git push -u origin main
```

GitHub → **Settings → Pages → Deploy from a branch → `main` / `root`**.

## Modèle de données

```
stats/visits: 128
content/
  hero/ { tagline }
  about/ { text, skills: [..] }
  contact/ { email, instagram, vinted }
portfolio/
  <id>/ { title, category, image (base64 ou URL), link?, order, createdAt }
guestbook/
  <id>/ { name, message, createdAt }
```
