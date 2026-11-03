import { Application, cors, type CorsOptions, logger } from "../mod.ts";
import { equal, throws } from "./assert.ts";

function request(origin?: string, method = "GET", extra: Record<string, string> = {}): Request {
  const headers = new Headers(extra);
  if (origin !== undefined) headers.set("origin", origin);
  return new Request("http://localhost/resource", { method, headers });
}

function configured(options: CorsOptions = {}): Application {
  return new Application().use(cors(options)).use((ctx) =>
    ctx.json({ ok: true }, {
      headers: { vary: "Accept-Encoding", "x-custom": "kept" },
    })
  );
}

Deno.test("CORS : origine exacte, liste, wildcard, requête sans Origin et refus", async () => {
  for (const origin of ["https://client.test", ["https://other.test", "https://client.test"]]) {
    const app = configured({ origin });
    const accepted = await app.fetch(request("https://client.test"));
    equal(accepted.headers.get("access-control-allow-origin"), "https://client.test");
    equal(accepted.headers.get("vary"), "Accept-Encoding, Origin");
    equal(accepted.headers.get("x-custom"), "kept");
    equal(await accepted.json(), { ok: true });
    const denied = await app.fetch(request("https://client.test.evil.test"));
    equal(denied.status, 200);
    equal(denied.headers.get("access-control-allow-origin"), null);
    const absent = await app.fetch(request());
    equal(absent.headers.get("access-control-allow-origin"), null);
    equal(absent.headers.get("vary"), "Accept-Encoding, Origin");
  }
  equal(
    (await configured().fetch(request("https://any.test"))).headers.get(
      "access-control-allow-origin",
    ),
    "*",
  );
  equal(
    (await configured({ origin: [] }).fetch(request("https://any.test"))).headers.get(
      "access-control-allow-origin",
    ),
    null,
  );
});

Deno.test("CORS : preflight valide sans route ni appel du handler, observé par logger", async () => {
  let called = false;
  const statuses: number[] = [];
  const app = new Application()
    .use(logger({
      write: (entry) => {
        statuses.push(entry.status);
      },
    }))
    .use(
      cors({
        origin: "https://client.test",
        credentials: true,
        methods: ["POST"],
        allowHeaders: ["Content-Type", "Authorization"],
        maxAge: 600,
      }),
    )
    .use(() => {
      called = true;
      return new Response();
    });
  const response = await app.fetch(request("https://client.test", "OPTIONS", {
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type, AUTHORIZATION",
  }));
  equal(response.status, 204);
  equal(response.body, null);
  equal(response.headers.get("access-control-allow-origin"), "https://client.test");
  equal(response.headers.get("access-control-allow-credentials"), "true");
  equal(response.headers.get("access-control-allow-methods"), "POST");
  equal(response.headers.get("access-control-allow-headers"), "Content-Type, Authorization");
  equal(response.headers.get("access-control-max-age"), "600");
  equal(
    response.headers.get("vary"),
    "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  );
  equal(called, false);
  equal(statuses, [204]);
});

Deno.test("CORS : refuse origine, méthode ou en-tête de preflight non autorisé", async () => {
  const app = configured({ origin: "https://client.test", methods: ["POST"] });
  for (
    const [origin, method, headers] of [
      ["https://evil.test", "POST", "Content-Type"],
      ["https://client.test", "DELETE", "Content-Type"],
      ["https://client.test", "POST", "X-Secret"],
      ["https://client.test", "post", "Content-Type"],
      ["https://client.test", "POST", "invalid header"],
    ]
  ) {
    const response = await app.fetch(request(origin, "OPTIONS", {
      "access-control-request-method": method!,
      "access-control-request-headers": headers!,
    }));
    equal(response.status, 403);
    equal(await response.json(), { status: 403, message: "Preflight CORS refusé" });
    equal(response.headers.get("access-control-allow-methods"), null);
    equal(
      response.headers.get("access-control-allow-origin"),
      origin === "https://client.test" ? origin : null,
    );
  }
});

Deno.test("CORS : OPTIONS ordinaire continue, les valeurs par défaut sont utilisables", async () => {
  const app = configured();
  equal((await app.fetch(request(undefined, "OPTIONS"))).status, 200);
  equal((await app.fetch(request("https://client.test", "OPTIONS"))).status, 200);
  const response = await app.fetch(request("https://client.test", "OPTIONS", {
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type",
  }));
  equal(response.status, 204);
  equal(response.headers.get("access-control-allow-credentials"), null);
  equal(response.headers.get("access-control-max-age"), null);
});

Deno.test("CORS : credentials, en-têtes exposés et options figées à la création", async () => {
  const origins = ["https://client.test"];
  const allowHeaders = ["Content-Type"];
  const methods: ("GET" | "POST")[] = ["GET"];
  const app = configured({
    origin: origins,
    credentials: true,
    exposeHeaders: ["X-Total"],
    allowHeaders,
    methods,
    maxAge: 0,
  });
  origins.push("https://evil.test");
  allowHeaders.push("X-Secret");
  methods.push("POST");
  const response = await app.fetch(request("https://client.test"));
  equal(response.headers.get("access-control-allow-credentials"), "true");
  equal(response.headers.get("access-control-expose-headers"), "X-Total");
  equal(
    (await app.fetch(request("https://evil.test"))).headers.get("access-control-allow-origin"),
    null,
  );
  equal(
    (await app.fetch(
      request("https://client.test", "OPTIONS", { "access-control-request-method": "POST" }),
    )).status,
    403,
  );
  equal(
    (await app.fetch(
      request("https://client.test", "OPTIONS", {
        "access-control-request-method": "GET",
        "access-control-request-headers": "X-Secret",
      }),
    )).status,
    403,
  );
  const preflight = await app.fetch(
    request("https://client.test", "OPTIONS", { "access-control-request-method": "GET" }),
  );
  equal(preflight.headers.get("access-control-max-age"), "0");
});

Deno.test("CORS : erreurs 404 et 500, HEAD, corps et en-têtes immuables", async () => {
  const app = new Application().use(cors());
  const missing = await app.fetch(request("https://client.test"));
  equal(missing.status, 404);
  equal(missing.headers.get("access-control-allow-origin"), "*");
  const original = console.error;
  console.error = () => {};
  try {
    app.use(() => Promise.reject(new Error("secret")));
    const failed = await app.fetch(request("https://client.test"));
    equal(failed.status, 500);
    equal(failed.headers.get("access-control-allow-origin"), "*");
    equal(await failed.json(), { status: 500, message: "Erreur interne du serveur" });
  } finally {
    console.error = original;
  }
  const redirect = new Application().use(cors()).use(() =>
    Response.redirect("https://target.test")
  );
  const response = await redirect.fetch(request("https://client.test"));
  equal(response.status, 302);
  equal(response.headers.get("location"), "https://target.test/");
  equal(response.headers.get("access-control-allow-origin"), "*");
  const head = await configured().fetch(request("https://client.test", "HEAD"));
  equal(head.body, null);
  equal(head.headers.get("access-control-allow-origin"), "*");
});

Deno.test("CORS : Vary dédupliqué ou *, et la politique remplace les anciens en-têtes CORS", async () => {
  for (const value of ["origin, Accept-Encoding", "*"]) {
    const app = new Application().use(cors({ origin: "https://client.test" })).use(() =>
      new Response("ok", {
        headers: {
          vary: value,
          "access-control-allow-origin": "*",
          "access-control-allow-credentials": "true",
        },
      })
    );
    const denied = await app.fetch(request("https://evil.test"));
    equal(denied.headers.get("vary"), value);
    equal(denied.headers.get("access-control-allow-origin"), null);
    equal(denied.headers.get("access-control-allow-credentials"), null);
    const allowed = await app.fetch(request("https://client.test"));
    equal(allowed.headers.get("vary"), value);
    equal(allowed.headers.get("access-control-allow-origin"), "https://client.test");
  }
});

Deno.test("CORS : rejette les options invalides dès la création", () => {
  for (
    const options of [
      { credentials: true },
      { origin: ["*"] },
      { origin: "https://client.test/" },
      { origin: "https://client.test/path" },
      { origin: "null" },
      { origin: "pas-une-url" },
      { maxAge: -1 },
      { maxAge: 0.5 },
      { maxAge: Infinity },
      { methods: [] },
      { methods: ["INVALID"] },
      { allowHeaders: ["*"] },
      { exposeHeaders: ["bad\nheader"] },
    ]
  ) throws(() => cors(options as CorsOptions));
});
