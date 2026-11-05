import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";

export const metadata: Metadata = { title: "Privacy policy — Unplan", description: "How Unplan uses, stores, and deletes account and calendar data." };

export default function PrivacyPage() {
  return (
    <PublicPage title="Privacy policy" introduction="Unplan uses the information you connect to help you manage your calendar and tasks. This page explains what we access and how you can remove it.">
      <p>Last updated: November 5, 2026. This policy applies to the hosted Unplan application at unplan.io. Contact: <a href="mailto:hullah3000@gmail.com">hullah3000@gmail.com</a>.</p>
      <h2>Google account and calendar data</h2>
      <p>When you connect Google, Unplan receives your Google account identifier and email address. With your permission, Unplan reads your calendar list and event information, including titles, times, descriptions, participants, locations, reminders, and meeting links. It creates, updates, moves, or deletes events when you request those actions. It reads and updates calendar-list preferences to keep visibility in sync.</p>
      <p>Unplan uses this data to display your schedule, search events, edit your calendar, and support notes and event tasks. Calendar data sent through Unplan&apos;s server is passed to Google to perform these functions. We do not sell Google user data, use it for advertising, or use it to develop or train generalized AI or machine-learning models.</p>
      <h2>Credentials and storage</h2>
      <p>Google access and refresh tokens are stored encrypted in a server-side database. The encryption key is kept separately in server configuration. Your browser receives an HttpOnly session cookie, which browser JavaScript cannot read; it is sent securely over HTTPS in the hosted application. Active sessions are renewed and expire after 180 days of inactivity. Google may independently require you to authorize access again.</p>
      <p>Your browser also stores connected-account summaries, preferences, local tasks, notes, and note-recovery history. Some notes and tasks originate from calendar event descriptions. These local copies can remain after you disconnect Google. Clear Unplan&apos;s site data in your browser to remove them. Clearing site data also removes unsynced local work, so save anything you need first.</p>
      <h2>Optional integrations</h2>
      <p>If you connect Todoist, Unplan sends task and project requests to Todoist to display, organize, schedule, and update your tasks. Your Todoist API token is stored in your browser and sent to Unplan&apos;s server for those requests. A deployment configured for background task refresh may also store a Todoist token in server configuration. Task-refresh settings may be stored in your Todoist account.</p>
      <p>If you choose an action that opens another service, such as Google Calendar, Deeplog, or a local history app, the destination may receive the search text, event link, or time range needed for that action. Those services operate under their own privacy policies.</p>
      <h2>Service providers and diagnostics</h2>
      <p>Unplan uses Railway for application hosting and database infrastructure. These providers process information needed to operate the application. Google processes sign-in and Calendar requests; Todoist processes requests when connected. Operational logs may contain request paths, status codes, timestamps, and network information. OAuth diagnostics record error codes rather than credentials.</p>
      <p>Google&apos;s authorization script is loaded when you initiate a connection. Unplan does not use advertising trackers. Local development builds may collect additional browser diagnostics for debugging; these diagnostics are not enabled in the hosted production build.</p>
      <h2>Retention, disconnection, and deletion</h2>
      <p>Server-side Google connection records are retained while the account is connected. Use the Google accounts menu in Unplan to disconnect an account. Disconnection revokes the app&apos;s Google access and deletes that connection&apos;s stored credentials and account record. Disconnecting the last account also deletes the server-side sessions associated with that Unplan account.</p>
      <p>You can also revoke access through <a href="https://myaccount.google.com/connections">your Google Account connections</a>. Revocation prevents further authorized Google access; Unplan removes unusable stored tokens when it detects that authorization has expired or been revoked. Browser-local data is removed separately by clearing site data.</p>
      <p>To request assistance with access or deletion, email <a href="mailto:hullah3000@gmail.com">hullah3000@gmail.com</a> from the connected account. We may need to verify account ownership before handling a request. Infrastructure backups, if enabled, can retain deleted records until their normal rotation completes.</p>
      <h2>Google API Limited Use</h2>
      <p>Unplan&apos;s use and transfer of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      <h2>Updates</h2>
      <p>We will update this page when the application&apos;s data practices change and revise the date above. Material changes will be disclosed before Google data is used for a new purpose.</p>
    </PublicPage>
  );
}
