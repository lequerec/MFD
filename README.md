# MFD - Mini Framework Deno

**Version 0.1.0 - TypeScript - Deno 2 - Aucune dépendance externe**

MFD, c'est un petit framework pour créer des API avec Deno. L'idée : garder le côté structuré de
Nest, des classes, des controllers, des responsabilités claires, avec une prise en main toute
simple.

On déclare ses routes, on écrit ses handlers et on démarre le serveur. Pour cette première version,
on se concentre sur le coeur HTTP. Le reste viendra quand on en aura besoin.

## Les classes principales

- Une `Application` pour assembler les controllers et démarrer le serveur.
- Des `Controller` avec un préfixe et des routes explicites.
- Un `Router` avec chemins statiques, paramètres et priorité aux segments fixes.
- Un `Context` par requête, avec accès aux API Web natives.
- Des réponses JSON automatiques et la possibilité de renvoyer sa propre `Response`.
- Des erreurs HTTP centralisées, dont les réponses `404`, `405` et `500`.
- Un traitement de `HEAD`, des handlers asynchrones et des tests sans port réseau.

Pas encore de décorateurs, d'injection de dépendances, de middlewares, de modules ou d'ORM. La
v0.1.0 pose les fondations ; l'API pourra encore évoluer.

## Pour démarrer

Il faut **Deno 2**. La version 0.1.0 est vérifiée avec **Deno 2.9.8**. L'installation est décrite
dans la [documentation Deno](https://docs.deno.com/runtime/getting_started/installation/).

Après avoir cloné ce dépôt, place-toi dans son dossier :

```sh
deno --version
deno task dev
```

L'exemple démarre sur <http://127.0.0.1:8000> et redémarre quand les fichiers changent. Aucun
`npm install` à lancer. Pour un démarrage sans surveillance : `deno task start`. Pour arrêter le
serveur : `Ctrl+C`.

Quelques requêtes pour faire le tour :

```sh
curl http://127.0.0.1:8000/users
curl http://127.0.0.1:8000/users/1
curl 'http://127.0.0.1:8000/users?name=ada'
curl -I http://127.0.0.1:8000/users
curl -i -X POST http://127.0.0.1:8000/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Grace"}'
```

Le `POST` valide le nom et renvoie un utilisateur avec un statut `201`. C'est une démo :
l'utilisateur n'est pas sauvegardé et ne sera donc pas retrouvé avec un `GET`.

## Ta première API

Dans un fichier `main.ts` à la racine du dépôt :

```ts
import { Application, type Context, Controller, type Route } from "./mod.ts";

class HelloController extends Controller {
  readonly prefix = "/hello";

  // Une fonction fléchée garde this si ton handler en a besoin plus tard.
  private sayHello = (context: Context) => {
    return {
      message: `Salut ${context.params.name} !`,
      language: context.query.get("lang") ?? "fr",
    };
  };

  // Les handlers sont définis avant le tableau qui les référence.
  readonly routes: readonly Route[] = [
    { method: "GET", path: "/:name", handler: this.sayHello },
  ];
}

const app = new Application().register(new HelloController());

if (import.meta.main) {
  app.listen({ hostname: "127.0.0.1", port: 8000 });
}
```

Puis :

```sh
deno run --allow-net=127.0.0.1:8000 main.ts
curl 'http://127.0.0.1:8000/hello/Ada?lang=fr'
```

`mod.ts` est le point d'entrée public. Pour le moment, MFD s'utilise depuis les sources du dépôt ;
aucun paquet JSR ou npm n'est publié avec cette version.

## Comment ça circule ?

```text
Request → Application → Router → Context → Handler → Response
               └──── gestion centralisée des erreurs ────┘
```

### Application et controllers

`new Application().register(controller)` enregistre les routes du controller. Tu peux chaîner
plusieurs appels à `register()`.

Un controller étend `Controller` et fournit deux propriétés :

- `prefix` : le préfixe de ses routes, par exemple `/users` ; `""` ou `/` désigne la racine.
- `routes` : une liste de `{ method, path, handler }`.

Le `path` commence par `/`, ou vaut `""` pour la racine du controller. Les routes sont lues à
l'enregistrement : modifier le tableau ensuite ne reconfigure pas l'application.

**Un controller est partagé entre les requêtes.** Évite d'y stocker l'utilisateur courant ou le
corps d'une requête. Ces données restent dans le handler et son contexte. Si tu passes une méthode
classique comme handler, pense à `bind(this)` ; les fonctions fléchées conservent automatiquement
leur instance.

### Routage

Les méthodes disponibles sont `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` et `OPTIONS`. Les
chemins sont sensibles à la casse et la query string ne participe pas au routage.

- `/users/:id` capture un segment dans `context.params.id`.
- Les paramètres sont décodés une fois : `Andr%C3%A9` devient `André`.
- `/users` et `/users/` désignent la même route.
- Les segments fixes passent avant les paramètres, de gauche à droite, indépendamment de l'ordre
  d'enregistrement : `/users/me` passe avant `/users/:id`.
- Le chemin le plus précis est choisi **avant** la méthode. Un `POST /users/me` peut donc renvoyer
  `405` si `/users/me` existe uniquement en `GET`, même si un `POST /users/:id` existe aussi.
- Un chemin absent donne `404`. Une méthode absente sur un chemin existant donne `405` avec un
  en-tête `Allow`.
- `HEAD` utilise le handler `GET` si aucun handler `HEAD` n'est déclaré, puis retire le corps de la
  réponse. Le handler est bien exécuté : garde tes `GET` sans effet de bord.
- `OPTIONS` se déclare explicitement ; il n'y a pas de réponse CORS automatique.

Les doublons pour une même méthode sont refusés, y compris `/users/:id` et `/users/:name`.
L'enregistrement d'un controller est atomique : si une route est invalide, aucune de ses routes
n'est ajoutée.

Les wildcards, paramètres optionnels et expressions régulières ne sont pas pris en charge. Les
doubles slashs sont refusés dans les déclarations et ne correspondent à aucune route dans les
requêtes. Un encodage URI invalide donne `400`.

### Context

| Accès                        | Ce qu'on récupère                                    |
| ---------------------------- | ---------------------------------------------------- |
| `context.request`            | La `Request` native                                  |
| `context.url`                | L'URL complète                                       |
| `context.params`             | Les paramètres de chemin décodés, en lecture seule   |
| `context.query`              | Un `URLSearchParams`, avec `get()`, `getAll()`, etc. |
| `context.json(data, init?)`  | Une réponse JSON avec statut et en-têtes au choix    |
| `context.text(value, init?)` | Une réponse texte UTF-8                              |

Le corps n'est pas lu automatiquement. Utilise `await context.request.json()`, `text()` ou
`formData()` selon ton besoin. Comme avec toute `Request`, le corps est un flux : on le consomme une
seule fois.

La validation reste à la charge du handler. Pour transformer un JSON mal formé en `400`, intercepte
l'erreur de lecture et lance une `HttpError`, comme dans
[l'exemple users](examples/basic/users.controller.ts).

### Réponses

Un handler peut être synchrone ou asynchrone. Son résultat est converti ainsi :

| Résultat                                          | Réponse                                           |
| ------------------------------------------------- | ------------------------------------------------- |
| `Response`                                        | Conservée telle quelle, sauf le corps pour `HEAD` |
| Objet, tableau, chaîne, nombre, booléen ou `null` | JSON avec statut `200`                            |
| `undefined` ou absence de `return`                | Réponse vide avec statut `204`                    |

Une chaîne devient donc une **chaîne JSON**. Pour du texte brut, utilise `context.text("Salut !")`.
Pour un statut personnalisé :

```ts
return context.json({ id: "42" }, { status: 201 });
```

Les valeurs doivent être sérialisables en JSON. Un objet circulaire ou un `BigInt` non pris en
charge par JSON provoque une erreur `500`.

### Erreurs

Pour une erreur attendue :

```ts
throw new HttpError(404, "Cet utilisateur n'existe pas");
```

Le client reçoit :

```json
{
  "status": 404,
  "message": "Cet utilisateur n'existe pas"
}
```

`HttpError` accepte les statuts entiers de `400` à `599` et un troisième argument optionnel pour les
en-têtes. Son message est public : évite d'y mettre des données sensibles.

Les autres exceptions, les promesses rejetées et les erreurs de sérialisation sont journalisées avec
`console.error`. Le client reçoit seulement :

```json
{
  "status": 500,
  "message": "Erreur interne du serveur"
}
```

### Démarrage et arrêt

`app.listen(options?)` utilise `Deno.serve` et renvoie son serveur natif. Par défaut, il écoute sur
`127.0.0.1:8000`. Tu peux passer les options TCP de Deno, dont `port`, `hostname`, `signal` et
`onListen`.

```ts
const server = app.listen({ hostname: "127.0.0.1", port: 9000 });
// Plus tard, pour attendre un arrêt propre :
await server.shutdown();
```

Adapte l'autorisation `--allow-net` si tu changes d'adresse ou de port. Pour exposer le serveur sur
toutes les interfaces, utilise `hostname: "0.0.0.0"` et la permission réseau correspondante.

## Tester sans démarrer de serveur

`app.fetch` prend une `Request` et renvoie une `Promise<Response>`. Pas besoin d'écouter sur un port
pour vérifier une API :

```ts
import app from "./examples/basic/main.ts";

const response = await app.fetch(new Request("http://localhost/users/1"));
console.log(response.status); // 200
console.log(await response.json()); // { id: "1", name: "Ada" }
```

Importer `mod.ts` ou l'exemple ne démarre aucun serveur. `app.fetch` conserve son instance et peut
aussi être passé directement à `Deno.serve`.

## Développer MFD

| Commande               | Rôle                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `deno task dev`        | Démarrer l'exemple avec redémarrage automatique            |
| `deno task start`      | Démarrer l'exemple sans surveillance                       |
| `deno task check`      | Vérifier les types du framework, des exemples et des tests |
| `deno task test`       | Exécuter les tests sans permission réseau                  |
| `deno task test:watch` | Relancer les tests à chaque modification                   |
| `deno task fmt`        | Formater le projet                                         |
| `deno task lint`       | Analyser le code                                           |
| `deno task verify`     | Vérifier le formatage, le lint, les types et les tests     |
| `deno task doc`        | Consulter la documentation publique dans le terminal       |
| `deno task doc:html`   | Générer la documentation HTML dans `docs/api/`             |

Les commentaires JSDoc suivent le même principe que le projet : expliquer le comportement et les
petits pièges, sans raconter ce que la ligne de code dit déjà.

Pour VS Code, installe l'extension Deno recommandée. La configuration du projet active Deno et
désactive le mode expérimental TypeScript 7, qui empêche le chargement du plugin Deno dans la
version de VS Code utilisée pour ce projet.

```text
mod.ts                           Exports publics
src/
  application.ts                 Assemblage et cycle HTTP
  controller.ts                  Contrat des controllers
  context.ts                     Contexte d'une requête
  router.ts                      Déclaration et résolution des routes
  response.ts                    Conversion des résultats
  http-error.ts                  Erreurs HTTP attendues
  types.ts                       Types partagés
examples/basic/
  main.ts                        Démarrage de l'exemple
  users.controller.ts            Routes de démonstration
tests/                           Tests du coeur HTTP
```

Aucune dépendance externe pour cette version. Si on en ajoute, le fichier `deno.lock` généré devra
être versionné.

## Et ensuite ?

Les pistes sont ouvertes : middlewares, validation des entrées, services et injection de dépendances
si ça simplifie vraiment l'usage. L'objectif reste le même : une base lisible qu'on peut comprendre
et faire évoluer sans se perdre.

Pour proposer une évolution ou signaler un problème, ouvre une issue avec un exemple reproductible.
Pour une contribution, fais passer `deno task verify` et mets à jour la doc si le comportement
public change.
