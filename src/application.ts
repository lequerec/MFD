import type { Controller } from "./controller.ts";
import { Context } from "./context.ts";
import { HttpError } from "./http-error.ts";
import { toResponse } from "./response.ts";
import { normalizePath, Router } from "./router.ts";
import type { Middleware, RouteMatch, ServeOptions } from "./types.ts";

/**
 * Assemble les controllers et traite les requêtes, avec ou sans serveur réseau.
 *
 * @example
 * ```ts
 * import { Application } from "./mod.ts";
 * const app = new Application();
 * const response = await app.fetch(new Request("http://localhost/inconnu"));
 * console.log(response.status); // 404
 * ```
 */
export class Application {
  private readonly router = new Router();
  private readonly middlewares: Middleware[] = [];

  /** Ajoute un middleware global. Le premier enregistré entoure tous les suivants. */
  use(middleware: Middleware): this {
    if (typeof middleware !== "function") {
      throw new TypeError("Un middleware doit être une fonction.");
    }
    this.middlewares.push(middleware);
    return this;
  }

  /** Convertit une erreur en réponse avant de remonter la chaîne. */
  private errorResponse(error: unknown): Response {
    if (error instanceof HttpError) {
      return Response.json({ status: error.status, message: error.message }, {
        status: error.status,
        headers: error.headers,
      });
    }
    console.error("[MFD] Erreur pendant le traitement d'une requête :", error);
    return Response.json({ status: 500, message: "Erreur interne du serveur" }, { status: 500 });
  }

  /** Enregistre les routes d'un controller et renvoie l'application pour chaîner les appels. */
  register(controller: Controller): this {
    const prefix = normalizePath(controller.prefix);
    this.router.add(controller.routes.map((route) => {
      const path = normalizePath(route.path);
      return {
        ...route,
        path: `${prefix === "/" ? "" : prefix}${path === "/" ? "" : path}` || "/",
      };
    }));
    return this;
  }

  /**
   * Traite une requête sans ouvrir de port. La fonction fléchée garde this quand on la passe à Deno.
   * Les erreurs inattendues sont journalisées côté serveur, sans détail envoyé au client.
   */
  readonly fetch = async (request: Request): Promise<Response> => {
    let match: RouteMatch | undefined;
    let routingError: unknown;
    try {
      match = this.router.resolve(request.method, new URL(request.url).pathname);
    } catch (error) {
      routingError = error;
    }
    const context = new Context(request, match?.kind === "matched" ? match.params : {});
    // Une requête en cours garde sa chaîne, même si use() est appelé entre-temps.
    const middlewares = [...this.middlewares];
    const dispatch = async (index: number): Promise<Response> => {
      try {
        const middleware = middlewares[index];
        if (middleware) {
          let called = false;
          const response = await middleware(context, () => {
            if (called) throw new Error("next() ne peut être appelé qu'une fois par middleware.");
            called = true;
            return dispatch(index + 1);
          });
          if (!(response instanceof Response)) {
            throw new TypeError("Un middleware doit renvoyer une Response.");
          }
          return response;
        }
        if (routingError) throw routingError;
        if (!match || match.kind === "not-found") throw new HttpError(404, "Route introuvable");
        if (match.kind === "method-not-allowed") {
          throw new HttpError(405, "Méthode non autorisée", { Allow: match.allowed.join(", ") });
        }
        return toResponse(await match.handler(context));
      } catch (error) {
        // Chaque étage convertit ses erreurs : les middlewares extérieurs voient la réponse.
        return this.errorResponse(error);
      }
    };
    const response = await dispatch(0);
    if (request.method === "HEAD") {
      await response.body?.cancel();
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    return response;
  };

  /**
   * Démarre Deno.serve sur 127.0.0.1:8000 par défaut.
   * Le serveur retourné expose shutdown() pour l'arrêter proprement.
   */
  listen(options: ServeOptions = {}): Deno.HttpServer<Deno.NetAddr> {
    return Deno.serve({ hostname: "127.0.0.1", port: 8000, ...options }, this.fetch);
  }
}
