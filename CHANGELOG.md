# Historique des versions

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
