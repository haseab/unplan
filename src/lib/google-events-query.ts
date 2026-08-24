export type GoogleEventsQueryOptions = {
  searchQuery?: string;
  timeMax: string | null;
  timeMin: string | null;
};

export const buildGoogleEventsQuery = ({
  searchQuery,
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
  return query;
};
