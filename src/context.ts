/** Les infos d'une requête, au même endroit. Une nouvelle instance à chaque appel. */
export class Context {
  /** URL complète, pratique pour lire autre chose que la query string. */
  readonly url: URL;
  /** Paramètres de chemin décodés, comme id dans /users/:id. */
  readonly params: Readonly<Record<string, string>>;

  /** Construit le contexte sans lire le corps de la requête. */
  constructor(
    /** Requête native : le corps reste accessible avec request.json(), text(), etc. */
    readonly request: Request,
    params: Readonly<Record<string, string>> = {},
  ) {
    this.url = new URL(request.url);
    this.params = Object.freeze({ ...params });
  }

  /** Query string native ; getAll() permet de garder les valeurs répétées. */
  get query(): URLSearchParams {
    return this.url.searchParams;
  }

  /** Renvoie du JSON avec, si besoin, un statut et des en-têtes personnalisés. */
  json(data: unknown, init: ResponseInit = {}): Response {
    return Response.json(data, init);
  }

  /** Renvoie du texte brut en UTF-8. */
  text(value: string, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8");
    return new Response(value, { ...init, headers });
  }
}
