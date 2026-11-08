import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";

export const metadata: Metadata = { title: "Privacy policy — Unplan", description: "How Unplan uses, stores, shares, and deletes account and calendar data." };

export default function PrivacyPage() {
  return (
    <PublicPage title="Privacy policy" introduction="Unplan uses the information you connect to help you manage your calendar and tasks. This page explains what we access and how you can remove it.">
      <p>Last updated: November 7, 2026. This policy applies to the hosted Unplan application at unplan.io. Contact: <a href="mailto:hullah3000@gmail.com">hullah3000@gmail.com</a>.</p>
      <h2>Google account and calendar data</h2>
      <p>When you connect Google, Unplan receives your Google account identifier and email address. With your permission, Unplan reads your calendar list and event information, including titles, times, descriptions, participants, locations, reminders, and meeting links. It creates, updates, moves, or deletes events when you request those actions. It reads and updates calendar-list preferences to keep visibility in sync.</p>
      <p>Unplan uses this data to display your schedule, search events, edit your calendar, and support notes and event tasks. We do not sell Google user data, use it for advertising, or use it to develop or train generalized AI or machine-learning models.</p>
      <h2>Sharing, transfer, and disclosure of Google user data</h2>
      <p>Unplan shares, transfers, or discloses Google user data only to operate the application and provide the features described in this policy. The recipients and purposes are:</p>
      <ul>
        <li><strong>Google:</strong> Unplan exchanges authorization credentials with Google to connect and maintain your account, and sends calendar identifiers, event information, and calendar-list preferences to Google&apos;s APIs to read your calendars and carry out your requested changes.</li>
        <li><strong>Railway:</strong> Railway provides Unplan&apos;s application hosting and PostgreSQL database infrastructure. Google account identifiers, email addresses, and calendar data pass through the Railway-hosted server to provide calendar features. The database stores account identifiers, email addresses, encrypted Google access and refresh tokens, and session records. Railway processes this information as Unplan&apos;s infrastructure provider.</li>
        <li><strong>People with access to your Google calendars and events:</strong> Event information you create, edit, copy, or move, including notes saved in event descriptions, may be visible to calendar owners, people with whom the calendar is shared, and event participants according to Google Calendar&apos;s permissions and event visibility settings. Google sends invitations or update notifications when you choose to notify participants.</li>
        <li><strong>Todoist, when connected:</strong> Todoist receives task text, descriptions, scheduling information, and calendar references that you save through the task integration. This includes Google calendar information you transfer from an event to your task list. Connecting Todoist also uploads existing browser-local tasks to your Todoist account.</li>
        <li><strong>Deeplog and Retrace, when you open event history:</strong> These are productivity tools for reviewing past work and activity. Deeplog opens time entries or recording history in your browser; Retrace opens an activity timeline in a local app on your computer. Unplan sends the selected event&apos;s start and end times to Deeplog, or its start time to Retrace, to open the corresponding history. These actions do not send the event&apos;s title, description, participant list, or Google credentials to those destinations.</li>
      </ul>
      <p>We do not otherwise share, transfer, or disclose Google user data to third parties. Optional connected services process information under their own privacy policies; connecting Google alone does not connect Todoist or open an event-history service.</p>
      <h2>Credentials and storage</h2>
      <p>Google access and refresh tokens are stored encrypted in a server-side database. The encryption key is kept separately in server configuration. Your browser receives an HttpOnly session cookie, which browser JavaScript cannot read; it is sent securely over HTTPS in the hosted application. Active sessions are renewed and expire after 180 days of inactivity. Google may independently require you to authorize access again.</p>
      <p>Your browser also stores connected-account summaries, preferences, local tasks, notes, and note-recovery history. Some notes and tasks originate from calendar event descriptions. These local copies can remain after you disconnect Google. Clear Unplan&apos;s site data in your browser to remove them. Clearing site data also removes unsynced local work, so save anything you need first.</p>
      <h2>Optional integrations</h2>
      <p>Todoist is a to-do list and task-management service. Unplan uses it to hold unscheduled tasks until you are ready to put them on your calendar. Scheduling a task transfers it from your active Todoist list to Google Calendar: Unplan sends the task&apos;s title and description and your chosen calendar and time slot to Google to create an event. After Google saves the event, Unplan marks the original Todoist task complete so it leaves your active to-do list. The workflow moves work from a to-do list to a scheduled calendar event rather than maintaining an active task in both places. Todoist may retain the original in completed-task history.</p>
      <p><strong>Example: transferring a Todoist task to Google Calendar.</strong> Suppose your Todoist list contains a task titled &ldquo;Prepare project update&rdquo; with the description &ldquo;Review milestones and write next steps.&rdquo; You schedule it on your Work calendar from 10:00 to 10:30 AM. The resulting Google Calendar event looks like this:</p>
      <ul>
        <li><strong>Title:</strong> Prepare project update</li>
        <li><strong>Calendar:</strong> Work</li>
        <li><strong>Time:</strong> 10:00–10:30 AM on the day you choose</li>
        <li><strong>Description:</strong> Review milestones and write next steps.</li>
      </ul>
      <p>The task is then completed in Todoist, and the calendar event becomes the scheduled work item. Its details are visible according to the destination Google calendar&apos;s sharing and event visibility settings.</p>
      <p>Your Todoist API token is stored in your browser and sent to Unplan&apos;s server for task and project requests. A deployment configured for background task refresh may also store a Todoist token in server configuration. Task-refresh settings may be stored in your Todoist account.</p>
      <h2>Service providers and diagnostics</h2>
      <p>Our infrastructure providers may process request paths, status codes, timestamps, and network information in operational logs to operate and secure the application. OAuth diagnostics record error codes rather than credentials.</p>
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
