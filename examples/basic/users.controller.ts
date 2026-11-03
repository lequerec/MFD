import { Context, Controller, HttpError, type Route } from "../../mod.ts";

/** Une petite ressource users pour faire le tour du propriétaire. */
export class UsersController extends Controller {
  readonly prefix = "/users";

  private readonly users = [{ id: "1", name: "Ada" }, { id: "2", name: "Linus" }];

  // Les fonctions fléchées conservent this quand le routeur les appelle.
  private list = (context: Context): Response => {
    const search = context.query.get("name")?.toLowerCase();
    return context.json(
      this.users.filter((user) => !search || user.name.toLowerCase().includes(search)),
    );
  };

  private find = (context: Context): Response => {
    const user = this.users.find((user) => user.id === context.params.id);
    if (!user) throw new HttpError(404, "Cet utilisateur n'existe pas");
    return context.json(user);
  };

  private create = async (context: Context): Promise<Response> => {
    let body: unknown;
    try {
      body = await context.request.json();
    } catch {
      throw new HttpError(400, "Le corps doit contenir du JSON valide");
    }
    if (
      typeof body !== "object" || body === null || !("name" in body) ||
      typeof body.name !== "string" || !body.name.trim()
    ) {
      throw new HttpError(400, "Un nom non vide est nécessaire");
    }
    // Démo uniquement : aucune donnée n'est sauvegardée.
    return context.json({ id: crypto.randomUUID(), name: body.name.trim() }, { status: 201 });
  };

  readonly routes: readonly Route[] = [
    { method: "GET", path: "/", handler: this.list },
    { method: "GET", path: "/:id", handler: this.find },
    { method: "POST", path: "/", handler: this.create },
  ];
}
