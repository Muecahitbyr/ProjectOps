import { logger } from "./logger";
import type { MonitorService } from "./monitor";

const DEFAULT_INTERVAL_MS = 30_000;

export class Scheduler {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly monitor: MonitorService,
    private readonly intervalMs: number = DEFAULT_INTERVAL_MS,
  ) {}

  start(): void {
    logger.info("Monitoring Engine gestartet", { intervalMs: this.intervalMs });

    void this.monitor.runAllChecks();
    this.timer = setInterval(() => {
      void this.monitor.runAllChecks();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
