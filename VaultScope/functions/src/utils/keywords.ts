const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
]);

export function extractKeywords(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (token.length <= 2 || STOP_WORDS.has(token) || seen.has(token)) {
      continue;
    }

    seen.add(token);
    keywords.push(token);
  }

  return keywords;
}
