import { Application, Controller, HttpError, type LogEntry, logger, type Route } from "../mod.ts";
import { equal } from "./assert.ts";

Deno.test("logger : une entrée par requête, durée et statuts des erreurs inclus", async () => {
  const entries: LogEntry[] = [];
  class Test extends Controller {
    readonly prefix = "";
    readonly routes: readonly Route[] = [
      { method: "GET", path: "/ok", handler: () => null },
      {
        method: "GET",
        path: "/bad",
        handler: () => {
          throw new HttpError(403, "Non");
        },
      },
    ];
  }
  const app = new Application().use(logger({
    write: (entry) => {
      entries.push(entry);
    },
  })).register(new Test());
  for (const path of ["ok?secret=hidden", "bad", "missing"]) {
    await app.fetch(new Request(`http://localhost/${path}`));
  }
  equal(entries.map((entry) => entry.status), [200, 403, 404]);
  equal(entries.map((entry) => entry.path), ["/ok", "/bad", "/missing"]);
  equal(
    entries.every((entry) =>
      entry.method === "GET" && Number.isFinite(entry.durationMs) && entry.durationMs >= 0
    ),
    true,
  );
});

Deno.test("logger : sortie console par défaut et réponse courte observée", async () => {
  const messages: unknown[][] = [];
  const original = console.info;
  console.info = (...args) => {
    messages.push(args);
  };
  try {
    const app = new Application().use(logger()).use((ctx) => ctx.text("ok", { status: 202 }));
    equal((await app.fetch(new Request("http://localhost/path?q=secret"))).status, 202);
    equal(messages.length, 1);
    const message = String(messages[0]?.[0]);
    equal(message.includes("GET /path → 202"), true);
    equal(message.includes("secret"), false);
  } finally {
    console.info = original;
  }
});
