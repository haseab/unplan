import {
  getAppOrigin,
  getGoogleRedirectUri,
  googleCookieOptions,
  saveGoogleTokens,
} from "@/lib/google-calendar";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const store = await cookies();
  const savedState = store.get("unplan_google_state")?.value;
  store.delete("unplan_google_state");
  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/?google=denied", getAppOrigin(request)));
  }

  const redirectUri = getGoogleRedirectUri(request);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokens = (await tokenResponse.json()) as TokenResponse;
  if (!tokenResponse.ok || !tokens.access_token) {
    return NextResponse.redirect(new URL("/?google=error", getAppOrigin(request)));
  }

  await saveGoogleTokens(tokens);
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (profileResponse.ok) {
    const profile = (await profileResponse.json()) as { email?: string };
    if (profile.email) {
      store.set("unplan_google_email", profile.email, googleCookieOptions(60 * 60 * 24 * 90));
    }
  }
  return NextResponse.redirect(new URL("/?google=connected", getAppOrigin(request)));
}
