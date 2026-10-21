# Pharmacies de Garde Maroc

Version actuelle : **1.7.0** — voir [CHANGELOG.md](CHANGELOG.md).

Application web installable (PWA) qui trouve les **pharmacies de garde autour de vous** — et, depuis la v1.6, les **cliniques et hôpitaux** (onglet dédié, lien direct `#/cliniques`) —, pour une **date** et un **rayon** donnés, à partir de sources publiques datées — démarrage sur **Rabat, Salé et Témara**.

- Position GPS, adresse (Nominatim) ou point touché sur la carte
- Date (aujourd'hui par défaut), rayon 1–30 km ou personnalisé, filtre jour / nuit / 24h
- Classement du plus proche au plus éloigné, marqueurs numérotés et colorés par rang (1 vert foncé, 2 vert clair, 3 bleu, 4 orange, 5 violet, puis palette distincte)
- Itinéraire routier réel (OSRM, voiture ou à pied) vers la pharmacie sélectionnée, ou vers toutes sur demande ; lien Google Maps
- Pour chaque pharmacie : source, date de la page, date de vérification, statut (**Confirmée / À confirmer / Sources contradictoires / Expirée**) et niveau de confiance
- Liste et carte synchronisées ; tri par distance ou par durée
- Design : fichier Figma « Pharmacies de Garde Maroc — UI » (tokens, composants, écrans mobile/desktop)

> Les informations sont collectées automatiquement sur des sites publics. En cas de doute, appelez la pharmacie avant de vous déplacer.

## Espace « Cliniques et hôpitaux » (v1.6)

- Recherche par ville (Rabat, Salé, Témara), par position GPS, adresse ou point sur la carte, dans un rayon en km.
- Filtres : type (hôpital public, clinique privée, hôpital privé, hôpital militaire, statut non publié, autre), service (urgences, maternité, pédiatrie, cardiologie… seulement ceux publiés), « urgences déclarées uniquement ».
- Classement par distance croissante ou décroissante, carte et liste synchronisées, itinéraire OSRM, appel, Google Maps.
- Fiche : type et catégorie officielle, adresse, coordonnées, téléphone, spécialités, urgences, horaires, garde, sources et dates.
- Données : liste officielle du ministère de la Santé (data.gov.ma) + OpenStreetMap + saisies vérifiées — voir [SOURCES.md](SOURCES.md). Aucun établissement n'est présenté « de garde » sans désignation officielle.
- Code : `src/shared/health/` (modèle, construction, recherche), `scripts/collect-health.ts` (collecte), `src/components/health/` (interface). La carte, la géolocalisation, le rayon et les itinéraires sont ceux de l'espace Pharmacies (`PharmacyMap`, `OriginPicker`, `RadiusPicker`, `services/routing.ts`).

## Architecture (100 % GitHub, gratuite)

```
GitHub Actions (toutes les ~2 h)                     GitHub Pages
┌─────────────────────────────────┐   commit    ┌──────────────────────────────┐
│ scripts/collect.ts              │ ──────────▶ │ public/data/duty/<date>.json │
│  • lit les sources actives      │             │ public/data/status.json      │
│  • vérifie les dates            │   build     │ app React (PWA)              │
│  • déduplique, statuts          │ ──────────▶ │  • Leaflet + OpenStreetMap   │
└─────────────────────────────────┘             │  • OSRM (itinéraires)        │
                                                │  • Nominatim (adresse)       │
                                                └──────────────────────────────┘
```

Pourquoi pas tout dans le navigateur ? Les sites sources n'autorisent pas les appels depuis une autre origine (CORS) ; GitHub Pages ne peut pas exécuter de serveur. Le collecteur tourne donc dans GitHub Actions et publie des fichiers JSON statiques. Pas de serveur, pas de base de données, **aucune clé secrète**.

Voir **[SOURCES.md](SOURCES.md)** pour l'étude de faisabilité, les sources prises en charge et leurs limites.

## Démarrer en local

Prérequis : Node.js ≥ 22.6.

```bash
npm install
npm test                 # tests unitaires et de bout en bout (sans réseau)
npm run collect          # collecte réelle → public/data/
npm run collect:sante    # cliniques et hôpitaux → public/data/sante/ (OSM ≤ 1 fois/jour)
npm run dev              # http://localhost:5173
```

Autres commandes :

```bash
npm run check:sources    # simulation de collecte détaillée, sans rien écrire (diagnostic)
npm run typecheck        # vérification TypeScript
npm run build && npm run preview
```

## Publier sur GitHub Pages

1. Créez un dépôt vide sur GitHub, par ex. `pharmacies-garde-maroc`.
2. Poussez le code :
   ```bash
   git remote add origin https://github.com/<utilisateur>/pharmacies-garde-maroc.git
   git push -u origin main
   ```
3. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
4. **Settings → Actions → General → Workflow permissions : Read and write permissions** (le collecteur enregistre les données).
5. Onglet **Actions → « Collecte des gardes et déploiement » → Run workflow** pour le premier passage.
6. L'app est en ligne sur `https://<utilisateur>.github.io/pharmacies-garde-maroc/`.

Le chemin de base est calculé automatiquement à partir du nom du dépôt (`/` si le dépôt s'appelle `<utilisateur>.github.io`).

À savoir : GitHub suspend les tâches planifiées d'un dépôt public sans activité pendant 60 jours ; il suffit alors de relancer le workflow depuis l'onglet Actions.

## Configuration

Aucune clé n'est nécessaire. Les services publics utilisés peuvent être remplacés via `.env.local` (voir [.env.example](.env.example)) :

| Service | Usage | Coût | Politique d'usage |
|---|---|---|---|
| Tuiles OpenStreetMap | fond de carte | gratuit | usage raisonnable + attribution |
| OSRM (routing.openstreetmap.de, secours router.project-osrm.org) | itinéraires à la demande | gratuit | usage raisonnable, pas de calcul massif |
| Nominatim | adresse de départ (à la validation, jamais à la frappe) | gratuit | ≤ 1 requête/s, cache |
| GitHub Actions / Pages | collecte + hébergement | gratuit (dépôt public) | quotas GitHub |

Pour un trafic important, remplacez tuiles/OSRM/Nominatim par une instance dédiée ou un fournisseur commercial (MapTiler, openrouteservice…) — sans exposer de clé secrète : une clé côté navigateur doit être restreinte par domaine chez le fournisseur.

## Ajouter une ville ou une source

- **Ville** : ajouter l'identifiant dans `CityId` (`src/shared/types.ts`), dans `CITIES` (`src/shared/connectors/registry.ts`) et le slug dans `ANNUAIRE_CITY_SLUGS`.
- **Source** : écrire un parseur pur dans `src/shared/connectors/`, des tests sur des pages modèles, l'appeler dans `scripts/collect.ts`, et la déclarer dans `CONNECTORS`. Une source qui ne peut pas être lue légalement ou de façon fiable reste déclarée **désactivée** avec sa raison.
- **Tableau officiel / jours à venir** : déposer un CSV dans `manual/` (voir [manual/README.md](manual/README.md)). Les sites en ligne ne publient les gardes que le jour même.

## Structure

```
src/
  shared/                 logique pure, partagée app + collecteur (testée)
    types.ts              modèle normalisé (Pharmacy, DutyRecord…)
    dates.ts              fuseau Africa/Casablanca, dates FR, plages horaires
    distance.ts           Haversine, filtrage par rayon, classement
    duty.ts               types de garde
    status.ts             statuts de fiabilité, expiration, sélection par date
    merge.ts              doublons, fusion multi-sources, contradictions
    search.ts             recherche (date + type + rayon + rang)
    connectors/           registre des sources + parseurs annuaire-gratuit.ma
  services/               géolocalisation, géocodage, routage, chargement des données
  components/             Header, SearchPanel, PharmacyMap, PharmacyList, PharmacyCard, MapLegend, SourceStatus…
  utils/colors.ts         couleurs de rang (= tokens Figma)
scripts/collect.ts        collecteur (Node 22, sans dépendance)
tests/                    tests node:test + pages modèles
public/data/              données produites par le collecteur
manual/                   saisie manuelle de tableaux officiels
.github/workflows/        collecte planifiée + déploiement Pages
```

## Tests

`npm test` (51 tests, Node `node:test`, sans dépendance ni réseau) couvre : Haversine, filtrage par rayon, classement et rangs, dates/fuseau/plages horaires, types de garde, téléphones, parseurs liste/fiche, statuts de fiabilité, expiration, gardes de nuit de la veille, doublons et contradictions, collecteur de bout en bout, couleurs de rang.

Les pages modèles de `tests/fixtures/` reproduisent la structure observée des pages sources ; elles ne remplacent pas un essai réel (`npm run check:sources`).

## Confidentialité

La position reste dans le navigateur ; elle n'est envoyée qu'aux services nécessaires (tuiles, OSRM à la demande, Nominatim si vous cherchez une adresse) et n'est jamais enregistrée. Seules des préférences non sensibles (rayon, filtre, mode de trajet) sont mémorisées localement.
