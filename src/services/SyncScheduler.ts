import type { Logger } from 'pino';
import type { Endpoint } from '../types/endpoint.js';
import { syncPhotosBetweenEndpoints } from './syncUtils.js';

export interface SyncSchedulerConfig {
  intervalSeconds: number;
  endpoints: Endpoint[];
}

export class SyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private logger: Logger;
  private intervalSeconds: number;
  private endpoints: Endpoint[];

  constructor(config: SyncSchedulerConfig, logger: Logger) {
    this.logger = logger;
    this.intervalSeconds = config.intervalSeconds;
    this.endpoints = config.endpoints;
  }

  async start(): Promise<void> {
    // Run initial sync
    await this.runSync();

    // Start periodic sync
    this.timer = setInterval(async () => {
      if (this.isSyncing) {
        this.logger.info('Sync already in progress, skipping this interval.');
        return;
      }
      await this.runSync();
    }, this.intervalSeconds * 1000);

    this.logger.info(
      `Sync scheduler started with ${this.intervalSeconds}s interval`,
    );
  }

  private async runSync(): Promise<void> {
    this.isSyncing = true;
    try {
      // N-way sync: sync all endpoints pairwise
      for (let i = 0; i < this.endpoints.length; i++) {
        for (let j = 0; j < this.endpoints.length; j++) {
          if (i !== j) {
            await syncPhotosBetweenEndpoints(
              this.endpoints[i],
              this.endpoints[j],
              this.logger,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
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

  setEndpoints(endpoints: Endpoint[]): void {
    this.endpoints = endpoints;
  }
}
