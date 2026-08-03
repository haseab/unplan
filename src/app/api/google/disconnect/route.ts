import { clearGoogleSession } from "@/lib/google-calendar";

export async function POST() {
  await clearGoogleSession();
  return Response.json({ ok: true });
}
