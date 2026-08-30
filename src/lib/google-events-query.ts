export type GoogleEventsQueryOptions = {
  pageToken?: string;
  searchQuery?: string;
  timeMax: string | null;
  timeMin: string | null;
};

export const buildGoogleEventsQuery = ({
  searchQuery,
  pageToken,
  timeMax,
  timeMin,
}: GoogleEventsQueryOptions) => {
  const query = new URLSearchParams({
    maxResults: "2500",
    orderBy: "startTime",
    showHiddenInvitations: "true",
    singleEvents: "true",
  });
  if (timeMax) query.set("timeMax", timeMax);
  if (timeMin) query.set("timeMin", timeMin);
  if (searchQuery) query.set("q", searchQuery);
  if (pageToken) query.set("pageToken", pageToken);
  return query;
};
