# Changelog

## 0.2.0 — 3 novembre 2026

- Ajout de `Application.use()`, des types `Middleware` et `Next`, et d'une chaîne globale avec
  exécution aller-retour et possibilité de répondre directement.
- Conversion des erreurs à chaque étage pour que les middlewares extérieurs puissent traiter les
  réponses d'erreur. Détection des doubles appels à `next()`.
- Ajout de `logger()` avec une sortie personnalisable et une durée de traitement.
- Ajout de `cors()` : origines explicites ou wildcard, credentials, preflights, en-têtes autorisés
  et exposés, cache et conservation de `Vary`.
- Mise à jour de l'exemple users, du README et des commentaires JSDoc.
- Ajout de tests des middlewares, du logger et du CORS ; maintien des tests de la v0.1.0.
- Ajout de la licence MIT.

La migration depuis la v0.1.0 ne demande aucun changement dans les controllers. Les middlewares sont
facultatifs ; sans `use()`, le comportement du routage est conservé.

## 0.1.0 — 2 novembre 2026

- Première version du cœur HTTP : application, controllers, routage et contexte.
- Réponses JSON, erreurs HTTP centralisées, routes paramétrées et prise en charge de HEAD.
- Exemple users, tests, configuration Deno et documentation JSDoc.
