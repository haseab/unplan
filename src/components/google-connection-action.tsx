"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { connectGoogleAccount } from "@/lib/google-browser-auth";
import { GoogleConnectButton } from "./google-connect-button";

export function GoogleConnectionAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      await connectGoogleAccount();
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Google connection failed. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div>
      <GoogleConnectButton onClick={() => void connect()} disabled={busy} />
      {busy && <p role="status">Finish connecting in the Google window.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
