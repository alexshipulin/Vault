import { AppConfig } from "@/constants/Config";
import { getCachedIdentification, setCachedIdentification } from "@/lib/gemini/cache";
import { buildEmbeddingPrompt, buildIdentificationPrompt } from "@/lib/gemini/prompts";
import { geminiRateLimiter, GeminiRateLimiter } from "@/lib/gemini/rate-limiter";
import type {
  GeminiCondition,
  GeminiEmbedContentResponse,
  GeminiEmbeddingResponse,
  GeminiGenerateContentResponse,
  GeminiIdentifyResponse,
  GeminiUsageMetadata,
} from "@/lib/gemini/types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const IDENTIFY_MODEL = "gemini-2.0-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const ESTIMATED_COST_PER_REQUEST_USD = 0.002;

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
    "condition",
    "conditionRange",
    "historySummary",
    "confidence",
    "searchKeywords",
    "distinguishingFeatures",
  ],
  properties: {
    category: { type: "string" },
    name: { type: "string" },
    year: { type: ["integer", "null"] },
    origin: { type: ["string", "null"] },
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
  },
  required: [
    "category",
    "name",
    "year",
    "origin",
    "condition",
    "conditionRange",
    "historySummary",
    "confidence",
    "searchKeywords",
    "distinguishingFeatures",
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

function normalizeStringArray(value: unknown): string[] {
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
  );
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

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function parseIdentifyResponse(payload: string, requestedCategory: string): GeminiIdentifyResponse {
  const parsed = JSON.parse(payload) as Partial<GeminiIdentifyResponse>;
  const condition = normalizeCondition(parsed.condition);
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
    condition,
    conditionRange: normalizeConditionRange(parsed.conditionRange, condition),
    historySummary:
      typeof parsed.historySummary === "string" && parsed.historySummary.trim().length > 0
        ? parsed.historySummary.trim()
        : "No historical summary available.",
    confidence: clampConfidence(parsed.confidence),
    searchKeywords: normalizeStringArray(parsed.searchKeywords),
    distinguishingFeatures: normalizeStringArray(parsed.distinguishingFeatures),
  };

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

export class GeminiClient {
  private readonly apiKey: string;

  private readonly rateLimiter: GeminiRateLimiter;

  constructor(options?: { apiKey?: string; rateLimiter?: GeminiRateLimiter }) {
    this.apiKey = options?.apiKey ?? AppConfig.geminiApiKey;
    this.rateLimiter = options?.rateLimiter ?? geminiRateLimiter;
  }

  static validateConfig(): void {
    validateGeminiConfig();
  }

  async identifyItem(
    images: string[],
    category: string,
    ocrText?: string,
  ): Promise<GeminiIdentifyResponse> {
    if (!Array.isArray(images) || images.length < 1 || images.length > 2) {
      throw new Error("identifyItem expects 1 or 2 base64 images.");
    }

    const normalizedCategory = category.trim().toLowerCase();

    if (!normalizedCategory) {
      throw new Error("identifyItem requires a category.");
    }

    const cached = await getCachedIdentification(images, normalizedCategory);
    if (cached) {
      console.info("[Gemini] identifyItem cache hit.");
      return cached;
    }

    const prompt = buildIdentificationPrompt(normalizedCategory, ocrText);
    const imageParts = images.map((image) => {
      const { data, mimeType } = ensureMimeType(image);
      return {
        inlineData: {
          mimeType,
          data,
        },
      };
    });

    const response = await this.requestWithRetries<GeminiGenerateContentResponse>(
      "identifyItem",
      async () => {
        return this.postJson<GeminiGenerateContentResponse>(
          `/models/${IDENTIFY_MODEL}:generateContent`,
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
              maxOutputTokens: 700,
            },
          },
        );
      },
    );

    const parsed = parseIdentifyResponse(
      extractResponseText(response.body),
      normalizedCategory,
    );

    logUsage("identifyItem", response.body.usageMetadata);
    await setCachedIdentification(images, normalizedCategory, parsed);

    return parsed;
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

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
