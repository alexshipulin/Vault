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
  "from",
  "into",
  "over",
  "under",
]);

const GENERIC_NOISE = new Set([
  "vintage",
  "antique",
  "old",
  "nice",
  "rare",
  "collectible",
  "collectibles",
  "item",
  "items",
  "piece",
  "pieces",
  "estate",
  "beautiful",
  "wonderful",
]);

const SHORT_IDENTIFIERS = new Set([
  "1c",
  "2c",
  "3c",
  "5c",
  "10c",
  "20c",
  "25c",
  "50c",
  "cc",
  "lp",
  "ep",
  "45",
  "78",
  "nm",
  "vg",
  "xf",
  "au",
  "ms",
  "pr",
  "pf",
  "blp",
  "cl",
  "cs",
]);

const COIN_MINT_MARKS = new Set(["s", "d", "p", "o", "cc"]);
const COIN_DENOMINATION_TERMS = new Set([
  "cent",
  "nickel",
  "dime",
  "quarter",
  "half",
  "dollar",
  "eagle",
  "sovereign",
  "krugerrand",
  "maple",
]);
const COIN_VARIETY_TERMS = new Set(["vdb", "ddo", "ddr", "proof", "cameo", "dmpl", "pl"]);
const METAL_TERMS = new Set(["silver", "gold", "platinum", "palladium", "copper", "bronze", "nickel"]);

export interface AuctionKeywordInput {
  title: string;
  description?: string | null;
  category?: string | null;
  rawKeywords?: string[];
}

function isUsefulToken(token: string): boolean {
  if (!token || STOP_WORDS.has(token) || GENERIC_NOISE.has(token)) {
    return false;
  }

  if (/^\d{4}$/.test(token) || /^\d{4}s$/.test(token)) {
    return true;
  }

  if (SHORT_IDENTIFIERS.has(token) || COIN_MINT_MARKS.has(token)) {
    return true;
  }

  if (/^[a-z]{1,4}\d{2,}[a-z]*$/i.test(token) || /^\d+[a-z]{1,4}$/i.test(token)) {
    return true;
  }

  return token.length >= 3;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(isUsefulToken);
}

function addUnique(target: string[], values: Array<string | null | undefined>): void {
  for (const value of values) {
    if (!value) {
      continue;
    }

    for (const token of tokenize(value)) {
      if (!target.includes(token)) {
        target.push(token);
      }
    }
  }
}

function addVerified(target: string[], values: Array<string | null | undefined>): void {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized || !isUsefulToken(normalized) || target.includes(normalized)) {
      continue;
    }

    target.push(normalized);
  }
}

function inferCategory(input: AuctionKeywordInput): string {
  const haystack = `${input.title} ${input.description ?? ""} ${input.category ?? ""}`.toLowerCase();

  if (/\b(coin|cent|dollar|quarter|dime|nickel|eagle|sovereign|krugerrand)\b/.test(haystack)) {
    return "coin";
  }

  if (/\b(vinyl|record|lp|45|album|blue note|columbia|capitol)\b/.test(haystack)) {
    return "vinyl";
  }

  if (/\b(ceramic|porcelain|pottery|vase|stoneware|earthenware|urn)\b/.test(haystack)) {
    return "ceramics";
  }

  if (/\b(chair|table|cabinet|desk|dresser|bench|stool)\b/.test(haystack)) {
    return "furniture";
  }

  if (/\b(painting|art|print|canvas|watercolor|etching|drawing|sculpture)\b/.test(haystack)) {
    return "art";
  }

  if (/\b(jewelry|ring|necklace|bracelet|brooch|pendant|earring)\b/.test(haystack)) {
    return "jewelry";
  }

  return "general";
}

function extractCoinTerms(text: string): string[] {
  const rawTokens = tokenize(text);
  const mintMarks = Array.from(new Set(text.toLowerCase().match(/\b(?:cc|s|d|p|o)\b/g) ?? []));
  const denominations = rawTokens.filter(
    (token) => COIN_DENOMINATION_TERMS.has(token) || /^\d{1,2}c$/.test(token),
  );
  const varieties = rawTokens.filter(
    (token) => COIN_VARIETY_TERMS.has(token) || /^(?:ms|pr|pf|vf|xf|au)\d{2}$/i.test(token),
  );
  const metals = rawTokens.filter((token) => METAL_TERMS.has(token));

  return Array.from(new Set([...mintMarks, ...denominations, ...varieties, ...metals]));
}

function extractVinylTerms(input: AuctionKeywordInput): string[] {
  const keywords: string[] = [];
  const combined = `${input.title} ${input.description ?? ""}`;

  const catnoMatches = combined.match(/\b[A-Z]{1,5}[ -]?\d{2,6}[A-Z]?\b/g) ?? [];
  for (const match of catnoMatches) {
    addVerified(
      keywords,
      match
        .toLowerCase()
        .split(/[\s-]+/)
        .filter((part) => part.length > 1),
    );
  }

  const years = combined.match(/\b(19|20)\d{2}\b/g) ?? [];
  for (const year of years) {
    if (!keywords.includes(year)) {
      keywords.push(year);
    }
    const decade = `${year.slice(0, 3)}0s`;
    if (!keywords.includes(decade)) {
      keywords.push(decade);
    }
  }

  addUnique(keywords, [input.title, input.description ?? "", ...(input.rawKeywords ?? [])]);
  return keywords;
}

function extractGenericTerms(input: AuctionKeywordInput): string[] {
  const keywords: string[] = [];
  addUnique(keywords, [input.title, input.description ?? "", ...(input.rawKeywords ?? [])]);
  return keywords;
}

export function extractKeywords(text: string): string[] {
  return Array.from(new Set(tokenize(text))).slice(0, 25);
}

export function buildAuctionKeywords(input: AuctionKeywordInput): string[] {
  const category = inferCategory(input);
  const combined = `${input.title} ${input.description ?? ""}`;
  const keywords: string[] = [];

  addUnique(keywords, [...(input.rawKeywords ?? []), input.title]);

  if (category === "coin") {
    addVerified(keywords, extractCoinTerms(combined));
  } else if (category === "vinyl") {
    addVerified(keywords, extractVinylTerms(input));
  } else {
    addUnique(keywords, [input.description ?? ""]);
  }

  addUnique(keywords, [input.category ?? ""]);

  return Array.from(new Set(keywords.map((keyword) => keyword.toLowerCase()))).slice(0, 25);
}
