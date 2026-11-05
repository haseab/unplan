import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";

export const metadata: Metadata = {
  title: "About — Unplan",
  description: "Unplan is an open-source, keyboard-first calendar that keeps Google Calendar as the source of truth.",
};

export default function AboutPage() {
  return (
    <PublicPage title="Make room for your day." introduction="Unplan is an open-source, keyboard-first calendar for planning your time, organizing event tasks, and staying in flow.">
      <section>
        <h2>Your calendars, together</h2>
        <p>Connect your Google accounts to see your calendars in one place. Create and edit events, move time blocks, add participants, and search your schedule. Changes you make in Unplan sync with Google Calendar.</p>
        <p>Keyboard shortcuts, flexible day views, and undoable actions make everyday planning quick. You can also try the calendar with demo events before connecting an account.</p>
      </section>
      <section>
        <h2>A place for the work around your events</h2>
        <p>Keep notes and event tasks beside your schedule. An optional Todoist connection lets you organize Todoist tasks and schedule them on your calendar.</p>
      </section>
      <section>
        <h2>You choose what to connect</h2>
        <p>Google sign-in identifies your account. Calendar permissions let Unplan display and edit your events and keep calendar visibility in sync. Unplan does not request permission to read Gmail, access Drive files, or change calendar sharing permissions.</p>
        <p>Read our <Link href="/privacy">privacy policy</Link> for details about data use, storage, and disconnecting an account.</p>
      </section>
      <section>
        <h2>Start with your calendar</h2>
        <p><Link href="/">Open Unplan</Link> to explore the demo or connect Google Calendar. No payment is required.</p>
        <p>Unplan is <a href="https://github.com/haseab/unplan">open source</a>. For help, contact <a href="mailto:hullah3000@gmail.com">hullah3000@gmail.com</a>.</p>
      </section>
    </PublicPage>
  );
}
