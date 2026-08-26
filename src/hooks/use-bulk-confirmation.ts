"use client";

import * as React from "react";

export const BULK_CONFIRMATION_THRESHOLD = 3;
export const TASK_DELETE_CONFIRMATION_THRESHOLD = 4;

export type BulkConfirmationRequest = {
  action: "create" | "delete" | "move" | "update";
  count: number;
  subject?: "events" | "tasks";
  threshold?: number;
};

export const requiresBulkConfirmation = ({
  count,
  threshold = BULK_CONFIRMATION_THRESHOLD,
}: Pick<BulkConfirmationRequest, "count" | "threshold">) => count >= threshold;

export function useBulkConfirmation() {
  const [request, setRequest] = React.useState<BulkConfirmationRequest | null>(null);
  const resolverRef = React.useRef<((confirmed: boolean) => void) | null>(null);

  const finish = React.useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const confirmBulkAction = React.useCallback(
    (nextRequest: BulkConfirmationRequest) => {
      if (!requiresBulkConfirmation(nextRequest)) {
        return Promise.resolve(true);
      }

      resolverRef.current?.(false);
      setRequest(nextRequest);
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [],
  );

  React.useEffect(() => () => resolverRef.current?.(false), []);

  return {
    cancelBulkAction: () => finish(false),
    confirmBulkAction,
    confirmPendingBulkAction: () => finish(true),
    request,
  };
}
