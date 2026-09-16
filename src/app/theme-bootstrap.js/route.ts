import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

export const dynamic = "force-static";

export function GET() {
  return new Response(THEME_BOOTSTRAP_SCRIPT, {
    headers: { "Content-Type": "text/javascript; charset=utf-8" },
  });
}
