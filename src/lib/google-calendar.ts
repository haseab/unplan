import "server-only";

const GOOGLE_API_ROOT = "https://www.googleapis.com/calendar/v3";

const bearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  return authorization.slice(7).trim() || null;
};

export const hasGoogleAuthorization = (request: Request) =>
  Boolean(bearerToken(request));

export const googleFetch = async (
  request: Request,
  path: string,
  init: RequestInit = {},
) => {
  const accessToken = bearerToken(request);
  if (!accessToken) {
    return Response.json({ error: "Google authorization is required" }, { status: 401 });
  }

  return fetch(`${GOOGLE_API_ROOT}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
};
