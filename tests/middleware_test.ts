import { Application, Controller, HttpError, type Middleware, type Route } from "../mod.ts";
import { equal, throws } from "./assert.ts";

function appWith(handler: Route["handler"] = () => ({ ok: true })): Application {
  class TestController extends Controller {
    readonly prefix = "";
    readonly routes: readonly Route[] = [{ method: "GET", path: "/:id", handler }];
  }
  return new Application().register(new TestController());
}

Deno.test("middlewares : ordre aller-retour, même contexte et réponse modifiable", async () => {
  const order: string[] = [];
  let contextSeen: unknown;
  const app = appWith((ctx) => {
    equal(ctx === contextSeen, true);
    order.push("handler");
    return { id: ctx.params.id };
  });
  app.use(async (ctx, next) => {
    contextSeen = ctx;
    equal(ctx.params.id, "42");
    order.push("a:before");
    const response = await next();
    order.push("a:after");
    response.headers.set("x-test", "ok");
    return response;
  }).use(async (_ctx, next) => {
    order.push("b:before");
    await Promise.resolve();
    const response = await next();
    order.push("b:after");
    return response;
  });
  const response = await app.fetch(new Request("http://localhost/42"));
  equal(order, ["a:before", "b:before", "handler", "b:after", "a:after"]);
  equal(await response.json(), { id: "42" });
  equal(response.headers.get("x-test"), "ok");
});

Deno.test("un middleware peut répondre sans exécuter la suite, même sans route", async () => {
  const app = new Application().use((ctx) => ctx.json({ blocked: true }, { status: 401 }));
  app.use(() => {
    throw new Error("Ne doit jamais être appelé");
  });
  const response = await app.fetch(new Request("http://localhost/missing"));
  equal(response.status, 401);
  equal(await response.json(), { blocked: true });
});

Deno.test("les middlewares extérieurs reçoivent les erreurs HTTP et de routage", async () => {
  const app = appWith(() => {
    throw new HttpError(422, "Invalide");
  });
  app.use(async (_ctx, next) => {
    const response = await next();
    response.headers.set("x-observed-status", String(response.status));
    return response;
  });
  for (
    const [path, method, expected] of [["/x", "GET", 422], ["/x", "POST", 405], [
      "/x/y",
      "GET",
      404,
    ], ["/%ZZ", "GET", 400]] as const
  ) {
    const response = await app.fetch(new Request(`http://localhost${path}`, { method }));
    equal(response.status, expected);
    equal(response.headers.get("x-observed-status"), String(expected));
  }
});

Deno.test("erreurs middleware synchrones, asynchrones et double next deviennent des réponses", async () => {
  const failures: Middleware[] = [
    () => {
      throw new Error("secret");
    },
    () => Promise.reject(new Error("secret async")),
    async (_ctx, next) => {
      await next();
      return next();
    },
    async (_ctx, next) => {
      await Promise.all([next(), next()]);
      return new Response();
    },
    (() => undefined) as unknown as Middleware,
  ];
  const original = console.error;
  const errors: unknown[] = [];
  console.error = (...args) => {
    errors.push(args);
  };
  try {
    for (const middleware of failures) {
      let calls = 0;
      const app = appWith(() => {
        calls++;
        return null;
      });
      app.use(async (_ctx, next) => {
        const response = await next();
        equal(response.status, 500);
        response.headers.set("x-error", "observed");
        return response;
      }).use(middleware);
      const response = await app.fetch(new Request("http://localhost/x"));
      equal(response.status, 500);
      equal(response.headers.get("x-error"), "observed");
      equal(await response.json(), { status: 500, message: "Erreur interne du serveur" });
      equal(calls <= 1, true);
    }
    equal(errors.length, failures.length);
  } finally {
    console.error = original;
  }
});

Deno.test("une HttpError middleware conserve son statut et HEAD retire aussi son corps", async () => {
  const app = new Application().use(() => {
    throw new HttpError(401, "Connexion requise", { "www-authenticate": "Bearer" });
  });
  const response = await app.fetch(new Request("http://localhost/", { method: "HEAD" }));
  equal(response.status, 401);
  equal(response.headers.get("www-authenticate"), "Bearer");
  equal(response.body, null);
});

Deno.test("chaîne isolée par requête et enregistrement sans effet sur un appel en cours", async () => {
  const seen: string[] = [];
  let resume!: () => void;
  const wait = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const app = appWith((ctx) => ({ id: ctx.params.id }));
  app.use(async (ctx, next) => {
    seen.push(ctx.params.id!);
    await wait;
    return next();
  });
  const pending = app.fetch(new Request("http://localhost/a"));
  app.use((ctx) => ctx.text("nouveau middleware"));
  resume();
  equal(await (await pending).json(), { id: "a" });
  equal(await (await app.fetch(new Request("http://localhost/b"))).text(), "nouveau middleware");
  equal(seen, ["a", "b"]);
  const responses = await Promise.all(
    ["c", "d"].map((id) => app.fetch(new Request(`http://localhost/${id}`))),
  );
  equal(responses.map((r) => r.status), [200, 200]);
  throws(() => app.use(null as unknown as Middleware));
});
