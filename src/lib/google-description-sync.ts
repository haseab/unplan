import { compareNotes } from "./event-description-sync";

export type DescriptionSyncInput = { base: string; local: string; reviewOnly?: boolean; sendUpdates?: "all" | "none" };
type FetchEvent = (init?: RequestInit) => Promise<Response>;

/** The injected transport permits testing the complete conditional-write protocol. */
export async function syncGoogleDescription(input: DescriptionSyncInput, fetchEvent: FetchEvent): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await fetchEvent();
    if (current.status === 404 || current.status === 410) return Response.json({ deleted: true }, { status: 409 });
    if (!current.ok) return Response.json({ error: "Could not read Google notes" }, { status: current.status });
    const event = await current.json() as { description?: string; etag?: string; status?: string };
    if (event.status === "cancelled") return Response.json({ deleted: true }, { status: 409 });
    const remote = event.description ?? "";
    if (input.reviewOnly) return Response.json({ description: remote });
    const comparison = compareNotes(input.base, input.local, remote);
    if (comparison === "synced") return Response.json({ description: remote });
    if (comparison === "conflict") return Response.json({ description: remote }, { status: 409 });
    if (!event.etag) return Response.json({ error: "Google did not provide an event version; notes retained." }, { status: 503 });
    const updated = await fetchEvent({ method: "PATCH", headers: { "If-Match": event.etag }, body: JSON.stringify({ description: input.local }) });
    if (updated.status === 412) continue;
    if (updated.status === 404 || updated.status === 410) return Response.json({ deleted: true }, { status: 409 });
    if (!updated.ok) return Response.json({ error: `Google rejected the notes (${updated.status}). Your draft is retained.` }, { status: updated.status });
    const result = await updated.json() as { description?: string };
    return Response.json({ description: result.description ?? "" });
  }
  return Response.json({ error: "The event keeps changing. Notes are saved locally; retry shortly." }, { status: 503 });
}
