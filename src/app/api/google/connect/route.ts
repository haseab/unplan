import {
  getGoogleRedirectUri,
  googleConfigured,
  googleCookieOptions,
} from "@/lib/google-calendar";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/?google=missing", request.url));
  }

  const state = crypto.randomUUID();
  const store = await cookies();
  store.set("unplan_google_state", state, googleCookieOptions(600));
  const redirectUri = getGoogleRedirectUri(request);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    scope: ["openid", "email", "https://www.googleapis.com/auth/calendar"].join(" "),
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
