export const isTrustedGoogleMutation = (request: Request, appOrigin?: string) => {
  if (request.headers.get("x-requested-with") !== "XmlHttpRequest") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(appOrigin || request.url).origin;
  } catch {
    return false;
  }
};
