const PREFIX = "google|";

export type GoogleCalendarIdentity = {
  accountId: string;
  providerCalendarId: string;
};

export const createGoogleCalendarSourceId = (
  accountId: string,
  providerCalendarId: string,
) => `${PREFIX}${encodeURIComponent(accountId)}|${encodeURIComponent(providerCalendarId)}`;

export const parseGoogleCalendarSourceId = (
  sourceId: string,
): GoogleCalendarIdentity | null => {
  if (!sourceId.startsWith(PREFIX)) return null;
  const parts = sourceId.slice(PREFIX.length).split("|");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    return {
      accountId: decodeURIComponent(parts[0]),
      providerCalendarId: decodeURIComponent(parts[1]),
    };
  } catch {
    return null;
  }
};
