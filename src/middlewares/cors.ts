import type { HttpMethod, Middleware } from "../types.ts";

/** Une politique CORS globale, indépendante des routes réellement enregistrées. */
export interface CorsOptions {
  /** Origine exacte, liste d'origines exactes, ou * (valeur par défaut). */
  readonly origin?: string | readonly string[];
  /** Autorise les credentials. Interdit avec une origine *. Faux par défaut. */
  readonly credentials?: boolean;
  /** Méthodes autorisées au preflight ; toutes les méthodes de MFD par défaut. */
  readonly methods?: readonly HttpMethod[];
  /** En-têtes demandés autorisés, sans distinction de casse. Content-Type par défaut. */
  readonly allowHeaders?: readonly string[];
  /** En-têtes de réponse accessibles au JavaScript du navigateur. Aucun par défaut. */
  readonly exposeHeaders?: readonly string[];
  /** Durée du cache preflight en secondes ; omise par défaut. */
  readonly maxAge?: number;
}

const supported = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function vary(headers: Headers, names: readonly string[]): void {
  const values = (headers.get("vary") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (values.includes("*")) return;
  for (const name of names) {
    if (!values.some((v) => v.toLowerCase() === name.toLowerCase())) values.push(name);
  }
  if (values.length) headers.set("vary", values.join(", "));
}

/**
 * Ajoute les en-têtes CORS aux réponses, erreurs comprises, et répond aux preflights.
 * Une origine refusée ne reçoit aucun accord CORS ; sa requête ordinaire continue.
 * CORS contrôle la lecture par le navigateur, pas l'authentification de ton API.
 */
export function cors(options: CorsOptions = {}): Middleware {
  const origin = options.origin ?? "*";
  const origins = typeof origin === "string" ? [origin] : [...origin];
  const wildcard = origin === "*";
  const credentials = options.credentials ?? false;
  const methods = [...(options.methods ?? supported)];
  const allowHeaders = [...(options.allowHeaders ?? ["Content-Type"])];
  const exposeHeaders = [...(options.exposeHeaders ?? [])];
  const maxAge = options.maxAge;
  if (credentials && wildcard) throw new Error("CORS : credentials exige une origine explicite.");
  for (const value of origins) {
    if (wildcard) continue;
    let valid = false;
    try {
      valid = new URL(value).origin === value && value !== "null";
    } catch { /* Vérifié juste après. */ }
    if (!valid) throw new Error(`CORS : origine invalide : ${value}`);
  }
  if (!methods.length || methods.some((method) => !supported.includes(method))) {
    throw new Error("CORS : liste de méthodes invalide.");
  }
  if ([...allowHeaders, ...exposeHeaders].some((name) => !token.test(name) || name === "*")) {
    throw new Error("CORS : les en-têtes doivent être des noms explicites valides.");
  }
  if (maxAge !== undefined && (!Number.isSafeInteger(maxAge) || maxAge < 0)) {
    throw new Error("CORS : maxAge doit être un entier positif ou nul.");
  }
  return async (context, next) => {
    const request = context.request;
    const requestedOrigin = request.headers.get("origin");
    const requestedMethod = request.headers.get("access-control-request-method");
    const preflight = request.method === "OPTIONS" && requestedOrigin !== null &&
      requestedMethod !== null;
    const allowedOrigin = requestedOrigin !== null &&
      (wildcard || origins.includes(requestedOrigin));
    let response: Response;
    if (preflight) {
      const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
        .split(",").map((name) => name.trim()).filter(Boolean);
      const validHeaders = requestedHeaders.every((name) =>
        token.test(name) &&
        allowHeaders.some((allowed) => allowed.toLowerCase() === name.toLowerCase())
      );
      const allowed = allowedOrigin && methods.some((method) => method === requestedMethod) &&
        validHeaders;
      response = allowed
        ? new Response(null, { status: 204 })
        : context.json({ status: 403, message: "Preflight CORS refusé" }, { status: 403 });
    } else {
      response = await next();
    }
    // Une réponse native peut avoir des en-têtes immuables : on crée une enveloppe modifiable.
    const headers = new Headers(response.headers);
    for (
      const name of [
        "allow-origin",
        "allow-credentials",
        "allow-methods",
        "allow-headers",
        "expose-headers",
        "max-age",
      ]
    ) {
      headers.delete(`access-control-${name}`);
    }
    vary(headers, ["Origin"]);
    if (preflight) {
      vary(headers, ["Access-Control-Request-Method", "Access-Control-Request-Headers"]);
    }
    if (allowedOrigin) {
      headers.set("access-control-allow-origin", wildcard ? "*" : requestedOrigin!);
      if (credentials) headers.set("access-control-allow-credentials", "true");
      if (!preflight && exposeHeaders.length) {
        headers.set("access-control-expose-headers", exposeHeaders.join(", "));
      }
      if (preflight && response.status === 204) {
        headers.set("access-control-allow-methods", methods.join(", "));
        if (allowHeaders.length) {
          headers.set("access-control-allow-headers", allowHeaders.join(", "));
        }
        if (maxAge !== undefined) headers.set("access-control-max-age", String(maxAge));
      }
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
