export class GoogleOAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 503,
    public readonly requiresReconnect = false,
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
};

type ProviderOptions = {
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
};

const safeErrorCodes = new Set([
  "invalid_grant", "invalid_client", "invalid_request", "unauthorized_client",
  "access_denied", "temporarily_unavailable", "server_error", "invalid_token",
]);

export const requestGoogleTokens = async (
  parameters: URLSearchParams,
  { fetcher = fetch, wait = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)) }: ProviderOptions = {},
): Promise<GoogleTokenResponse> => {
  const refreshing = parameters.get("grant_type") === "refresh_token";
  const attempts = refreshing ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: parameters,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      console.warn("[BUG:GOOGLE-RECONNECT] [GOOGLE:OAUTH] Token request interrupted", { attempt: attempt + 1, refreshing });
      if (attempt + 1 < attempts) {
        await wait(250 * 2 ** attempt);
        continue;
      }
      throw new GoogleOAuthError("network_error", "Google is temporarily unreachable. Your connection is saved; try again shortly.");
    }
    const data = await response.json().catch(() => null) as (Partial<GoogleTokenResponse> & { error?: string }) | null;
    if (response.ok && typeof data?.access_token === "string" && data.access_token) {
      return {
        access_token: data.access_token,
        expires_in: typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600,
        refresh_token: data.refresh_token,
        id_token: data.id_token,
        scope: data.scope,
      };
    }
    const code = safeErrorCodes.has(data?.error ?? "") ? data!.error! : "token_request_failed";
    console.warn("[BUG:GOOGLE-RECONNECT] [GOOGLE:OAUTH] Token request rejected", {
      attempt: attempt + 1, code, refreshing, status: response.status,
    });
    const transient = response.status === 429 || response.status >= 500 || response.status === 408
      || (response.ok && !data?.access_token);
    if (transient && attempt + 1 < attempts) {
      await wait(250 * 2 ** attempt);
      continue;
    }
    if (refreshing && code === "invalid_grant" && !transient) {
      throw new GoogleOAuthError("reconnect_required", "Google authorization expired or was revoked. Reconnect this account.", 401, true);
    }
    if (code === "invalid_client" || code === "unauthorized_client") {
      throw new GoogleOAuthError(code, "Google sign-in is temporarily misconfigured. Your connection is saved; please contact support.");
    }
    throw new GoogleOAuthError(code, transient
      ? "Google is temporarily unavailable. Your connection is saved; try again shortly."
      : "Google could not complete authorization. Please try connecting again.", transient ? 503 : 400);
  }
  throw new GoogleOAuthError("token_request_failed", "Google authorization could not be completed");
};
