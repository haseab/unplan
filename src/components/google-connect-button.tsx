"use client";

import styles from "./google-connect-button.module.css";

export function GoogleConnectButton({ onClick, disabled = false }: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={styles.button} type="button" onClick={onClick} disabled={disabled} aria-label="Sign in with Google">
      {/* Unmodified light/pill @2x PNG: https://developers.google.com/static/identity/images/signin-assets.zip */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/google-signin-light.png" width="180" height="40" alt="" />
    </button>
  );
}
