# Sources des gardes — étude de faisabilité (13/10/2026)

Zone de démarrage : **Rabat, Salé, Témara**.

| Source | Statut | Ce qu'elle publie | Limites |
|---|---|---|---|
| Conseils régionaux / Ordre des pharmaciens | Non trouvée en ligne | Aucun tableau de garde ni API publique identifiés pour Rabat-Salé-Témara | Saisie manuelle possible (`manual/`) si un tableau officiel est obtenu |
| **annuaire-gratuit.ma** | **Active** | Liste par ville (`/pharmacie-garde-<ville>.html`) avec date « mise à jour le … » ou « Aujourd'hui … », type de garde, quartier, adresse, souvent les coordonnées ; **fiche par pharmacie** avec téléphone, coordonnées et **historique de garde daté (début/fin)** | Site d'annuaire, non officiel. Pendant l'étude, certaines pages servaient une liste d'une **autre date** que le jour même (ex. Rabat « 28 septembre » consultée le 13 octobre) : le collecteur lit la date de chaque page et ne confirme jamais une garde sur une page périmée. Téléphone masqué sur la liste, lu sur la fiche. |
| lematin.ma | Désactivée | Dates début/fin par pharmacie (Rabat) | Rabat uniquement ; la liste est chargée par un point d'accès interdit par son robots.txt (`/ajax/`, `/api/`). |
| wadifapublic.ma | Désactivée | Listes par ville (dont Témara, Salé, Harhoura), coordonnées | Aucune date de validité explicite ; dispositif anti-robot (« honeypot ») présent : on ne contourne pas. |
| med.ma | Non utilisée | Annuaire par ville et type | Pas de date de validité ni d'horodatage : ne permet pas d'affirmer une garde. |

## Règles de fiabilité appliquées

- **Confirmée** : la date demandée est couverte par l'historique daté de la fiche (début ≤ date ≤ fin), et/ou la pharmacie figure sur une liste **datée du jour même de la collecte**.
  - confiance **élevée** : deux sources indépendantes concordantes (ex. annuaire + tableau officiel saisi) ;
  - **moyenne** : liste datée du jour + historique de la fiche ;
  - **faible** : un seul de ces deux signaux.
- **À confirmer** : trouvée, mais page sans date, page périmée, ou historique muet.
- **Sources contradictoires** : type de garde ou période différents selon les sources.
- **Expirée** : date de fin publiée passée, plage horaire publiée terminée, ou garde de nuit de la veille après midi.
- Aucun horaire, téléphone ou coordonnée n'est inventé : champ inconnu = `null`, affiché « non publié ».

## Respect des sites

- Pages autorisées par les robots.txt (vérifiés le 13/10/2026), en-tête `User-Agent` identifiant le projet.
- ≥ 1,5 s entre deux requêtes, au plus ~50 pages par passage, toutes les ~2 h.
- Les fiches déjà connues ne sont re-téléchargées que si leur historique ne couvre pas encore la date (ou après 7 jours).
- Géocodage Nominatim seulement pour les adresses sans coordonnées, 8 au plus par passage, résultats mis en cache.

## Si la source change ou bloque

Le collecteur marque la source « en erreur » (fichier `public/data/status.json`, visible dans l'app → Paramètres) et le workflow affiche un avertissement. Lancez `npm run check:sources` en local pour voir le détail. Les parseurs sont dans `src/shared/connectors/annuaireGratuit.ts` et s'appuient sur des motifs stables (liens de fiche `-s<id>.html`, liens `destination=lat,lng`, dates ISO de l'historique) plutôt que sur des classes CSS.
