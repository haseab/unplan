"use client";

import * as React from "react";
import type { CalendarEvent } from "@/lib/calendar-types";
import {
  recurringDeleteCandidates,
  type RecurringDeleteScope,
} from "@/lib/recurring-delete";

export type RecurringDeleteRequest = {
  events: CalendarEvent[];
};

export function useRecurringDeleteConfirmation() {
  const [request, setRequest] = React.useState<RecurringDeleteRequest | null>(null);
  const resolverRef = React.useRef<
    ((scope: RecurringDeleteScope | null) => void) | null
  >(null);

  const finish = React.useCallback((scope: RecurringDeleteScope | null) => {
    resolverRef.current?.(scope);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const chooseRecurringDeleteScope = React.useCallback((events: CalendarEvent[]) => {
    const recurringEvents = recurringDeleteCandidates(events);
    if (!recurringEvents.length) {
      return Promise.resolve<RecurringDeleteScope | null>("single");
    }

    resolverRef.current?.(null);
    setRequest({ events: recurringEvents });
    return new Promise<RecurringDeleteScope | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  React.useEffect(() => () => resolverRef.current?.(null), []);

  return {
    cancelRecurringDelete: () => finish(null),
    chooseRecurringDeleteScope,
    chooseRecurringScope: finish,
    request,
  };
}
