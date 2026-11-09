import { integrationCalendar } from "@/lib/attention-calendar-integration";

export const GET = (request: Request) => integrationCalendar(request, "current");
