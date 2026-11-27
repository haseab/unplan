export type MarkdownLinkToken =
  | { text: string; type: "text" }
  | { href: string; text: string; type: "link" };

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^\s)]+)\)/g;

// Bare links are common in Todoist titles as well as Markdown labels.
const bareLinkTokens = (text: string): MarkdownLinkToken[] => {
  const tokens: MarkdownLinkToken[] = [];
  let start = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/gi)) {
    let href = match[0].replace(/[.,;:!?]+$/, "");
    // Keep balanced parentheses in URLs, excluding punctuation around the link.
    while (href.endsWith(")") && href.split(")").length > href.split("(").length) {
      href = href.slice(0, -1);
    }
    if (!safeMarkdownLinkHref(href)) continue;
    if (match.index > start) tokens.push({ type: "text", text: text.slice(start, match.index) });
    tokens.push({ type: "link", text: href, href });
    start = match.index + href.length;
  }
  if (start < text.length) tokens.push({ type: "text", text: text.slice(start) });
  return tokens.length ? tokens : [{ type: "text", text }];
};

const safeMarkdownLinkHref = (href: string) => {
  try {
    const url = new URL(href);
    return url.protocol === "http:"
      || url.protocol === "https:"
      || url.protocol === "mailto:";
  } catch {
    return false;
  }
};

export const markdownLinkTokens = (value: string): MarkdownLinkToken[] => {
  const tokens: MarkdownLinkToken[] = [];
  let textStart = 0;
  for (const match of value.matchAll(MARKDOWN_LINK_PATTERN)) {
    const index = match.index;
    if (index > textStart) {
      tokens.push({ text: value.slice(textStart, index), type: "text" });
    }
    tokens.push(safeMarkdownLinkHref(match[2])
      ? { href: match[2], text: match[1], type: "link" }
      : { text: match[0], type: "text" });
    textStart = index + match[0].length;
  }
  if (textStart < value.length) {
    tokens.push({ text: value.slice(textStart), type: "text" });
  }
  return (tokens.length ? tokens : [{ text: value, type: "text" } as const])
    .flatMap((token) => token.type === "text" ? bareLinkTokens(token.text) : [token]);
};
