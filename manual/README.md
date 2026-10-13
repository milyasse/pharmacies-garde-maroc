# Saisie des tableaux de garde officiels (jours à venir)

Les sites consultés automatiquement ne publient les gardes de Rabat, Salé et Témara **que le jour même**.
Pour afficher les **jours à venir**, ajoutez ici le tableau de garde officiel (conseil régional de l'Ordre,
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
