import { HttpError, Router } from "../mod.ts";
import { equal, throws } from "./assert.ts";

Deno.test("routes statiques, paramètres décodés et slash final", () => {
  const dynamic = () => "dynamic";
  const fixed = () => "fixed";
  const router = new Router().add([
    { method: "GET", path: "/users/:id", handler: dynamic },
    { method: "GET", path: "/users/me", handler: fixed },
  ]);
  const match = router.resolve("GET", "/users/me/");
  equal(match.kind, "matched");
  if (match.kind !== "matched" || match.handler !== fixed) {
    throw new Error("Priorité statique perdue");
  }
  const parameter = router.resolve("GET", "/users/Andr%C3%A9");
  if (parameter.kind !== "matched") throw new Error("Route absente");
  equal(parameter.params.id, "André");
  equal(router.resolve("GET", "/users/a/b").kind, "not-found");
  equal(router.resolve("GET", "/users//").kind, "not-found");
});

Deno.test("la priorité est déterministe à chaque segment", () => {
  for (const reverse of [false, true]) {
    const routes = [
      { method: "GET" as const, path: "/:group/settings", handler: () => "dynamic" },
      { method: "GET" as const, path: "/users/:id", handler: () => "fixed-first" },
    ];
    const router = new Router().add(reverse ? routes.reverse() : routes);
    const match = router.resolve("GET", "/users/settings");
    if (match.kind !== "matched") throw new Error("Route absente");
    equal(match.handler({} as never), "fixed-first");
  }
});

Deno.test("405 sur le chemin précis, HEAD implicite et méthode HEAD explicite", () => {
  const router = new Router().add([
    { method: "POST", path: "/users/:id", handler: () => undefined },
    { method: "GET", path: "/users/me", handler: () => "get" },
  ]);
  equal(router.resolve("POST", "/users/me"), {
    kind: "method-not-allowed",
    allowed: ["GET", "HEAD"],
  });
  const head = router.resolve("HEAD", "/users/me");
  if (head.kind !== "matched") throw new Error("HEAD absent");
  equal(head.handler({} as never), "get");
  router.add([{ method: "HEAD", path: "/users/me", handler: () => "head" }]);
  const explicit = router.resolve("HEAD", "/users/me");
  if (explicit.kind !== "matched") throw new Error("HEAD explicite absent");
  equal(explicit.handler({} as never), "head");
});

Deno.test("enregistrement atomique, doublons structurels et chemins invalides", () => {
  const router = new Router().add([{ method: "GET", path: "/users/:id", handler: () => null }]);
  throws(() =>
    router.add([
      { method: "GET", path: "/valid", handler: () => null },
      { method: "GET", path: "/users/:name/", handler: () => null },
    ])
  );
  equal(router.resolve("GET", "/valid").kind, "not-found");
  for (const path of ["users", "/:id/:id", "/:", "/a//b", "/a?b", "/a#b", "/files/*"]) {
    throws(() => router.add([{ method: "GET", path, handler: () => null }]));
  }
});

Deno.test("un paramètre encodé ne change pas le nombre de segments", () => {
  const router = new Router().add([{ method: "GET", path: "/files/:name", handler: () => null }]);
  const match = router.resolve("GET", "/files/a%2Fb");
  if (match.kind !== "matched") throw new Error("Route absente");
  equal(match.params.name, "a/b");
  try {
    router.resolve("GET", "/files/%ZZ");
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) return;
    throw error;
  }
  throw new Error("Un chemin mal encodé doit échouer");
});
