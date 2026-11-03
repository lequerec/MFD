import type { Context } from "./context.ts";

/** Les méthodes qu'on peut déclarer sur une route. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** Une valeur JSON, une Response, ou rien du tout pour une réponse 204. */
export type HandlerResult = Response | string | number | boolean | null | object | void;

/** Le boulot d'une route : recevoir un contexte et renvoyer un résultat. */
export type Handler = (context: Context) => HandlerResult | Promise<HandlerResult>;

/** Une route explicite, sans décorateur ni magie. */
export interface Route {
  /** Méthode HTTP attendue. */
  readonly method: HttpMethod;
  /** Chemin relatif au préfixe du controller, par exemple /:id. */
  readonly path: string;
  /** Utiliser une fonction fléchée ou bind() si elle accède à this. */
  readonly handler: Handler;
}

/** Résultat du routage : une route, une méthode refusée, ou aucun chemin. */
export type RouteMatch =
  | {
    readonly kind: "matched";
    readonly handler: Handler;
    readonly params: Readonly<Record<string, string>>;
  }
  | { readonly kind: "method-not-allowed"; readonly allowed: readonly HttpMethod[] }
  | { readonly kind: "not-found" };

/** Options TCP passées au serveur natif Deno, avec une écoute locale par défaut. */
export type ServeOptions = Deno.ServeTcpOptions & Deno.ServeOptions;
