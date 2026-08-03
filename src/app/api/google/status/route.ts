import { googleConfigured, hasGoogleSession } from "@/lib/google-calendar";
import { cookies } from "next/headers";

export async function GET() {
  const store = await cookies();
  return Response.json({
    configured: googleConfigured(),
    connected: await hasGoogleSession(),
    email: store.get("unplan_google_email")?.value ?? null,
  });
}
