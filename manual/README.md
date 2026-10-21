# Saisie des tableaux de garde officiels (jours à venir)

guidepharmacies.ma publie déjà le planning jusqu'à la fin de la semaine suivante. Pour aller plus loin
(mois complet) ou ajouter une source officielle, ajoutez ici le tableau de garde officiel (conseil régional de l'Ordre,
syndicat, affichage en pharmacie…). Le collecteur l'intègre au passage suivant (toutes les ~2 h).

## Le plus simple : un fichier CSV (Excel, Google Sheets, Numbers)

1. Copiez `modele-tableau.csv.txt`, remplissez une ligne par garde, enregistrez en **CSV** (séparateur `;` ou `,`),
   puis déposez le fichier dans ce dossier sous un nom en `.csv` (ex. `octobre-2026.csv`) — sur GitHub :
   *Add file → Upload files*.
2. Colonnes obligatoires : `date`, `ville` (Rabat, Salé, Témara), `nom`, `source_url` (lien ou référence vérifiable du tableau).
3. Colonnes facultatives : `adresse`, `quartier`, `telephone`, `type` (jour, nuit, 24h), `debut`, `fin`
   (par défaut : le jour même pour une garde de jour, jusqu'au lendemain sinon), `horaires`, `latitude`, `longitude`, `source`.
4. Dates au format `JJ/MM/AAAA` ou `AAAA-MM-JJ`.

Position, téléphone et adresse manquants sont repris automatiquement des pharmacies déjà connues de l'application
(même nom, même ville) ; sinon l'adresse est géocodée, et à défaut la pharmacie est listée « position non publiée ».
Rien n'est inventé. Une ligne invalide est ignorée et signalée dans le journal de la collecte.

Si une autre source publie une information différente pour la même pharmacie, l'app affiche « Sources contradictoires ».

## Format JSON (alternative)

Un fichier par date `AAAA-MM-JJ.json` — voir `exemple.json.txt`.

## Cliniques et hôpitaux : informations vérifiées (`sante.json`)

L'espace « Cliniques et hôpitaux » affiche ce que publient OpenStreetMap et la liste officielle du ministère de la Santé.
Pour ajouter une information **vérifiée** (horaires confirmés par l'établissement, urgences confirmées, désignation
officielle de garde publiée par une autorité), complétez `manual/sante.json`. Chaque entrée désigne l'établissement par
son identifiant OpenStreetMap (`"osm": "way/123456"`, visible dans le lien « OpenStreetMap » de la fiche) ou par son nom exact.

```json
{
  "etablissements": [
    {
      "osm": "way/738368993",
      "telephone": "05 37 00 00 00",
      "urgences": { "statut": "oui", "source": "Site officiel de l'hôpital", "url": "https://…", "verifieLe": "2026-10-21" },
      "horaires": { "texte": "Urgences 24h/24", "source": "Appel à l'accueil (référence)", "url": "https://…", "verifieLe": "2026-10-21" },
      "garde": [ { "du": "2026-10-25", "au": "2026-10-26", "source": "Délégation provinciale de la Santé", "url": "https://…" } ]
    }
  ]
}
```

- **Garde** : n'ajoutez une désignation que si une source **officielle** la publie (délégation, direction régionale, établissement).
  Sans elle, l'application n'affiche jamais un établissement comme « de garde ».
- Une entrée sans source ou sans date est ignorée et signalée dans le journal de la collecte.
