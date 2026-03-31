import { getVaultScopeAuth } from "@/lib/firebase/config";
import { saveScanResult } from "@/lib/firebase/firestore";
import { AntiqueSearchEngine } from "@/lib/firebase/search";
import { uploadScanImage } from "@/lib/firebase/storage";
import { GeminiClient } from "@/lib/gemini/client";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";
import { performanceMonitor } from "@/lib/performance/monitoring";
import type { PriceEstimate } from "@/lib/types";
import type { ScanProgressState, ScanResult, VisionResult } from "@/lib/scan/types";
import { ScanPipelineError } from "@/lib/scan/types";
import { VisionProcessor } from "@/lib/vision/processor";

const STEP_LABELS: Record<ScanProgressState["step"], string> = {
  processing: "Processing image...",
  identifying: "Identifying item...",
  pricing: "Finding prices...",
  saving: "Almost done...",
  done: "Scan complete",
};

type ScanPipelineOptions = {
  onProgress?: (progress: ScanProgressState) => void;
  visionProcessor?: VisionProcessor;
  geminiClient?: GeminiClient;
  searchEngine?: AntiqueSearchEngine;
};

function extractCombinedText(results: VisionResult[]): string {
  return results
    .map((result) => result.text.trim())
    .filter(Boolean)
    .join("\n");
}

function buildSearchQuery(
  identification: GeminiIdentifyResponse,
  visionResults: VisionResult[],
): string {
  const barcodeTerms = visionResults.flatMap((result) => result.barcodes.map((barcode) => barcode.data));
  const combinedKeywords = [
    identification.name,
    ...identification.searchKeywords,
    ...barcodeTerms,
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return combinedKeywords.join(" ");
}

function derivePriceEstimate(results: ScanResult["comparableAuctions"]): PriceEstimate {
  const prices = results
    .map((item) => item.priceRealized)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price))
    .sort((left, right) => left - right);

  if (prices.length === 0) {
    return {
      low: null,
      high: null,
      currency: "USD",
      confidence: 0.2,
    };
  }

  const lowIndex = Math.max(0, Math.floor(prices.length * 0.2));
  const highIndex = Math.min(prices.length - 1, Math.floor(prices.length * 0.8));

  return {
    low: prices[lowIndex] ?? prices[0],
    high: prices[highIndex] ?? prices[prices.length - 1],
    currency: "USD",
    confidence: Math.min(0.9, 0.35 + Math.min(prices.length, 10) * 0.05),
  };
}

export class ScanPipeline {
  private readonly visionProcessor: VisionProcessor;

  private readonly geminiClient: GeminiClient;

  private readonly searchEngine: AntiqueSearchEngine;

  private readonly onProgress?: (progress: ScanProgressState) => void;

  constructor(options: ScanPipelineOptions = {}) {
    this.visionProcessor = options.visionProcessor ?? new VisionProcessor();
    this.geminiClient = options.geminiClient ?? new GeminiClient();
    this.searchEngine = options.searchEngine ?? new AntiqueSearchEngine();
    this.onProgress = options.onProgress;
  }

  async executeScan(images: string[], category: string): Promise<ScanResult> {
    const currentUser = getVaultScopeAuth().currentUser;
    const pipelineStartedAt = Date.now();

    if (!currentUser) {
      throw new ScanPipelineError(
        "No authenticated user is available for scanning.",
        "Please reopen VaultScope and try again. We need an active session to save your scan.",
      );
    }

    try {
      this.emitProgress("processing", "active");
      const visionResults = await performanceMonitor.measureAsync(
        "scan.process-images",
        () =>
          Promise.all(images.map((imageUri) => this.visionProcessor.processImage(imageUri))),
        {
          imageCount: images.length,
        },
      );
      this.emitProgress("processing", "complete");

      const uploadedImageUrls = await performanceMonitor.measureAsync(
        "scan.upload-images",
        () =>
          Promise.all(
            visionResults.map((result) =>
              uploadScanImage(currentUser.uid, `data:image/jpeg;base64,${result.base64}`),
            ),
          ),
        {
          imageCount: visionResults.length,
        },
      );
      performanceMonitor.trackFirestoreWrite(uploadedImageUrls.length, {
        area: "storage.uploads",
      });

      this.emitProgress("identifying", "active");
      const identifyStartedAt = Date.now();
      const identification = await performanceMonitor.measureAsync(
        "scan.identify-item",
        () =>
          this.geminiClient.identifyItem(
            visionResults.map((result) => `data:image/jpeg;base64,${result.base64}`),
            category,
            extractCombinedText(visionResults),
          ),
        {
          category,
        },
      );
      performanceMonitor.trackGeminiLatency(Date.now() - identifyStartedAt, {
        category,
      });
      this.emitProgress("identifying", "complete");

      this.emitProgress("pricing", "active");
      const searchCategory =
        identification.category && identification.category !== "general"
          ? identification.category
          : category;
      const comparableAuctions = await performanceMonitor.measureAsync(
        "scan.find-prices",
        () =>
          this.searchEngine.searchByKeywords(
            buildSearchQuery(identification, visionResults),
            { category: searchCategory },
            12,
          ),
        {
          category: searchCategory,
        },
      );
      const priceEstimate = derivePriceEstimate(comparableAuctions);
      this.emitProgress("pricing", "complete");

      this.emitProgress("saving", "active");
      const scannedAt = new Date().toISOString();
      const scanResultId = await performanceMonitor.measureAsync(
        "scan.save-result",
        () =>
          saveScanResult({
            userId: currentUser.uid,
            category,
            images: uploadedImageUrls,
            identification,
            priceEstimate,
            scannedAt,
          }),
        {
          category,
        },
      );
      performanceMonitor.trackFirestoreWrite(1, {
        area: "scan_results",
      });
      this.emitProgress("saving", "complete");
      this.emitProgress("done", "complete");
      performanceMonitor.logSearchQuery(Date.now() - pipelineStartedAt, {
        metric: "scan.total",
        category,
      });

      return {
        id: scanResultId,
        userId: currentUser.uid,
        category,
        images,
        uploadedImageUrls,
        vision: visionResults,
        identification,
        priceEstimate,
        comparableAuctions,
        scannedAt,
      };
    } catch (error) {
      this.emitProgress("done", "error");

      if (error instanceof ScanPipelineError) {
        performanceMonitor.captureError(error, {
          area: "scan.pipeline",
          category,
        });
        throw error;
      }

      if (error instanceof Error) {
        performanceMonitor.captureError(error, {
          area: "scan.pipeline",
          category,
        });
        throw new ScanPipelineError(
          error.message,
          "We couldn't finish analyzing this item. Try a clearer photo or switch to gallery import.",
        );
      }

      throw new ScanPipelineError(
        "Unknown scan pipeline failure.",
        "We couldn't finish analyzing this item. Please try again.",
      );
    }
  }

  private emitProgress(step: ScanProgressState["step"], status: ScanProgressState["status"]): void {
    this.onProgress?.({
      step,
      label: STEP_LABELS[step],
      status,
    });
  }
}
