import type { Logger } from 'pino';

export interface SyncSchedulerConfig {
  intervalSeconds: number;
}

export class SyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private syncFunction: () => Promise<void>;
  private logger: Logger;
  private intervalSeconds: number;

  constructor(
    syncFunction: () => Promise<void>,
    config: SyncSchedulerConfig,
    logger: Logger,
  ) {
    this.syncFunction = syncFunction;
    this.logger = logger;
    this.intervalSeconds = config.intervalSeconds;
  }

  async start(): Promise<void> {
    // Run initial sync
    this.isSyncing = true;
    try {
      await this.syncFunction();
    } finally {
      this.isSyncing = false;
    }

    // Start periodic sync
    this.timer = setInterval(
      async () => {
        if (this.isSyncing) {
          this.logger.info('Sync already in progress, skipping this interval.');
          return;
        }
        
        this.isSyncing = true;
        try {
          await this.syncFunction();
          // Refresh timer to prevent drift
          if (this.timer) {
            this.timer.refresh();
          }
        } catch (error) {
          this.logger.error('Sync failed:', error);
        } finally {
          this.isSyncing = false;
        }
      },
      this.intervalSeconds * 1000,
    );

    this.logger.info(`Sync scheduler started with ${this.intervalSeconds}s interval`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('Sync scheduler stopped');
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  getIntervalSeconds(): number {
    return this.intervalSeconds;
  }

  updateInterval(intervalSeconds: number): void {
    this.intervalSeconds = intervalSeconds;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }
}
