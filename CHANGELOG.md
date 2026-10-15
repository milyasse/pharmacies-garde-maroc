# Historique des versions

## 1.5.2 — 15/10/2026
- Écran de lancement **plein écran** sur téléphone (le visuel remplit tout l'écran ; centré sur fond flou sur ordinateur et tablette).
- Visuel en **haute résolution** : agrandi ×2 par IA (Real-ESRGAN, 1882 × 3344) pour rester net sur les écrans haute densité ; la version standard est servie aux petits écrans.

## 1.5.1 — 15/10/2026
- Écran de lancement : le visuel fourni est affiché **tel quel** (en entier, sans recadrage ; fond flou sur les écrans larges), avec des animations superposées : halo et reflet sur le logo, étincelle qui suit l'anneau, ondes sous les repères de la carte, lumières de la ville qui scintillent, roue « Chargement… » qui tourne et trois points qui suivent les étapes réelles du chargement.

## 1.5.0 — 15/10/2026
- **La recherche ne démarre plus toute seule** : changer la date, le rayon, le type de garde, l'adresse ou le point sur la carte ne relance rien ; la recherche part au clic sur « Rechercher les pharmacies de garde ». Si les critères ont changé depuis les résultats affichés, un message le signale et le bouton est mis en évidence. Restent immédiats : toucher une ville et le bouton « Ma position » de l'en-tête.
- **Nouvel écran de lancement « nuit »** : tour Hassan illuminée, carte de la ville en perspective avec repères de pharmacies lumineux et itinéraire qui se dessine, villes couvertes qui défilent (Rabat, Salé, Témara), logo avec anneau d'orbite.
- **Indicateur de chargement sur mesure** : anneau de progression réelle autour d'une croix de pharmacie qui « bat », trois étapes (sources, gardes, carte). Animations réalisées avec GSAP.
- Chargement plus long à la première ouverture (environ 6,5 s, chaque étape au moins 1,5 s) ; environ 2,6 s ensuite ; toucher l'écran pour passer.

## 1.4.1 — 15/10/2026
- Écran de lancement : photo de la tour Hassan (Rabat) et rythme plus posé.

## 1.4.0 — 15/10/2026
- Nouvel **écran de lancement** animé : logo en repère qui se pose avec des ondes de localisation, titre bicolore, photo de la **tour Hassan** (Rabat), « Toujours proche de vous ».
- La barre de progression suit le vrai chargement (démarrage → sources → gardes du jour) ; l'écran disparaît dès que les données sont prêtes (environ 4 s à la première ouverture, chaque étape restant lisible ; plus court ensuite ; toucher l'écran pour passer).
- Animations réduites si l'appareil le demande (« réduire les animations ») ; fonctionne hors ligne.
- Photo : tour Hassan par Xhiliana (Unsplash, licence libre), trouvée via Orshot.

## 1.3.2 — 15/10/2026
- Suppression d'une fausse alerte « autre date » liée au planning hebdomadaire ; liens vers les sources regroupés.
- « 24h/24 » n'est plus répété ; titre lisible en entier sur téléphone.

## 1.3.1 — 14/10/2026
- « Ma position » plus fiable : GPS puis, à défaut, position réseau (Wi-Fi / antenne) ; position récente réutilisée.
- Message visible en haut de l'écran en cas d'échec, avec la marche à suivre selon l'appareil (iPhone, Android, ordinateur) et la détection des navigateurs intégrés aux applications (WhatsApp, Facebook…), où la localisation est souvent bloquée.

## 1.3.0 — 14/10/2026
- Nouvelle source **guidepharmacies.ma** : planning hebdomadaire de Rabat, Salé et Témara (avec Tamesna, Harhoura), semaine en cours **et semaine suivante** → les jours à venir s'affichent.
- Les deux sources sont croisées : une garde publiée par les deux passe en « confiance élevée » ; un désaccord est signalé.
- Positions : exacte quand une source la publie, sinon adresse géocodée, sinon centre du quartier affiché comme **approximatif** (≈, marqueur pointillé).
- Correction : la page vide d'annuaire-gratuit.ma n'est plus signalée comme une erreur de lecture ; « 9h à 00h00 » compris comme « jusqu'à minuit ».

## 1.2.0 — 13/10/2026
- Nouveau logo et nouvelle icône « repère-croix » (repère de carte + croix de pharmacie), choisis parmi 3 pistes Figma et 1 proposition Canva.
- Icônes Android (dont icône adaptative « maskable »), iPhone et favicon régénérées ; logo horizontal `public/icons/logo-horizontal.svg`.

## 1.1.0 — 13/10/2026
- Nombre de pharmacies de garde disponibles par ville (Rabat, Salé, Témara), visible dès l'ouverture ; une ville se choisit d'un geste.
- Raccourcis de date (hier → J+3) indiquant les jours pour lesquels des gardes sont connues.
- Jours à venir : import d'un tableau de garde officiel au format CSV (dossier `manual/`), complété automatiquement par les pharmacies connues.
- Carte sur téléphone : un doigt fait défiler la page, deux doigts déplacent la carte ; mode plein écran ; boutons + / −.
- Performance : données mises en cache 5 min, bibliothèques mises en cache séparément, rayon personnalisé sans recherche à chaque frappe.
- Gardes rattachées à leur date de début réelle ; parseur adapté à la structure réelle d'annuaire-gratuit.ma.
- Version de l'application et du build affichées (Paramètres → À propos, pied de page).

## 1.0.0 — 12/10/2026
- Première version : recherche par position, date, rayon et type ; carte Leaflet, rangs colorés, itinéraires OSRM ; statuts de fiabilité ; collecte planifiée et publication GitHub Pages.
