import Link from "next/link";
import styles from "./app-information-links.module.css";

export function AppInformationLinks() {
  return (
    <nav className={styles.links} aria-label="About Unplan and policies">
      <Link href="/about">About</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
    </nav>
  );
}
