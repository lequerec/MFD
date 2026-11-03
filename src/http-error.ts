/**
 * Une erreur HTTP attendue. Son message est envoyé au client : pas de secret ici !
 * Les autres erreurs deviennent une réponse 500 générique.
 */
export class HttpError extends Error {
  /** En-têtes à joindre à la réponse, par exemple Allow ou Retry-After. */
  readonly headers: Headers;

  /** Crée une erreur avec un statut compris entre 400 et 599. */
  constructor(
    /** Statut HTTP à envoyer. */
    readonly status: number,
    message: string,
    headers?: HeadersInit,
  ) {
    super(message);
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new RangeError("Une erreur HTTP doit avoir un statut entre 400 et 599.");
    }
    this.name = "HttpError";
    this.headers = new Headers(headers);
  }
}
