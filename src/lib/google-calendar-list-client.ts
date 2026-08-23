import { MutationQueue } from "./mutation-queue";
import { googleCalendarAuthorizedFetch } from "./google-browser-auth";

type CalendarSelectionResponse = {
  error?: string | { message?: string };
  selected?: boolean;
};

const selectionQueue = new MutationQueue({
  concurrency: 4,
  maxAttempts: 1,
  maxRetryDelayMs: 0,
  minStartIntervalMs: 0,
  retryBaseDelayMs: 0,
  shouldRetry: () => false,
});

export const updateGoogleCalendarSelection = (
  calendarSourceId: string,
  selected: boolean,
) => selectionQueue.enqueue(calendarSourceId, async () => {
  const response = await googleCalendarAuthorizedFetch(calendarSourceId, "/api/google/calendars", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calendarSourceId, selected }),
  });
  const data = await response.json().catch(() => ({})) as CalendarSelectionResponse;
  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(message || "Calendar visibility could not be saved");
  }
  return data.selected ?? selected;
});
