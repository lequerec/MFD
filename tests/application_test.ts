import { Application, type Context, Controller, HttpError, type Route } from "../mod.ts";
import example from "../examples/basic/main.ts";
import { equal, throws } from "./assert.ts";

function createApp(routes: readonly Route[], prefix = ""): Application {
  class TestController extends Controller {
    readonly prefix = prefix;
    readonly routes = routes;
  }
  return new Application().register(new TestController());
}

Deno.test("parcours complet : préfixe, paramètre, query et handler asynchrone", async () => {
  const app = createApp([
    {
      method: "GET",
      path: "/:id",
      handler: async (ctx) => {
        await Promise.resolve();
        return { id: ctx.params.id, search: ctx.query.get("q") };
      },
    },
  ], "/users/");
  const fetch = app.fetch;
  const response = await fetch(new Request("http://localhost/users/42/?q=deno"));
  equal(response.status, 200);
  equal(await response.json(), { id: "42", search: "deno" });
});

Deno.test("404, 405 et encodage invalide ont des réponses JSON cohérentes", async () => {
  const app = createApp([{ method: "GET", path: "/:id", handler: () => null }], "/users");
  const missing = await app.fetch(new Request("http://localhost/missing"));
  equal(missing.status, 404);
  equal(await missing.json(), { status: 404, message: "Route introuvable" });
  const method = await app.fetch(new Request("http://localhost/users/1", { method: "POST" }));
  equal(method.status, 405);
  equal(method.headers.get("allow"), "GET, HEAD");
  const bad = await app.fetch(new Request("http://localhost/users/%ZZ"));
  equal(bad.status, 400);
});

Deno.test("erreurs HTTP attendues, rejets async et erreurs de sérialisation", async () => {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => {
    errors.push(values);
  };
  try {
    const app = createApp([
      {
        method: "GET",
        path: "/expected",
        handler: () => {
          throw new HttpError(429, "Doucement !", { "retry-after": "10" });
        },
      },
      {
        method: "GET",
        path: "/unexpected",
        handler: () => Promise.reject(new Error("secret-interne")),
      },
      {
        method: "GET",
        path: "/circular",
        handler: () => {
          const value: Record<string, unknown> = {};
          value.self = value;
          return value;
        },
      },
    ]);
    const expected = await app.fetch(new Request("http://localhost/expected"));
    equal(expected.status, 429);
    equal(expected.headers.get("retry-after"), "10");
    equal(await expected.json(), { status: 429, message: "Doucement !" });
    for (const path of ["unexpected", "circular"]) {
      const response = await app.fetch(new Request(`http://localhost/${path}`));
      equal(response.status, 500);
      equal(await response.json(), { status: 500, message: "Erreur interne du serveur" });
    }
    equal(errors.length, 2);
  } finally {
    console.error = original;
  }
});

Deno.test("HEAD conserve statut et en-têtes sans renvoyer de corps, y compris les erreurs", async () => {
  const app = createApp([{
    method: "GET",
    path: "/",
    handler: (ctx) => ctx.text("salut", { headers: { "x-test": "ok" } }),
  }]);
  const response = await app.fetch(new Request("http://localhost/", { method: "HEAD" }));
  equal(response.status, 200);
  equal(response.headers.get("x-test"), "ok");
  equal(response.body, null);
  const missing = await app.fetch(new Request("http://localhost/missing", { method: "HEAD" }));
  equal(missing.status, 404);
  equal(missing.body, null);
});

Deno.test("chaque requête garde son propre contexte pendant les traitements concurrents", async () => {
  const contexts: Context[] = [];
  const app = createApp([{
    method: "GET",
    path: "/:id",
    handler: async (ctx) => {
      contexts.push(ctx);
      await Promise.resolve();
      return { id: ctx.params.id };
    },
  }]);
  const responses = await Promise.all(
    ["a", "b"].map((id) => app.fetch(new Request(`http://localhost/${id}`))),
  );
  equal(await Promise.all(responses.map((r) => r.json())), [{ id: "a" }, { id: "b" }]);
  if (contexts[0] === contexts[1]) throw new Error("Contexte partagé entre les requêtes");
});

Deno.test("une erreur de déclaration empêche l'enregistrement complet du controller", async () => {
  const app = createApp([{ method: "GET", path: "/existing", handler: () => null }]);
  class Invalid extends Controller {
    readonly prefix = "";
    readonly routes: readonly Route[] = [
      { method: "GET", path: "/new", handler: () => null },
      { method: "GET", path: "/existing", handler: () => null },
    ];
  }
  throws(() => app.register(new Invalid()));
  equal((await app.fetch(new Request("http://localhost/new"))).status, 404);
});

Deno.test("l'exemple liste, filtre, lit et valide les créations sans persister", async () => {
  const list = await example.fetch(new Request("http://localhost/users?name=ada"));
  equal(await list.json(), [{ id: "1", name: "Ada" }]);
  const found = await example.fetch(new Request("http://localhost/users/2"));
  equal(await found.json(), { id: "2", name: "Linus" });
  equal((await example.fetch(new Request("http://localhost/users/unknown"))).status, 404);
  for (const body of ["{", "null", "{}", '{"name":" "}']) {
    equal(
      (await example.fetch(new Request("http://localhost/users", { method: "POST", body }))).status,
      400,
    );
  }
  const created = await example.fetch(
    new Request("http://localhost/users", { method: "POST", body: '{"name":" Grace "}' }),
  );
  equal(created.status, 201);
  const user = await created.json();
  equal(user.name, "Grace");
  equal(typeof user.id, "string");
  equal((await example.fetch(new Request(`http://localhost/users/${user.id}`))).status, 404);
});
