import { HttpError } from "./http-error.ts";
import type { HttpMethod, Route, RouteMatch } from "./types.ts";

const methods = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

type Segment = { kind: "static" | "param"; value: string };
type Entry = Route & { segments: Segment[]; shape: string };

/** Normalise les slashs aux extrémités sans toucher aux slashs internes. */
export function normalizePath(path: string): string {
  if (path !== "" && !path.startsWith("/")) throw new Error("Un chemin doit commencer par /.");
  if (/[?#]/.test(path) || path.includes("//")) throw new Error(`Chemin invalide : ${path}`);
  return path.replace(/\/+$/, "") || "/";
}

function compile(route: Route): Entry {
  if (!methods.has(route.method)) throw new Error(`Méthode HTTP invalide : ${route.method}`);
  if (typeof route.handler !== "function") throw new Error("La route doit avoir un handler.");
  const path = normalizePath(route.path);
  const names = new Set<string>();
  const segments: Segment[] = path === "/" ? [] : path.slice(1).split("/").map((value) => {
    if (value.startsWith(":")) {
      const name = value.slice(1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || names.has(name)) {
        throw new Error(`Paramètre invalide ou répété : ${value}`);
      }
      names.add(name);
      return { kind: "param", value: name };
    }
    if (/[:*]/.test(value)) throw new Error(`Segment non pris en charge : ${value}`);
    return { kind: "static", value: decodeURIComponent(value) };
  });
  return {
    ...route,
    path,
    segments,
    shape: JSON.stringify(segments.map((s) => s.kind === "param" ? null : s.value)),
  };
}

/**
 * Cherche d'abord le chemin le plus précis, puis la méthode.
 * Un segment fixe passe avant un paramètre, quel que soit l'ordre d'enregistrement.
 */
export class Router {
  private entries: Entry[] = [];

  /**
   * Ajoute un lot de routes. En cas de doublon ou de chemin invalide, rien n'est ajouté.
   * /users/:id et /users/:name sont un doublon pour une même méthode.
   */
  add(routes: readonly Route[]): this {
    const pending = routes.map(compile);
    const keys = new Set(this.entries.map((r) => `${r.method} ${r.shape}`));
    for (const route of pending) {
      const key = `${route.method} ${route.shape}`;
      if (keys.has(key)) throw new Error(`Route déjà enregistrée : ${route.method} ${route.path}`);
      keys.add(key);
    }
    this.entries.push(...pending);
    this.entries.sort((a, b) => {
      if (a.segments.length !== b.segments.length) return a.segments.length - b.segments.length;
      for (let i = 0; i < Math.min(a.segments.length, b.segments.length); i++) {
        const difference = Number(b.segments[i]?.kind === "static") -
          Number(a.segments[i]?.kind === "static");
        if (difference) return difference;
      }
      return 0;
    });
    return this;
  }

  /** Résout un pathname. Un encodage URI cassé produit une HttpError 400. */
  resolve(method: string, pathname: string): RouteMatch {
    if (pathname.includes("//")) return { kind: "not-found" };
    let parts: string[];
    try {
      const path = pathname.replace(/\/+$/, "") || "/";
      parts = path === "/" ? [] : path.slice(1).split("/").map(decodeURIComponent);
    } catch {
      throw new HttpError(400, "Chemin mal encodé");
    }
    const candidates = this.entries.filter((entry) =>
      entry.segments.length === parts.length &&
      entry.segments.every((segment, i) =>
        segment.kind === "param" ? parts[i] !== "" : segment.value === parts[i]
      )
    );
    const first = candidates[0];
    if (!first) return { kind: "not-found" };
    // Une route statique réserve son chemin, même si la méthode ne correspond pas.
    const samePath = candidates.filter((entry) => entry.shape === first.shape);
    const entry = samePath.find((r) => r.method === method) ??
      (method === "HEAD" ? samePath.find((r) => r.method === "GET") : undefined);
    if (!entry) {
      const allowed = new Set(samePath.map((r) => r.method));
      if (allowed.has("GET")) allowed.add("HEAD");
      return { kind: "method-not-allowed", allowed: [...allowed].sort() };
    }
    const params: Record<string, string> = Object.create(null);
    entry.segments.forEach((segment, i) => {
      if (segment.kind === "param") params[segment.value] = parts[i]!;
    });
    return { kind: "matched", handler: entry.handler, params: Object.freeze(params) };
  }
}
