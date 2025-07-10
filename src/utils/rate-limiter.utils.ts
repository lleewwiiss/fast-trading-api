export class RateLimiter {
  private queue: Array<() => void> = [];
  private lastReset = Date.now();
  private requestsInWindow = 0;

  constructor(private maxRequestsPerSecond: number) {}

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  private process(): void {
    const now = Date.now();

    // Reset counters every second
    if (now - this.lastReset >= 1000) {
      this.lastReset = now;
      this.requestsInWindow = 0;
    }

    // Check if we can process more requests
    while (
      this.queue.length > 0 &&
      this.requestsInWindow < this.maxRequestsPerSecond
    ) {
      const resolve = this.queue.shift();
      if (resolve) {
        this.requestsInWindow++;
        resolve();
      }
    }

    // Schedule next process if queue is not empty
    if (this.queue.length > 0) {
      const timeUntilNextReset = 1000 - (now - this.lastReset);
      setTimeout(() => this.process(), Math.max(10, timeUntilNextReset));
    }
  }
}

// Create a singleton rate limiter for Binance (3 requests per second)
export const binanceRateLimiter = new RateLimiter(3);
