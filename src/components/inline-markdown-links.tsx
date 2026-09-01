import * as React from "react";
import { markdownLinkTokens } from "@/lib/markdown-links";

export function InlineMarkdownLinks({ children }: { children: string }) {
  return markdownLinkTokens(children).map((token, index) => token.type === "link" ? (
    <a
      href={token.href}
      key={`${token.href}:${index}`}
      onClick={(event) => event.stopPropagation()}
      rel="noreferrer"
      target="_blank"
    >
      {token.text}
    </a>
  ) : <React.Fragment key={index}>{token.text}</React.Fragment>);
}
