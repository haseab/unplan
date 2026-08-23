"use client";

import { ChevronUp, Cloud, Plus, X } from "lucide-react";
import * as React from "react";
import type { GoogleConnectedAccount } from "@/lib/google-browser-auth";

type ConnectedAccountsMenuProps = {
  accounts: GoogleConnectedAccount[];
  onConnect: () => void;
  onDisconnect: (accountId: string) => void;
};

export function ConnectedAccountsMenu({
  accounts,
  onConnect,
  onDisconnect,
}: ConnectedAccountsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const activeAccountCount = accounts.filter(
    (account) => account.status === "active",
  ).length;

  React.useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="account-switcher" ref={rootRef}>
      {open && (
        <div className="account-switcher-menu" role="menu" aria-label="Google accounts">
          <div className="account-switcher-heading">Google accounts</div>
          {accounts.map((account) => (
            <div className="account-switcher-item" key={account.id} role="group">
              <span className="account-avatar" aria-hidden="true">
                {account.email.slice(0, 1).toUpperCase()}
              </span>
              <span className="account-switcher-copy">
                <strong>{account.email}</strong>
                <small>
                  {account.status === "active" ? "Connected" : "Needs reconnection"}
                </small>
              </span>
              {account.status !== "active" && (
                <button className="account-reconnect-button" onClick={onConnect} type="button">
                  Reconnect
                </button>
              )}
              <button
                className="account-disconnect-button"
                onClick={() => onDisconnect(account.id)}
                title={`Disconnect ${account.email}`}
                aria-label={`Disconnect ${account.email}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button className="account-add-button" onClick={onConnect} role="menuitem" type="button">
            <Plus size={14} />
            <span>Add another account</span>
          </button>
        </div>
      )}

      <button
        className="account-switcher-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="account-avatar account-switcher-avatar" aria-hidden="true">
          {accounts[0]?.email.slice(0, 1).toUpperCase()}
        </span>
        <span className="account-switcher-copy">
          <strong>
            {accounts.length === 1 ? accounts[0].email : `${accounts.length} Google accounts`}
          </strong>
          <small>
            {activeAccountCount === accounts.length
              ? "Connected"
              : `${activeAccountCount} of ${accounts.length} connected`}
          </small>
        </span>
        <Cloud size={15} />
        <ChevronUp className="account-switcher-chevron" size={14} />
      </button>
    </div>
  );
}
