import type { AppraisalMode } from "@/lib/types";

const SHARED_JSON_RULES = [
  "Return JSON only. Do not wrap the response in markdown.",
  "Use the exact response schema requested by the client and do not omit required fields.",
  "If a field cannot be determined from the images, use null for nullable fields and a lower confidence score.",
  "Put important physical clues, marks, labels, and unusual traits in distinguishingFeatures.",
  "Condition must be one of: mint, near_mint, fine, very_good, good, poor.",
  "conditionRange must contain exactly two condition values representing the plausible lower and upper bounds.",
  "Confidence must be a number from 0 to 1.",
  "Keep historySummary to at most 2 short sentences.",
  "Keep estimatedValueRationale to 1 short sentence.",
  "Keep arrays concise and useful; do not over-explain.",
].join(" ");

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
      "catalogNumber: the catalog number printed on the label or sleeve (for example 'BLP 1577' or 'Columbia CS 9516'). This is the most important field for vinyl and must be extracted precisely whenever visible.",
      "If artist, label, pressing, speedRPM, or catalogNumber are visible or inferable, include them inside distinguishingFeatures and summarize why they matter in historySummary.",
    ].join(" ");
  }

  return [
    "You are identifying an antique, decorative object, or collectible.",
    "Look for period, material, maker, style, craftsmanship, motif, country of origin, and restoration clues.",
    "If period, material, maker, or style are visible or inferable, include them inside distinguishingFeatures and summarize why they matter in historySummary.",
    "Be conservative with value when the object is generic, unmarked, mass-produced, repaired, or visually similar to common decorative household pieces.",
    "Do not anchor to museum-grade, rare, or provenance-rich examples unless the images clearly support that attribution.",
  ].join(" ");
}

function getModeGuidance(appraisalMode: AppraisalMode): string {
  if (appraisalMode === "mystery") {
    return [
      "Mystery mode: treat this as an unknown flea-market or thrift-store find.",
      "Assume the object is common, decorative, mass-produced, utilitarian, or low-value unless the images show strong evidence otherwise.",
      "Prefer plain resale language such as decorative household object, souvenir, later reproduction, utilitarian vessel, or common secondary-market item over prestigious antique attribution.",
      "Do not use museum-grade, rare, or premium-antique framing unless there is a visible maker mark, strong age evidence, distinctive documented form, or highly specific matching details.",
      "When evidence is limited, set marketTier to junk, decor, or secondary, keep pricingEvidenceStrength low, keep valuationConfidence low, and use descriptionTone skeptical or neutral.",
      "For generic decor or household pieces in mystery mode, estimatedValueHigh should usually stay at or below 100 USD unless strong evidence clearly supports more.",
      "For ordinary secondary-market items, estimatedValueHigh should usually stay at or below 150 USD unless there is strong maker or exact-match evidence.",
      "For low-confidence mystery estimates under 150 USD, keep the value range tight, usually no more than about 1.75x to 2x wide and no more than about 15 to 30 USD apart unless strong evidence clearly supports more uncertainty.",
      "If the object could plausibly be common decor, the summary must sound humble and uncertain: likely, possibly, appears to be, could be.",
      "likelyRetailContext should usually be flea_market, thrift, or estate_sale in mystery mode unless the evidence clearly points to auction-grade provenance.",
    ].join(" ");
  }

  return [
    "Standard mode: you may evaluate collectible upside when the evidence supports it.",
    "Still be conservative with pricing when maker marks, dimensions, or provenance are missing.",
  ].join(" ");
}

export function buildIdentificationPrompt(
  category: string,
  ocrText?: string,
  appraisalMode: AppraisalMode = "standard",
): string {
  const ocrSection = ocrText?.trim()
    ? `OCR text extracted from the item or label: """${ocrText.trim()}""". Use it only as supporting evidence.`
    : "No OCR text was provided.";

  return [
    "Identify the collectible item shown in the attached images.",
    `User-selected category: "${category}".`,
    `Appraisal mode: "${appraisalMode}".`,
    getCategoryGuidance(category),
    getModeGuidance(appraisalMode),
    "IDENTIFICATION:",
    'Set category to exactly one of: "coin", "vinyl", "antique", "card", or "general".',
    "Before estimating value, explicitly decide whether the evidence is strong enough for pricing. Use requiresMeasurements, requiresMorePhotos, isLikelyMassProduced, isLikelyReproduction, and valuationWarnings to communicate valuation risk.",
    "Return null for estimatedValueLow and estimatedValueHigh when the item cannot be valued responsibly from the provided evidence.",
    "For ceramics, pottery, jars, vases, and decorative objects, be skeptical without dimensions, base photos, maker marks, or provenance.",
    "Never anchor to rare museum-grade antiques when the photographed item could plausibly be a common decorative or utilitarian object.",
    "estimatedValueRationale should briefly explain the valuation basis using visible age, rarity clues, condition, maker marks, material, category, or collector demand.",
    "marketTier should classify the likely real-world market tier, not the most exciting possible attribution.",
    "pricingEvidenceStrength should describe how strong the pricing evidence is after considering image quality, marks, comparables, and missing context.",
    "valuationConfidence should estimate how trustworthy the price range is, independently from identification confidence.",
    [
      "SEARCH KEYWORDS:",
      "searchKeywords: generate 8-12 lowercase keywords optimized for auction and marketplace search.",
      "Always include: specific item name words, year or date, and the strongest visible identifiers.",
      "For coins: include denomination abbreviation (for example 1c, 25c, dollar), year, mint mark letter (s, d, p, cc, o), metal if relevant (silver, gold), and notable variety terms such as vdb, ddo, or proof.",
      "For vinyl: include artist last name or band words, album title keywords, label words such as blue note, columbia, or capitol, catalog number digits or letters, format terms like lp, 45, or 12inch, and a decade term such as 1960s or 1970s.",
      "For antiques: include material (bronze, porcelain, mahogany), style or period (victorian, art deco, ming), country or origin adjective (japanese, french), item type (vase, cabinet, chair), and maker if known.",
      "For cards: include player last name, sport (baseball, basketball), year, brand (topps, panini), set name keywords, and card type words such as rookie, refractor, or auto.",
      "Exclude generic words such as vintage, antique, old, nice, or rare unless they are truly defining, exclude meaningless single letters, and exclude numbers under 2 digits except known denomination or format identifiers.",
      "When present, include the most specific identifier such as a catalog number, designation, or registry code.",
    ].join(" "),
    [
      "PRICING ASSESSMENT:",
      "Based on your training data, estimate the current market value in USD.",
      "estimatedValueLow: realistic minimum (conservative buyer price).",
      "estimatedValueHigh: realistic maximum (optimistic seller price).",
      'estimatedValueCurrency should be "USD" whenever you provide a value range.',
      "Keep range tight: usually stay within about a 2x ratio, and for mystery-mode items under 150 USD usually stay within about a 1.5x to 2x ratio and no more than about 10 to 20 USD apart unless strong evidence clearly supports more uncertainty.",
      "If it is a bullion coin (silver, gold, or platinum), set isBullion to true and estimate based on metal content plus a small premium.",
      "If you cannot responsibly estimate value, return null for estimatedValueLow and estimatedValueHigh and explain why in pricingBasis.",
      "pricingBasis should be a brief market explanation in plain English.",
      "pricingConfidence must be a number from 0 to 1 and should be 0.8 or higher only if you have strong knowledge of this specific item's market.",
    ].join(" "),
    ocrSection,
    SHARED_JSON_RULES,
    "Return compact minified JSON that matches the client's schema exactly.",
  ].join("\n\n");
}

export function buildRepairIdentificationPrompt(
  category: string,
  ocrText?: string,
  appraisalMode: AppraisalMode = "standard",
): string {
  const ocrSection = ocrText?.trim()
    ? `Supporting OCR text: """${ocrText.trim()}""".`
    : "No OCR text was provided.";

  return [
    `User-selected category: "${category}".`,
    `Appraisal mode: "${appraisalMode}".`,
    getCategoryGuidance(category),
    getModeGuidance(appraisalMode),
    ocrSection,
    "Return the answer again as valid minified JSON only.",
    "Do not use markdown, comments, ellipses, trailing commas, or partial strings.",
    "Keep historySummary to at most 2 short sentences and estimatedValueRationale to 1 short sentence.",
    'Set category to exactly one of: "coin", "vinyl", "antique", "card", or "general".',
    "Keep searchKeywords lowercase and optimized for auction search using specific identifiers, dates, mint marks, label words, catalog numbers, makers, and formats.",
    "Include pricingBasis, pricingConfidence, and isBullion when you can do so responsibly.",
    "If unsure, keep values conservative and use null instead of inventing details.",
  ].join("\n\n");
}

export function buildEmbeddingPrompt(text: string): string {
  return text.trim();
}
