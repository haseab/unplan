import * as React from "react";
import { markdownLinkTokens } from "@/lib/markdown-links";
import { openBrowserTab } from "@/lib/open-browser-tab";

export function InlineMarkdownLinks({ children, preferBrowserTab = false }: { children: string; preferBrowserTab?: boolean }) {
  return markdownLinkTokens(children).map((token, index) => token.type === "link" ? (
    <a
      href={token.href}
      key={`${token.href}:${index}`}
      onClick={(event) => {
        event.stopPropagation();
        if (preferBrowserTab && event.button === 0 && !event.metaKey && !event.ctrlKey
          && !event.shiftKey && !event.altKey && openBrowserTab(token.href)) {
          event.preventDefault();
        }
      }}
      rel="noreferrer"
      target="_blank"
    >
      {token.text}
    </a>
  ) : <React.Fragment key={index}>{token.text}</React.Fragment>);
}
