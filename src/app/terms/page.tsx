import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";

export const metadata: Metadata = { title: "Terms of use — Unplan", description: "Terms for using the hosted Unplan calendar application." };

export default function TermsPage() {
  return (
    <PublicPage title="Terms of use" introduction="Unplan is an open-source calendar tool. Please use it responsibly and keep copies of information you cannot afford to lose.">
      <p>Last updated: November 5, 2026.</p>
      <h2>Using Unplan</h2>
      <p>You may use Unplan to manage calendars and tasks you are authorized to access. You are responsible for your connected accounts, the information you enter, and actions you request. Do not use Unplan to access someone else&apos;s information without permission or to disrupt the service.</p>
      <h2>Connected services</h2>
      <p>Calendar edits can change information in your Google account, and task edits can change information in your Todoist account. Review changes before making them. Google, Todoist, and other connected services have their own terms and may change or limit access.</p>
      <h2>Availability and local data</h2>
      <p>Unplan is provided on an &quot;as is&quot; and &quot;as available&quot; basis, without warranties to the extent permitted by applicable law. Availability, synchronization, and preservation of local browser data are not guaranteed. Maintain your own backups of important information. Nothing in these terms excludes rights or protections that applicable law does not permit us to exclude.</p>
      <h2>Privacy and disconnecting</h2>
      <p>Our <Link href="/privacy">privacy policy</Link> describes how the application processes information. You can disconnect Google accounts through Unplan&apos;s account menu and revoke access in your Google Account settings. Browser-local information can be removed by clearing Unplan&apos;s site data.</p>
      <h2>Open source and contact</h2>
      <p>The source code is available under the license in the <a href="https://github.com/haseab/unplan">Unplan repository</a>. For help or questions, contact <a href="mailto:hullah3000@gmail.com">hullah3000@gmail.com</a>.</p>
    </PublicPage>
  );
}
