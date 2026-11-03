# MFD - Mini Framework Deno

**Version 0.2.0 - TypeScript - Deno 2 - Aucune dépendance externe**

MFD, c'est un petit framework pour créer des API avec Deno. L'idée : garder le côté structuré de
Nest, des classes, des controllers, des responsabilités claires, avec une prise en main toute
simple.

On déclare ses routes, on écrit ses handlers et on démarre le serveur. La v0.2.0 ajoute des
middlewares pour entourer ce traitement, avec un logger et du CORS prêts à utiliser.

## Les classes principales

- Une `Application` pour assembler les controllers et démarrer le serveur.
- Des `Controller` avec un préfixe et des routes explicites.
- Un `Router` avec chemins statiques, paramètres et priorité aux segments fixes.
- Un `Context` par requête, avec accès aux API Web natives.
- Des réponses JSON automatiques et la possibilité de renvoyer sa propre `Response`.
- Des erreurs HTTP centralisées, dont les réponses `404`, `405` et `500`.
- Un traitement de `HEAD`, des handlers asynchrones et des tests sans port réseau.
- Des middlewares globaux avec `app.use()`, un logger et une politique CORS configurable.

Pas encore de décorateurs, d'injection de dépendances, de modules ou d'ORM. L'API pourra encore
évoluer.

## Pour démarrer

Il faut **Deno 2**. La version 0.2.0 est vérifiée avec **Deno 2.9.8**. L'installation est décrite
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
Application → résolution du chemin et création du Context
            → middlewares → handler (ou erreur de routage)
            ← middlewares ← Response
            → retrait du corps pour HEAD
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
- Sans middleware CORS, `OPTIONS` se déclare explicitement. Avec `cors()`, les preflights sont
  traités automatiquement ; les autres requêtes `OPTIONS` suivent le routage normal.

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

## Les middlewares

Un middleware entoure la suite du traitement. On l'enregistre avec `app.use()` :

```ts
import { Application, cors, logger } from "./mod.ts";
import { UsersController } from "./examples/basic/users.controller.ts";

const app = new Application()
  .use(logger())
  .use(cors({ origin: "http://localhost:3000" }))
  .register(new UsersController());
```

Le premier enregistré est le premier appelé, et le dernier à récupérer la réponse :

```text
logger → cors → handler → cors → logger
```

Les middlewares sont globaux : ils voient aussi les réponses `404`, `405` et les erreurs de chemin.
Le chemin a déjà été résolu quand ils commencent : `context.params` est disponible pour une route
trouvée, et vide sinon. Ils utilisent tous le même contexte pour une requête, mais chaque requête a
son propre contexte et sa propre chaîne.

### Écrire son middleware

```ts
import type { Middleware } from "./mod.ts";

const poweredBy: Middleware = async (_context, next) => {
  const response = await next();
  // On copie les en-têtes : certaines Response natives ont des en-têtes immuables.
  const headers = new Headers(response.headers);
  headers.set("X-Powered-By", "MFD");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
```

Quelques règles pour garder les choses simples :

- Renvoyer une `Response`, y compris après `await next()`.
- Appeler `next()` au plus une fois et attendre sa promesse. Un double appel est une erreur et
  produit une réponse `500` s'il n'est pas intercepté.
- Pour couper court, renvoyer directement une réponse sans appeler `next()`.
- Une exception dans un middleware suit les mêmes règles qu'une exception dans un handler. Une
  `HttpError` conserve son statut ; une erreur inattendue devient un `500`.
- `next()` renvoie les erreurs internes sous forme de réponses : les middlewares extérieurs peuvent
  donc les journaliser ou leur ajouter des en-têtes.

L'ordre compte pour les erreurs aussi. Un middleware peut modifier les réponses des couches placées
**après lui**, pas une erreur lancée par une couche extérieure. Place le logger en premier, puis le
CORS, puis tes autres middlewares. Le corps des réponses `HEAD` est supprimé après le retour de
toute la chaîne.

### Logger

`logger()` écrit la méthode, le chemin, le statut et la durée dans `console.info`. La durée mesure
le traitement jusqu'à la création de la réponse, sans attendre l'envoi du corps sur le réseau. La
query string et le corps ne sont pas journalisés par défaut.

Tu peux fournir ta propre sortie synchrone :

```ts
logger({
  write: ({ method, path, status, durationMs }) => {
    console.info({ method, path, status, durationMs });
  },
});
```

Le callback `write` doit être synchrone. S'il lance une exception, c'est une erreur middleware.

### CORS

Le CORS permet à un navigateur de lire les réponses de ton API depuis une autre origine. L'exemple
autorise `http://localhost:3000`. Pour une configuration plus complète :

```ts
cors({
  origin: ["http://localhost:3000", "https://app.example.com"],
  credentials: true,
  methods: ["GET", "HEAD", "POST"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["X-Total-Count"],
  maxAge: 600,
});
```

| Option          | Valeur par défaut                                               |
| --------------- | --------------------------------------------------------------- |
| `origin`        | `"*"`, toutes les origines sans credentials                     |
| `credentials`   | `false`                                                         |
| `methods`       | Toutes les méthodes de MFD                                      |
| `allowHeaders`  | `["Content-Type"]`                                              |
| `exposeHeaders` | `[]`                                                            |
| `maxAge`        | Non envoyé ; sinon un nombre entier de secondes, positif ou nul |

Les origines explicites sont exactes, sans chemin ni slash final. `credentials: true` avec
`origin: "*"` est refusé à la configuration. Les noms d'en-têtes doivent être explicites, sans
wildcard ; leur comparaison ne tient pas compte de la casse.

Un preflight est une requête `OPTIONS` avec `Origin` et `Access-Control-Request-Method`. Il reçoit
`204` si l'origine, la méthode et les en-têtes demandés sont autorisés, sinon `403`. Le handler
n'est pas exécuté. La politique est globale : elle ne vérifie pas qu'une route existe pour ce
chemin. La requête réelle reste soumise au routage habituel.

Les réponses ordinaires d'une origine refusée continuent leur traitement, sans en-tête
`Access-Control-Allow-Origin`. Les réponses autorisées, erreurs comprises, reçoivent les en-têtes
CORS. Le middleware conserve les autres en-têtes, complète `Vary` pour les caches et remplace les
éventuels en-têtes CORS de la réponse par sa propre politique.

Le CORS contrôle ce que le navigateur peut lire. Il ne remplace ni l'authentification, ni les
autorisations, ni une protection CSRF.

Pour tester le preflight de l'exemple :

```sh
curl -i -X OPTIONS http://127.0.0.1:8000/users \
  -H 'Origin: http://localhost:3000' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
```

## Développer MFD

| Commande               | Rôle                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `deno task dev`        | Démarrer l'exemple avec redémarrage automatique                  |
| `deno task start`      | Démarrer l'exemple sans surveillance                             |
| `deno task check`      | Vérifier les types du framework, des exemples et des tests       |
| `deno task test`       | Exécuter les tests sans permission réseau                        |
| `deno task test:watch` | Relancer les tests à chaque modification                         |
| `deno task fmt`        | Formater le projet                                               |
| `deno task lint`       | Analyser le code                                                 |
| `deno task verify`     | Vérifier le formatage, le lint, les types, les tests et la JSDoc |
| `deno task doc`        | Consulter la documentation publique dans le terminal             |
| `deno task doc:html`   | Générer la documentation HTML dans `docs/api/`                   |

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
  middlewares/
    logger.ts                    Journalisation des requêtes
    cors.ts                      Politique CORS et preflights
examples/basic/
  main.ts                        Démarrage de l'exemple
  users.controller.ts            Routes de démonstration
tests/                           Tests du coeur HTTP
```

Aucune dépendance externe pour cette version. Si on en ajoute, le fichier `deno.lock` généré devra
être versionné.

## Et ensuite ?

Les pistes sont ouvertes : validation des entrées, services et injection de dépendances si ça
simplifie vraiment l'usage. L'objectif reste le même : une base lisible qu'on peut comprendre et
faire évoluer sans se perdre.

Pour proposer une évolution ou signaler un problème, ouvre une issue avec un exemple reproductible.
Pour une contribution, fais passer `deno task verify` et mets à jour la doc si le comportement
public change.

## Licence

MFD est distribué sous [licence MIT](LICENSE). Tu peux l'utiliser, le modifier, le redistribuer et
le vendre, y compris dans un projet propriétaire. Il faut conserver le texte de la licence et la
mention de copyright. Le code est fourni sans garantie.

Les changements de chaque version sont dans le [changelog](CHANGELOG.md).
