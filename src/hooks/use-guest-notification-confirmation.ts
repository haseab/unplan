"use client";

import * as React from "react";
import type { CalendarEvent, GoogleSendUpdates } from "@/lib/calendar-types";
import {
  guestNotificationTarget,
  type GuestNotificationAction,
  type GuestNotificationTarget,
} from "@/lib/event-guest-notifications";

export type GuestNotificationRequest = GuestNotificationTarget & {
  action: GuestNotificationAction;
};

export function useGuestNotificationConfirmation() {
  const [request, setRequest] = React.useState<GuestNotificationRequest | null>(null);
  const resolverRef = React.useRef<
    ((choice: GoogleSendUpdates | null) => void) | null
  >(null);

  const finish = React.useCallback((choice: GoogleSendUpdates | null) => {
    resolverRef.current?.(choice);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const chooseGuestNotifications = React.useCallback(
    (action: GuestNotificationAction, events: CalendarEvent[]) => {
      const target = guestNotificationTarget(events);
      if (!target) return Promise.resolve<GoogleSendUpdates | null>("none");

      resolverRef.current?.(null);
      setRequest({ action, ...target });
      return new Promise<GoogleSendUpdates | null>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [],
  );

  React.useEffect(() => () => resolverRef.current?.(null), []);

  return {
    cancelGuestNotification: () => finish(null),
    chooseGuestNotifications,
    chooseSendUpdates: finish,
    request,
  };
}
