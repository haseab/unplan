import type { Metadata } from "next";
import { CalendarApp } from "@/components/calendar-app";

export const metadata: Metadata = {
  title: "Try the calendar — Unplan",
  description: "Explore Unplan with sample events, then connect your own Google Calendar when you're ready.",
};

export default function DemoPage() {
  return <CalendarApp demo />;
}
