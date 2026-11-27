export const dynamic = "force-dynamic";
export function GET() {
  if (process.env.NODE_ENV !== "development" || !process.env.DEV_SESSION_ID) {
    return new Response(null, { status: 404 });
  }
  return Response.json({ session: process.env.DEV_SESSION_ID }, {
    headers: { "x-dev-session-id": process.env.DEV_SESSION_ID, "cache-control": "no-store" },
  });
}
