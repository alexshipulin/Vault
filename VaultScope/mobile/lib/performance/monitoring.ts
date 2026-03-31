type MetricType = "duration" | "counter" | "gauge";

type MetricRecord = {
  name: string;
  value: number;
  type: MetricType;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

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
      });
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

  captureError(error: unknown, metadata?: Record<string, unknown>): void {
    console.error("[Monitoring] Captured error", error, metadata);

    try {
      const sentryModule = require("@sentry/react-native") as {
        captureException?: (exception: unknown, context?: Record<string, unknown>) => void;
      };

      sentryModule.captureException?.(error, metadata);
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
}

export const performanceMonitor = new PerformanceMonitor();
