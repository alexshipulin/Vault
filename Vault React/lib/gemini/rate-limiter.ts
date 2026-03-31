type Task<T> = {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class GeminiRateLimiter {
  private readonly maxRequests: number;

  private readonly windowMs: number;

  private readonly queue: Task<unknown>[] = [];

  private readonly requestTimestamps: number[] = [];

  private processing = false;

  constructor(maxRequests = 60, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  schedule<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ run, resolve, reject });
      void this.processQueue();
    });
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  private prune(now: number): void {
    while (
      this.requestTimestamps.length > 0 &&
      now - this.requestTimestamps[0] >= this.windowMs
    ) {
      this.requestTimestamps.shift();
    }
  }

  private getWaitTime(now: number): number {
    this.prune(now);

    if (this.requestTimestamps.length < this.maxRequests) {
      return 0;
    }

    const oldestRequest = this.requestTimestamps[0];
    return Math.max(0, this.windowMs - (now - oldestRequest));
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const waitTime = this.getWaitTime(Date.now());

      if (waitTime > 0) {
        await delay(waitTime);
        continue;
      }

      const task = this.queue.shift() as Task<unknown>;
      this.requestTimestamps.push(Date.now());

      try {
        const result = await task.run();
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      }
    }

    this.processing = false;
  }
}

export const geminiRateLimiter = new GeminiRateLimiter();
