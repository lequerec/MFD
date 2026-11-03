import type { HandlerResult } from "./types.ts";

/** Garde les Response telles quelles ; le reste devient du JSON, sauf undefined. */
export function toResponse(result: HandlerResult): Response {
  if (result instanceof Response) return result;
  if (result === undefined) return new Response(null, { status: 204 });
  return Response.json(result);
}
