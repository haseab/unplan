import type { ComponentProps } from "react";
import { frontendHost } from "./runtime.js";
export default function Link({ href, ...props }: ComponentProps<"a">) {
  const websiteUrl = frontendHost().websiteUrl;
  return <a {...props} href={websiteUrl && href ? websiteUrl(href) : href} {...(websiteUrl ? { target: "_blank", rel: "noreferrer" } : {})} />;
}
