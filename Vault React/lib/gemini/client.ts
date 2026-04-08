import { AppConfig } from "@/constants/Config";
import { getCachedIdentification, setCachedIdentification } from "@/lib/gemini/cache";
import {
  buildEmbeddingPrompt,
  buildIdentificationPrompt,
  buildRepairIdentificationPrompt,
} from "@/lib/gemini/prompts";
import { geminiRateLimiter, GeminiRateLimiter } from "@/lib/gemini/rate-limiter";
import type {
  GeminiCondition,
  GeminiDescriptionTone,
  GeminiEmbedContentResponse,
  GeminiEmbeddingResponse,
  GeminiGenerateContentResponse,
  GeminiIdentifyResponse,
  GeminiMarketTier,
  GeminiPricingEvidenceStrength,
  GeminiRetailContext,
  GeminiUsageMetadata,
} from "@/lib/gemini/types";
import type { AppraisalMode } from "@/lib/types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_IDENTIFY_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const EMBEDDING_MODEL = "gemini-embedding-001";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const ESTIMATED_COST_PER_REQUEST_USD = 0.002;
const IDENTIFY_MAX_OUTPUT_TOKENS = 1100;
const PAYLOAD_PREVIEW_LIMIT = 260;

const CONDITION_ORDER: GeminiCondition[] = [
  "poor",
  "good",
  "very_good",
  "fine",
  "near_mint",
  "mint",
];

const IDENTIFY_RESPONSE_SCHEMA = {
  type: "object",
  propertyOrdering: [
    "category",
    "name",
    "year",
    "origin",
    "objectType",
    "material",
    "makerOrBrand",
    "catalogNumber",
    "condition",
    "conditionRange",
    "historySummary",
    "confidence",
    "searchKeywords",
    "distinguishingFeatures",
    "requiresMeasurements",
    "requiresMorePhotos",
    "isLikelyMassProduced",
    "isLikelyReproduction",
    "valuationWarnings",
    "marketTier",
    "pricingEvidenceStrength",
    "likelyRetailContext",
    "likelyValueCeiling",
    "valuationConfidence",
    "descriptionTone",
    "estimatedValueLow",
    "estimatedValueHigh",
    "pricingBasis",
    "pricingConfidence",
    "isBullion",
    "estimatedValueCurrency",
    "estimatedValueRationale",
  ],
  properties: {
    category: { type: "string" },
    name: { type: "string" },
    year: { type: ["integer", "null"] },
    origin: { type: ["string", "null"] },
    objectType: { type: ["string", "null"] },
    material: { type: ["string", "null"] },
    makerOrBrand: { type: ["string", "null"] },
    catalogNumber: { type: ["string", "null"] },
    condition: {
      type: "string",
      enum: ["mint", "near_mint", "fine", "very_good", "good", "poor"],
    },
    conditionRange: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "string",
        enum: ["mint", "near_mint", "fine", "very_good", "good", "poor"],
      },
    },
    historySummary: { type: "string" },
    confidence: { type: "number" },
    searchKeywords: {
      type: "array",
      items: { type: "string" },
    },
    distinguishingFeatures: {
      type: "array",
      items: { type: "string" },
    },
    requiresMeasurements: { type: "boolean" },
    requiresMorePhotos: { type: "boolean" },
    isLikelyMassProduced: { type: "boolean" },
    isLikelyReproduction: { type: "boolean" },
    valuationWarnings: {
      type: "array",
      items: { type: "string" },
    },
    marketTier: {
      type: "string",
      enum: ["junk", "decor", "secondary", "collector", "premium_antique"],
    },
    pricingEvidenceStrength: {
      type: "string",
      enum: ["weak", "moderate", "strong"],
    },
    likelyRetailContext: {
      type: "string",
      enum: ["flea_market", "thrift", "estate_sale", "auction"],
    },
    likelyValueCeiling: { type: ["number", "null"] },
    valuationConfidence: { type: "number" },
    descriptionTone: {
      type: "string",
      enum: ["skeptical", "neutral", "collector"],
    },
    estimatedValueLow: { type: ["number", "null"] },
    estimatedValueHigh: { type: ["number", "null"] },
    pricingBasis: { type: ["string", "null"] },
    pricingConfidence: { type: ["number", "null"] },
    isBullion: { type: ["boolean", "null"] },
    estimatedValueCurrency: { type: ["string", "null"] },
    estimatedValueRationale: { type: ["string", "null"] },
  },
  required: [
    "category",
    "name",
    "year",
    "origin",
    "objectType",
    "material",
    "makerOrBrand",
    "condition",
    "conditionRange",
    "historySummary",
    "confidence",
    "searchKeywords",
    "distinguishingFeatures",
    "requiresMeasurements",
    "requiresMorePhotos",
    "isLikelyMassProduced",
    "isLikelyReproduction",
    "valuationWarnings",
    "marketTier",
    "pricingEvidenceStrength",
    "likelyRetailContext",
    "likelyValueCeiling",
    "valuationConfidence",
    "descriptionTone",
    "estimatedValueLow",
    "estimatedValueHigh",
  ],
} as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function validateGeminiConfig(): void {
  void AppConfig.geminiApiKey;
}

function stripCodeFences(input: string): string {
  return input
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeStringArray(value: unknown, maxItems = 10): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, maxItems);
}

function normalizeCondition(value: unknown): GeminiCondition {
  if (typeof value === "string" && CONDITION_ORDER.includes(value as GeminiCondition)) {
    return value as GeminiCondition;
  }

  return "good";
}

function normalizeConditionRange(
  value: unknown,
  fallback: GeminiCondition,
): [GeminiCondition, GeminiCondition] {
  if (!Array.isArray(value) || value.length !== 2) {
    return [fallback, fallback];
  }

  const lower = normalizeCondition(value[0]);
  const upper = normalizeCondition(value[1]);
  const lowerIndex = CONDITION_ORDER.indexOf(lower);
  const upperIndex = CONDITION_ORDER.indexOf(upper);

  if (lowerIndex <= upperIndex) {
    return [lower, upper];
  }

  return [upper, lower];
}

function normalizeYear(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const year = Math.trunc(value);
  if (year < 0 || year > 3000) {
    return null;
  }

  return year;
}

function normalizeEstimatedValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}

function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function limitSentences(value: string | null, maxSentences: number): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= maxSentences) {
    return normalized;
  }

  return sentences.slice(0, maxSentences).join(" ").trim();
}

function buildPayloadPreview(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > PAYLOAD_PREVIEW_LIMIT
    ? `${normalized.slice(0, PAYLOAD_PREVIEW_LIMIT)}…`
    : normalized;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value === true || value === false) {
    return value;
  }

  return null;
}

function normalizeMarketTier(value: unknown, appraisalMode: AppraisalMode): GeminiMarketTier {
  if (
    value === "junk" ||
    value === "decor" ||
    value === "secondary" ||
    value === "collector" ||
    value === "premium_antique"
  ) {
    return value;
  }

  return appraisalMode === "mystery" ? "decor" : "secondary";
}

function normalizePricingEvidenceStrength(value: unknown): GeminiPricingEvidenceStrength {
  if (value === "weak" || value === "moderate" || value === "strong") {
    return value;
  }

  return "weak";
}

function normalizeRetailContext(value: unknown, appraisalMode: AppraisalMode): GeminiRetailContext {
  if (value === "flea_market" || value === "thrift" || value === "estate_sale" || value === "auction") {
    return value;
  }

  return appraisalMode === "mystery" ? "flea_market" : "auction";
}

function normalizeDescriptionTone(value: unknown, appraisalMode: AppraisalMode): GeminiDescriptionTone {
  if (value === "skeptical" || value === "neutral" || value === "collector") {
    return value;
  }

  return appraisalMode === "mystery" ? "skeptical" : "neutral";
}

function ensureMimeType(input: string): { data: string; mimeType: string } {
  const trimmed = input.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (match) {
    return {
      mimeType: match[1],
      data: match[2].replace(/\s+/g, ""),
    };
  }

  return {
    mimeType: "image/jpeg",
    data: trimmed.replace(/\s+/g, ""),
  };
}

function extractResponseText(response: GeminiGenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const blockReason = response.promptFeedback?.blockReason;
    throw new Error(
      blockReason
        ? `Gemini returned no text output. Block reason: ${blockReason}`
        : "Gemini returned no text output.",
    );
  }

  return stripCodeFences(text);
}

function parseIdentifyResponse(
  payload: string,
  requestedCategory: string,
  appraisalMode: AppraisalMode,
): GeminiIdentifyResponse {
  const parsed = JSON.parse(payload) as Partial<GeminiIdentifyResponse>;
  const condition = normalizeCondition(parsed.condition);
  const estimatedValueLow = normalizeEstimatedValue(parsed.estimatedValueLow);
  const estimatedValueHigh = normalizeEstimatedValue(parsed.estimatedValueHigh);
  const normalizedLow =
    estimatedValueLow != null && estimatedValueHigh != null
      ? Math.min(estimatedValueLow, estimatedValueHigh)
      : estimatedValueLow;
  const normalizedHigh =
    estimatedValueLow != null && estimatedValueHigh != null
      ? Math.max(estimatedValueLow, estimatedValueHigh)
      : estimatedValueHigh;
  const normalizedPricingBasis = limitSentences(
    normalizeNullableString(parsed.pricingBasis ?? parsed.estimatedValueRationale),
    1,
  );
  const normalizedPricingConfidence = clampConfidence(
    parsed.pricingConfidence ?? parsed.valuationConfidence,
  );
  const normalizedValuationConfidence = clampConfidence(
    parsed.valuationConfidence ?? parsed.pricingConfidence,
  );
  const response: GeminiIdentifyResponse = {
    category:
      typeof parsed.category === "string" && parsed.category.trim().length > 0
        ? parsed.category.trim().toLowerCase()
        : requestedCategory.trim().toLowerCase(),
    name:
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : "Unknown item",
    year: normalizeYear(parsed.year),
    origin: normalizeNullableString(parsed.origin),
    objectType: normalizeNullableString(parsed.objectType),
    material: normalizeNullableString(parsed.material),
    makerOrBrand: normalizeNullableString(parsed.makerOrBrand),
    catalogNumber: normalizeNullableString(parsed.catalogNumber),
    condition,
    conditionRange: normalizeConditionRange(parsed.conditionRange, condition),
    historySummary:
      typeof parsed.historySummary === "string" && parsed.historySummary.trim().length > 0
        ? parsed.historySummary.trim()
        : "No historical summary available.",
    confidence: clampConfidence(parsed.confidence),
    searchKeywords: normalizeStringArray(parsed.searchKeywords, 10),
    distinguishingFeatures: normalizeStringArray(parsed.distinguishingFeatures, 8),
    requiresMeasurements: normalizeBoolean(parsed.requiresMeasurements),
    requiresMorePhotos: normalizeBoolean(parsed.requiresMorePhotos),
    isLikelyMassProduced: normalizeBoolean(parsed.isLikelyMassProduced),
    isLikelyReproduction: normalizeBoolean(parsed.isLikelyReproduction),
    valuationWarnings: normalizeStringArray(parsed.valuationWarnings, 5),
    marketTier: normalizeMarketTier(parsed.marketTier, appraisalMode),
    pricingEvidenceStrength: normalizePricingEvidenceStrength(parsed.pricingEvidenceStrength),
    likelyRetailContext: normalizeRetailContext(parsed.likelyRetailContext, appraisalMode),
    likelyValueCeiling: normalizeEstimatedValue(parsed.likelyValueCeiling),
    valuationConfidence: normalizedValuationConfidence,
    descriptionTone: normalizeDescriptionTone(parsed.descriptionTone, appraisalMode),
    estimatedValueLow: normalizedLow ?? null,
    estimatedValueHigh: normalizedHigh ?? null,
    estimatedValueCurrency: normalizeCurrencyCode(parsed.estimatedValueCurrency),
    estimatedValueRationale: normalizedPricingBasis,
    pricingBasis: normalizedPricingBasis,
    pricingConfidence: normalizedPricingConfidence,
    isBullion: normalizeNullableBoolean(parsed.isBullion),
  };

  response.historySummary =
    limitSentences(response.historySummary, 2) ?? "No historical summary available.";

  if (response.searchKeywords.length === 0) {
    response.searchKeywords = response.name
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((value) => value.length > 2)
      .slice(0, 8);
  }

  return response;
}

function logUsage(operation: string, usage?: GeminiUsageMetadata): void {
  if (!usage) {
    console.info(
      `[Gemini] ${operation} completed. Estimated cost: $${ESTIMATED_COST_PER_REQUEST_USD.toFixed(3)}`,
    );
    return;
  }

  console.info(
    `[Gemini] ${operation} promptTokens=${usage.promptTokenCount ?? 0} outputTokens=${usage.candidatesTokenCount ?? 0} totalTokens=${usage.totalTokenCount ?? 0} estimatedCost=$${ESTIMATED_COST_PER_REQUEST_USD.toFixed(3)}`,
  );
}

function getRetryDelay(attempt: number): number {
  const baseDelay = 400 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return baseDelay + jitter;
}

function buildIdentifyModelCandidates(candidates: readonly string[] = []): string[] {
  const normalized = candidates
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  return Array.from(new Set([...normalized, ...DEFAULT_IDENTIFY_MODELS]));
}

function isMissingModelError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("not found") &&
    (message.includes("supported for generatecontent") || message.includes("models/"))
  );
}

function isJsonSyntaxError(error: unknown): error is SyntaxError {
  return error instanceof SyntaxError;
}

type GeminiInvalidJsonErrorOptions = {
  model: string;
  appraisalMode: AppraisalMode;
  category: string;
  payloadPreview: string;
  cause?: unknown;
};

export class GeminiInvalidJsonError extends Error {
  readonly model: string;

  readonly appraisalMode: AppraisalMode;

  readonly category: string;

  readonly payloadPreview: string;

  constructor(options: GeminiInvalidJsonErrorOptions) {
    super(
      `Gemini returned invalid JSON for model ${options.model} in ${options.appraisalMode} mode.`,
    );
    this.name = "GeminiInvalidJsonError";
    this.model = options.model;
    this.appraisalMode = options.appraisalMode;
    this.category = options.category;
    this.payloadPreview = options.payloadPreview;

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class GeminiClient {
  private readonly apiKey: string;

  private readonly rateLimiter: GeminiRateLimiter;

  private readonly identifyModels: string[];

  constructor(options?: { apiKey?: string; rateLimiter?: GeminiRateLimiter; identifyModels?: string[] }) {
    this.apiKey = options?.apiKey ?? AppConfig.geminiApiKey;
    this.rateLimiter = options?.rateLimiter ?? geminiRateLimiter;
    this.identifyModels = buildIdentifyModelCandidates(
      options?.identifyModels ?? (AppConfig.geminiModel ? [AppConfig.geminiModel] : []),
    );
  }

  static validateConfig(): void {
    validateGeminiConfig();
  }

  private buildImageParts(images: string[]) {
    return images.map((image) => {
      const { data, mimeType } = ensureMimeType(image);
      return {
        inlineData: {
          mimeType,
          data,
        },
      };
    });
  }

  private async requestIdentifyResponse(
    model: string,
    prompt: string,
    imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  ) {
    return this.requestWithRetries<GeminiGenerateContentResponse>(
      "identifyItem",
      async () => {
        return this.postJson<GeminiGenerateContentResponse>(
          `/models/${model}:generateContent`,
          {
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }, ...imageParts],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: IDENTIFY_RESPONSE_SCHEMA,
              temperature: 0.2,
              maxOutputTokens: IDENTIFY_MAX_OUTPUT_TOKENS,
            },
          },
        );
      },
    );
  }

  private parseIdentifyPayload(
    payload: string,
    requestedCategory: string,
    appraisalMode: AppraisalMode,
    model: string,
  ): GeminiIdentifyResponse {
    try {
      return parseIdentifyResponse(payload, requestedCategory, appraisalMode);
    } catch (error) {
      if (isJsonSyntaxError(error)) {
        throw new GeminiInvalidJsonError({
          model,
          appraisalMode,
          category: requestedCategory,
          payloadPreview: buildPayloadPreview(payload),
          cause: error,
        });
      }

      throw error;
    }
  }

  async identifyItem(
    images: string[],
    category: string,
    ocrText?: string,
    appraisalMode: AppraisalMode = "standard",
  ): Promise<GeminiIdentifyResponse> {
    if (!Array.isArray(images) || images.length < 1 || images.length > 3) {
      throw new Error("identifyItem expects 1 to 3 base64 images.");
    }

    const normalizedCategory = category.trim().toLowerCase();

    if (!normalizedCategory) {
      throw new Error("identifyItem requires a category.");
    }

    const cached = await getCachedIdentification(images, normalizedCategory, appraisalMode);
    if (cached) {
      console.info("[Gemini] identifyItem cache hit.");
      return cached;
    }

    const prompt = buildIdentificationPrompt(normalizedCategory, ocrText, appraisalMode);
    const repairPrompt = buildRepairIdentificationPrompt(normalizedCategory, ocrText, appraisalMode);
    const imageParts = this.buildImageParts(images);

    let lastError: unknown;

    for (const model of this.identifyModels) {
      try {
        const response = await this.requestIdentifyResponse(model, prompt, imageParts);
        const responseText = extractResponseText(response.body);
        const parsed = this.parseIdentifyPayload(
          responseText,
          normalizedCategory,
          appraisalMode,
          model,
        );

        logUsage(`identifyItem model=${model}`, response.body.usageMetadata);
        await setCachedIdentification(images, normalizedCategory, appraisalMode, parsed);

        return parsed;
      } catch (error) {
        lastError = error;

        if (error instanceof GeminiInvalidJsonError) {
          try {
            const repairedResponse = await this.requestIdentifyResponse(model, repairPrompt, imageParts);
            const repairedText = extractResponseText(repairedResponse.body);
            const repaired = this.parseIdentifyPayload(
              repairedText,
              normalizedCategory,
              appraisalMode,
              model,
            );

            logUsage(`identifyItem model=${model} repair`, repairedResponse.body.usageMetadata);
            await setCachedIdentification(images, normalizedCategory, appraisalMode, repaired);

            return repaired;
          } catch (repairError) {
            lastError = repairError;

            if (
              model !== this.identifyModels[this.identifyModels.length - 1] &&
              (repairError instanceof GeminiInvalidJsonError || isMissingModelError(repairError))
            ) {
              console.warn(`[Gemini] identifyItem model ${model} produced invalid JSON. Trying fallback model.`);
              continue;
            }

            throw repairError;
          }
        }

        if (isMissingModelError(error) && model !== this.identifyModels[this.identifyModels.length - 1]) {
          console.warn(`[Gemini] identifyItem model ${model} is unavailable. Trying fallback model.`);
          continue;
        }

        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("identifyItem failed.");
  }

  async generateEmbedding(text: string): Promise<GeminiEmbeddingResponse> {
    const input = buildEmbeddingPrompt(text);

    if (!input) {
      throw new Error("generateEmbedding requires non-empty text.");
    }

    const response = await this.requestWithRetries<GeminiEmbedContentResponse>(
      "generateEmbedding",
      async () => {
        return this.postJson<GeminiEmbedContentResponse>(
          `/models/${EMBEDDING_MODEL}:embedContent`,
          {
            model: `models/${EMBEDDING_MODEL}`,
            content: {
              parts: [{ text: input }],
            },
            taskType: "SEMANTIC_SIMILARITY",
            outputDimensionality: 768,
          },
        );
      },
    );

    const embedding = response.body.embedding?.values;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Gemini returned an empty embedding.");
    }

    console.info(
      `[Gemini] generateEmbedding dimensions=${embedding.length} estimatedCost=$${ESTIMATED_COST_PER_REQUEST_USD.toFixed(3)}`,
    );

    return { embedding };
  }

  private async requestWithRetries<T>(
    operation: string,
    task: () => Promise<{ body: T; status: number }>,
  ): Promise<{ body: T; status: number }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await this.rateLimiter.schedule(task);
      } catch (error) {
        lastError = error;

        if (isMissingModelError(error)) {
          break;
        }

        if (attempt === MAX_RETRIES) {
          break;
        }

        console.warn(
          `[Gemini] ${operation} failed on attempt ${attempt}. Retrying...`,
          error,
        );
        await delay(getRetryDelay(attempt));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`[Gemini] ${operation} failed after ${MAX_RETRIES} attempts.`);
  }

  private async postJson<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ body: T; status: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${GEMINI_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(responseText || `Gemini request failed with status ${response.status}.`);
      }

      return {
        status: response.status,
        body: JSON.parse(responseText) as T,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Gemini request timed out after 15 seconds.");
      }

      if (isJsonSyntaxError(error)) {
        throw new Error("Gemini returned a malformed response envelope.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
