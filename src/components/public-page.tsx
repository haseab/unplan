import Link from "next/link";
import type { ReactNode } from "react";
import { AppInformationLinks } from "./app-information-links";
import styles from "./public-page.module.css";

export function PublicPage({ title, introduction, children }: {
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/">unplan</Link>
        <Link className={styles.openApp} href="/">Open Unplan <span aria-hidden="true">↗</span></Link>
      </header>
      <main className={styles.content}>
        <p className={styles.eyebrow}>Calendar, refined</p>
        <h1>{title}</h1>
        <p className={styles.introduction}>{introduction}</p>
        {children}
      </main>
      <footer className={styles.footer}>
        <AppInformationLinks />
        <a href="mailto:hullah3000@gmail.com">Contact support</a>
      </footer>
    </div>
  );
}
