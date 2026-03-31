import type { AuctionCategory } from "../types";

const CATEGORY_RULES: Record<AuctionCategory, string[]> = {
  furniture: ["furniture", "chair", "table"],
  ceramics: ["ceramic", "porcelain", "pottery", "vase"],
  art: ["painting", "art", "print", "canvas"],
  jewelry: ["jewelry", "ring", "necklace", "bracelet"],
  general: [],
};

export function detectCategory(title: string): AuctionCategory {
  const normalized = title.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_RULES) as Array<
    [AuctionCategory, string[]]
  >) {
    if (category === "general") {
      continue;
    }

    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return "general";
}

export function normalizeCategory(value: string | null | undefined): AuctionCategory {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "furniture") {
    return "furniture";
  }

  if (normalized === "ceramics" || normalized === "ceramic") {
    return "ceramics";
  }

  if (normalized === "art") {
    return "art";
  }

  if (normalized === "jewelry" || normalized === "jewellery") {
    return "jewelry";
  }

  return "general";
}
