const SHARED_JSON_RULES = [
  "Return JSON only. Do not wrap the response in markdown.",
  "Use the exact response schema requested by the client.",
  "If a field cannot be determined from the images, use null for nullable fields and a lower confidence score.",
  "Keep searchKeywords lowercase, unique, and useful for auction or marketplace searches.",
  "Put important physical clues, marks, labels, and unusual traits in distinguishingFeatures.",
  "Condition must be one of: mint, near_mint, fine, very_good, good, poor.",
  "conditionRange must contain exactly two condition values representing the plausible lower and upper bounds.",
  "Confidence must be a number from 0 to 1.",
].join(" ");

const JSON_SCHEMA_DESCRIPTION = `{
  "category": "string",
  "name": "string",
  "year": "number | null",
  "origin": "string | null",
  "condition": "mint | near_mint | fine | very_good | good | poor",
  "conditionRange": ["condition", "condition"],
  "historySummary": "string",
  "confidence": "number",
  "searchKeywords": ["string"],
  "distinguishingFeatures": ["string"]
}`;

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

function getCategoryGuidance(category: string): string {
  const normalizedCategory = normalizeCategory(category);

  if (normalizedCategory.includes("coin")) {
    return [
      "You are identifying a coin or numismatic item.",
      "Look for denomination, mintMark, composition, variety, portrait, edge details, year, country, and notable wear.",
      "If mint mark, denomination, composition, or variety are visible, include them inside distinguishingFeatures and summarize their importance in historySummary.",
    ].join(" ");
  }

  if (normalizedCategory.includes("vinyl") || normalizedCategory.includes("record")) {
    return [
      "You are identifying a vinyl record or music collectible.",
      "Look for artist, album title, label, catalog number, pressing clues, speedRPM, sleeve condition, and regional release details.",
      "If artist, label, pressing, or speedRPM are visible or inferable, include them inside distinguishingFeatures and summarize why they matter in historySummary.",
    ].join(" ");
  }

  return [
    "You are identifying an antique, decorative object, or collectible.",
    "Look for period, material, maker, style, craftsmanship, motif, country of origin, and restoration clues.",
    "If period, material, maker, or style are visible or inferable, include them inside distinguishingFeatures and summarize why they matter in historySummary.",
  ].join(" ");
}

export function buildIdentificationPrompt(category: string, ocrText?: string): string {
  const ocrSection = ocrText?.trim()
    ? `OCR text extracted from the item or label: """${ocrText.trim()}""". Use it only as supporting evidence.`
    : "No OCR text was provided.";

  return [
    "Identify the collectible item shown in the attached images.",
    `User-selected category: "${category}".`,
    getCategoryGuidance(category),
    ocrSection,
    SHARED_JSON_RULES,
    `Return a JSON object with this shape: ${JSON_SCHEMA_DESCRIPTION}`,
  ].join("\n\n");
}

export function buildEmbeddingPrompt(text: string): string {
  return text.trim();
}
