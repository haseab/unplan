export type GoogleEventsQueryOptions = {
  searchQuery?: string;
  timeMax: string;
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
    timeMax,
  });
  if (timeMin) query.set("timeMin", timeMin);
  if (searchQuery) query.set("q", searchQuery);
  return query;
};
