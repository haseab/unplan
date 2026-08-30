export const normalizeSearchText = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const searchKeywords = (query: string) =>
  normalizeSearchText(query).split(" ").filter(Boolean);

export const matchesSearchKeywords = (text: string, query: string) => {
  const keywords = searchKeywords(query);
  if (!keywords.length) return false;
  const normalizedText = normalizeSearchText(text);
  return keywords.every((keyword) => normalizedText.includes(keyword));
};
