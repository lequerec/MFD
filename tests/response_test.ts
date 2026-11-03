import { Context, HttpError } from "../mod.ts";
import { toResponse } from "../src/response.ts";
import { equal, throws } from "./assert.ts";

Deno.test("les résultats deviennent du JSON, y compris les chaînes et null", async () => {
  for (const value of [{ ok: true }, [1, 2], "salut", 42, false, null]) {
    const response = toResponse(value);
    equal(response.status, 200);
    equal(await response.json(), value);
  }
  const empty = toResponse(undefined);
  equal(empty.status, 204);
  equal(empty.body, null);
  const custom = new Response("salut", { status: 202, headers: { "x-test": "ok" } });
  if (toResponse(custom) !== custom) throw new Error("La Response doit rester intacte");
});

Deno.test("Context expose la query, les paramètres et les helpers", async () => {
  const request = new Request("http://localhost/users/1?tag=a&tag=b");
  const context = new Context(request, { id: "1" });
  equal(context.params.id, "1");
  equal(Object.isFrozen(context.params), true);
  equal(context.query.getAll("tag"), ["a", "b"]);
  equal(context.url.pathname, "/users/1");
  const json = context.json({ created: true }, { status: 201, headers: { "x-test": "ok" } });
  equal(json.status, 201);
  equal(json.headers.get("x-test"), "ok");
  equal(await json.json(), { created: true });
  const text = context.text("salut");
  equal(text.headers.get("content-type"), "text/plain; charset=utf-8");
  equal(await text.text(), "salut");
});

Deno.test("HttpError accepte uniquement des statuts d'erreur HTTP", () => {
  for (const status of [200, 399, 600, 400.5, NaN]) throws(() => new HttpError(status, "non"));
  equal(new HttpError(422, "invalide").status, 422);
});
