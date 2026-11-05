import type { Metadata } from "next";
import { EventDescriptionDrafts } from "@/components/event-description-drafts";
import { CalendarApp } from "@/components/calendar-app";
import { LandingPage } from "@/components/landing-page";
import { listStoredGoogleAccounts } from "@/lib/google-account-store";
import { readGoogleSession } from "@/lib/google-session";

export const metadata: Metadata = {
  title: "Unplan — Make room for your day.",
  description: "A calmer home for your Google calendars, notes, and next steps. Explore the demo or connect Google Calendar to start planning.",
};

export default async function Home() {
  const session = await readGoogleSession({ renew: false });
  if (session && (await listStoredGoogleAccounts(session.ownerId)).length) {
    return <><CalendarApp /><EventDescriptionDrafts /></>;
  }
  return <LandingPage />;
}
