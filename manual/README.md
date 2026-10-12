# Saisie manuelle d'un tableau de garde

Quand une source officielle (conseil régional de l'Ordre des pharmaciens, délégation, affichage
officiel) publie un tableau de garde qui ne peut pas être collecté automatiquement, vous pouvez le
saisir ici. Le collecteur le fusionne avec les autres sources au prochain passage.

- Un fichier par date : `manual/AAAA-MM-JJ.json` (date de début de la garde).
- `sourceUrl` est **obligatoire** (lien du tableau, ou référence vérifiable du document).
- Ne saisissez que ce qui est publié : laissez absent tout champ inconnu (jamais de coordonnées approximatives).
- Si une autre source publie une information différente, la garde apparaîtra « Sources contradictoires ».

Voir `exemple.json.txt` pour le format (renommez en `AAAA-MM-JJ.json` ; l'exemple n'est pas lu tel quel).
