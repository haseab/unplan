const HTML_ELEMENT_PATTERN = /<(?:\/?[a-z][^>]*|!--[\s\S]*?--)>/i;

export type EventDescriptionContentType = "html" | "markdown";

export const eventDescriptionContentType = (
  description: string,
): EventDescriptionContentType => HTML_ELEMENT_PATTERN.test(description)
  ? "html"
  : "markdown";
