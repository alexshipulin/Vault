import type { GeminiIdentifyResponse } from "@/lib/gemini/types";
import type { AntiqueAuction } from "@/lib/firebase/types";
import type { PriceEstimate } from "@/lib/types";

export interface VisionBarcode {
  type: string;
  data: string;
}

export interface VisionResult {
  originalUri: string;
  croppedUri: string;
  optimizedUri: string;
  base64: string;
  text: string;
  barcodes: VisionBarcode[];
}

export type ScanStepStatus = "idle" | "active" | "complete" | "error";

export type ScanLoadingStep =
  | "processing"
  | "identifying"
  | "pricing"
  | "saving"
  | "done";

export interface ScanProgressState {
  step: ScanLoadingStep;
  label: string;
  status: ScanStepStatus;
}

export interface ScanResult {
  id: string;
  userId: string;
  category: string;
  images: string[];
  uploadedImageUrls: string[];
  vision: VisionResult[];
  identification: GeminiIdentifyResponse;
  priceEstimate: PriceEstimate;
  comparableAuctions: AntiqueAuction[];
  scannedAt: string;
}

export class ScanPipelineError extends Error {
  readonly userMessage: string;

  constructor(message: string, userMessage?: string) {
    super(message);
    this.name = "ScanPipelineError";
    this.userMessage = userMessage ?? "Something went wrong while scanning your item.";
  }
}
