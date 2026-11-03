import type { Route } from "./types.ts";

/**
 * Regroupe les routes d'une ressource. Une instance est partagée entre les requêtes :
 * on garde donc les données de chaque requête dans son Context.
 *
 * @example
 * ```ts
 * import { Controller, type Route } from "./mod.ts";
 * class HelloController extends Controller {
 *   readonly prefix = "/hello";
 *   readonly routes: readonly Route[] = [
 *     { method: "GET", path: "/", handler: () => ({ message: "Salut !" }) },
 *   ];
 * }
 * ```
 */
export abstract class Controller {
  /** Préfixe commun, par exemple /users. Une chaîne vide désigne la racine. */
  abstract readonly prefix: string;
  /** Routes enregistrées une seule fois, quand le controller rejoint l'application. */
  abstract readonly routes: readonly Route[];
}
