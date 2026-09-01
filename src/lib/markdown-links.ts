export type MarkdownLinkToken =
  | { text: string; type: "text" }
  | { href: string; text: string; type: "link" };

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^\s)]+)\)/g;

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
  return tokens.length ? tokens : [{ text: value, type: "text" }];
};
