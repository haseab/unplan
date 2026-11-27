export async function readJsonResponse<Result>(
  response: Response,
  fallbackMessage: string,
): Promise<Result> {
  const text = await response.text();
  if (!text) {
    throw new Error(
      response.ok
        ? fallbackMessage
        : `${fallbackMessage} (${response.status} ${response.statusText || "HTTP error"})`,
    );
  }

  try {
    return JSON.parse(text) as Result;
  } catch {
    throw new Error(
      response.ok
        ? fallbackMessage
        : `${fallbackMessage} (${response.status} ${response.statusText || "invalid response"})`,
    );
  }
}
