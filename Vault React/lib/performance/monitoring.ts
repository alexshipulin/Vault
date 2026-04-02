import Constants from "expo-constants";

import { AppConfig } from "@/constants/Config";

type MetricType = "duration" | "counter" | "gauge";

type MetricRecord = {
  name: string;
  value: number;
  type: MetricType;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

type ErrorEventPayload = {
  type: "runtime-error";
  timestamp: string;
  severity: "handled" | "fatal";
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
};

type CaptureErrorOptions = {
  severity?: "handled" | "fatal";
};

const DEBUG_SINK_PORT = 8797;

function extractDebugHost(): string | null {
  const constants = Constants as typeof Constants & {
    expoGoConfig?: { debuggerHost?: string | null };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string | null } } };
    manifest?: { debuggerHost?: string | null };
  };

  const debuggerHost =
    constants.expoGoConfig?.debuggerHost ??
    constants.manifest2?.extra?.expoGo?.debuggerHost ??
    constants.manifest?.debuggerHost ??
    Constants.expoConfig?.hostUri ??
    null;

  if (!debuggerHost) {
    return null;
  }

  return debuggerHost.split(":")[0] ?? null;
}

function getDebugSinkURL(): string | null {
  if (AppConfig.debugSinkUrl) {
    return AppConfig.debugSinkUrl;
  }

  const host = extractDebugHost();
  if (!host) {
    return null;
  }

  return `http://${host}:${DEBUG_SINK_PORT}/events`;
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: typeof error === "string" ? error : JSON.stringify(error)
  };
}

function truncateValue(value: string, maxLength = 260): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, truncateValue(value)];
      }

      if (Array.isArray(value)) {
        return [key, value.slice(0, 6)];
      }

      return [key, value];
    }),
  );
}

class PerformanceMonitor {
  private readonly metrics: MetricRecord[] = [];

  private readonly maxMetrics = 500;

  async measureAsync<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    const startedAt = Date.now();

    try {
      const result = await operation();
      this.record(name, Date.now() - startedAt, "duration", metadata);
      return result;
    } catch (error) {
      this.record(`${name}.error`, Date.now() - startedAt, "duration", metadata);
      this.captureError(error, {
        metric: name,
        ...metadata,
      }, { severity: "handled" });
      throw error;
    }
  }

  logSearchQuery(durationMs: number, metadata?: Record<string, unknown>): void {
    this.record("search.query", durationMs, "duration", metadata);
  }

  trackGeminiLatency(durationMs: number, metadata?: Record<string, unknown>): void {
    this.record("gemini.latency", durationMs, "duration", metadata);
  }

  trackFirestoreRead(count: number, metadata?: Record<string, unknown>): void {
    this.record("firebase.reads", count, "counter", metadata);
  }

  trackFirestoreWrite(count: number, metadata?: Record<string, unknown>): void {
    this.record("firebase.writes", count, "counter", metadata);
  }

  captureError(
    error: unknown,
    metadata?: Record<string, unknown>,
    options?: CaptureErrorOptions,
  ): void {
    const severity = options?.severity ?? "handled";
    const sanitizedMetadata = sanitizeMetadata(metadata);
    const logMethod = severity === "fatal" ? console.error : console.warn;
    logMethod("[Monitoring] Captured error", error, sanitizedMetadata);
    this.sendToDebugSink(error, sanitizedMetadata, severity);

    try {
      const sentryModule = require("@sentry/react-native") as {
        captureException?: (exception: unknown, context?: Record<string, unknown>) => void;
      };

      sentryModule.captureException?.(error, sanitizedMetadata);
    } catch {
      // Sentry is optional in local development and test environments.
    }
  }

  getSnapshot(): MetricRecord[] {
    return [...this.metrics];
  }

  private record(
    name: string,
    value: number,
    type: MetricType,
    metadata?: Record<string, unknown>,
  ): void {
    const metric: MetricRecord = {
      name,
      value,
      type,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.metrics.push(metric);

    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    console.info(`[Monitoring] ${name}`, {
      value,
      type,
      metadata,
    });
  }

  private sendToDebugSink(
    error: unknown,
    metadata?: Record<string, unknown>,
    severity: "handled" | "fatal" = "handled",
  ): void {
    if (!__DEV__) {
      return;
    }

    const debugSinkURL = getDebugSinkURL();
    if (!debugSinkURL || typeof fetch !== "function") {
      return;
    }

    const normalized = normalizeError(error);
    const payload: ErrorEventPayload = {
      type: "runtime-error",
      timestamp: new Date().toISOString(),
      severity,
      message: normalized.message,
      stack: normalized.stack,
      metadata
    };

    void fetch(debugSinkURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).catch(() => {
      // The sink is optional and should never affect app behavior.
    });
  }
}

export const performanceMonitor = new PerformanceMonitor();
