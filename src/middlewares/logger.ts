import type { Middleware } from "../types.ts";

/** Les infos utiles d'un appel, sans corps ni query string dans les logs par défaut. */
export interface LogEntry {
  /** Méthode reçue. */
  readonly method: string;
  /** Chemin seul, sans les paramètres de recherche. */
  readonly path: string;
  /** Statut de la réponse observée. */
  readonly status: number;
  /** Durée du traitement en millisecondes, hors envoi du corps sur le réseau. */
  readonly durationMs: number;
}

/** Personnalisation de la sortie du logger. */
export interface LoggerOptions {
  /** Sortie synchrone ; console.info par défaut. Une exception devient une erreur middleware. */
  readonly write?: (entry: LogEntry) => void;
}

/**
 * Journalise après await next(), y compris pour les erreurs HTTP.
 * À enregistrer en premier pour observer toute la chaîne, CORS compris.
 */
export function logger(options: LoggerOptions = {}): Middleware {
  const write = options.write ?? ((entry: LogEntry) => {
    console.info(
      `[MFD] ${entry.method} ${entry.path} → ${entry.status} (${entry.durationMs.toFixed(2)} ms)`,
    );
  });
  return async (context, next) => {
    const start = performance.now();
    const response = await next();
    write({
      method: context.request.method,
      path: context.url.pathname,
      status: response.status,
      durationMs: performance.now() - start,
    });
    return response;
  };
}
