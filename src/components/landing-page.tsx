import Link from "next/link";
import { ArrowDown, ArrowUpRight, Command, MoveRight } from "lucide-react";
import { AppInformationLinks } from "./app-information-links";
import { GoogleConnectionAction } from "./google-connection-action";
import styles from "./landing-page.module.css";

function CalendarPreview() {
  return (
    <div className={styles.preview} aria-label="Sample calendar preview">
      <div className={styles.previewToolbar}><span>unplan</span><span>YOUR WEEK, AT A GLANCE</span><Command size={15} /></div>
      <div className={styles.previewCalendar}>
        <div className={styles.timeColumn}>{["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM"].map(time => <span key={time}>{time}</span>)}</div>
        <div className={styles.day}><div className={styles.dayHeading}>MON <strong>03</strong></div><div className={`${styles.event} ${styles.blueEvent}`}><span>09:00 — 10:30</span><strong>Make something good</strong><small>Room to focus</small></div><div className={`${styles.event} ${styles.lunchEvent}`}><span>12:00 — 13:00</span><strong>A proper lunch</strong></div></div>
        <div className={styles.day}><div className={styles.dayHeading}>TUE <strong>04</strong></div><div className={`${styles.event} ${styles.greenEvent}`}><span>10:00 — 11:00</span><strong>Walk &amp; think</strong><small>A little perspective</small></div><div className={`${styles.event} ${styles.purpleEvent}`}><span>13:00 — 14:30</span><strong>Build, uninterrupted</strong></div></div>
        <div className={styles.day}><div className={styles.dayHeading}>WED <strong>05</strong></div><div className={`${styles.event} ${styles.orangeEvent}`}><span>09:30 — 10:30</span><strong>Bring ideas together</strong><small>From notes to next steps</small></div><div className={styles.openSpace}><span>↗</span> A little breathing room.</div></div>
      </div>
      <div className={styles.previewFooter}><span><kbd>⌘ K</kbd> Find anything</span><span>Less friction. More flow.</span></div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="Unplan home"><span className={styles.mark} aria-hidden="true" />unplan</Link>
        <nav aria-label="Main navigation"><Link href="/about">About</Link><Link href="/demo">Try the demo <ArrowUpRight size={14} /></Link></nav>
      </header>
      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span /> YOUR TIME. A LITTLE CLEARER.</p>
            <h1 id="hero-title">Make room<br />for <em>your day.</em></h1>
            <p className={styles.introduction}>A calmer home for your calendars, notes, and next steps. Plan at the speed you think.</p>
            <div className={styles.actions}><GoogleConnectionAction /><Link href="/demo" className={styles.demoLink}>Explore the demo <MoveRight size={17} /></Link></div>
            <p className={styles.consentNote}>Connect Google Calendar to view and edit your events and sync calendar visibility. You choose what to connect.</p>
            <p className={styles.policyLinks}><Link href="/privacy">Privacy policy</Link><span aria-hidden="true">·</span><Link href="/terms">Terms of use</Link></p>
            <Link href="#a-little-more-room" className={styles.discover}>Meet your new calendar <ArrowDown size={14} /></Link>
          </div>
          <CalendarPreview />
        </section>
        <section id="a-little-more-room" className={styles.features} aria-label="What you can do with Unplan">
          <div><span>01 / ONE CLEAR VIEW</span><h2>Your calendars, together.</h2><p>Bring your Google calendars into one place. Create, edit, and move events with changes synced back to Google.</p></div>
          <div><span>02 / STAY IN FLOW</span><h2>Think it. Find it. Do it.</h2><p>Keyboard shortcuts, quick search, and flexible day views keep your attention on the work in front of you.</p></div>
          <div><span>03 / THE SPACE BETWEEN</span><h2>More than time blocks.</h2><p>Keep notes beside your events. Connect Todoist when you want to bring your tasks into your day.</p></div>
        </section>
      </main>
      <footer className={styles.footer}><div><Link href="/" className={styles.wordmark}>unplan</Link><span>Open source. Open possibilities.</span></div><AppInformationLinks /><a href="mailto:hullah3000@gmail.com">Get in touch <ArrowUpRight size={13} /></a></footer>
    </div>
  );
}
