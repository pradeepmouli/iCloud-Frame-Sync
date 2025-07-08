import { config } from '@dotenvx/dotenvx';
import path from 'node:path/win32';
import { setTimeout } from 'node:timers/promises';
import { pino, type Logger } from 'pino';
import type { SamsungFrameClient } from 'samsung-frame-connect';

import { type FrameConfig, type iCloudConfig } from 'types/endpoint.js';
import { PhotoSyncService } from './services/PhotoSyncService.js';
import { SyncScheduler } from './services/SyncScheduler.js';

config();

export interface AppConfig {
  iCloud: iCloudConfig;
  frame: FrameConfig;
  syncIntervalSeconds: number;
  logLevel: string;
}

export class Application {
  private logger: Logger;
  //private frameManager: FrameManager;
  private photoSyncService: PhotoSyncService;
  private syncScheduler: SyncScheduler;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.logger = pino({
      transport: { target: 'pino-pretty', options: { colorize: true } },
      level: config.logLevel,
    });

    const frameLogger = this.logger.child({ name: 'Samsung Frame Client' });
    const iCloudLogger = this.logger.child({ name: 'iCloud Client' });

    //this.frameManager = new FrameManager(config.frame, frameLogger);
    this.photoSyncService = new PhotoSyncService(config, this.logger);

    this.syncScheduler = new SyncScheduler(
      {
        intervalSeconds: config.syncIntervalSeconds,
        endpoints: [this.photoSyncService.iCloud, this.photoSyncService.frame],
      },
      this.logger,
    );

    this.setupSignalHandlers();
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting iCloud Frame Sync application...');

      await this.photoSyncService.initialize();

      // Start sync scheduler
      await this.syncScheduler.start();

      this.logger.info('Application started successfully');
    } catch (error) {
      this.logger.error('Failed to start application:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping application...');

    this.syncScheduler.stop();
    await this.photoSyncService.close();

    this.logger.info('Application stopped');
  }

  private setupSignalHandlers(): void {
    process.once('SIGINT', async () => {
      this.logger.info('SIGINT received, closing connection...');
      setTimeout(5000).then(() => {
        this.logger.info('Force closing connection...');
        process.exit(1);
      });
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.logger.info('SIGTERM received, closing connection...');
      await this.stop();
      process.exit(0);
    });
  }

  getPhotoSyncService(): PhotoSyncService {
    return this.photoSyncService;
  }

  getSyncScheduler(): SyncScheduler {
    return this.syncScheduler;
  }
}

// Factory function to create app config from environment variables
export function createAppConfigFromEnv(): AppConfig {
  return {
    iCloud: {
      username: process.env.ICLOUD_USERNAME!,
      password: process.env.ICLOUD_PASSWORD!,
      sourceAlbum: process.env.ICLOUD_SOURCE_ALBUM || 'Frame Sync',
      dataDirectory: path.resolve(process.env.ICLOUD_DATA_DIRECTORY || 'data'),
      logLevel: process.env.ICLOUD_LOG_LEVEL || process.env.LOG_LEVEL || 'info',
    },
    frame: {
      host: process.env.SAMSUNG_FRAME_HOST!,
      name: 'SamsungTv',
      services: ['art-mode', 'device', 'remote-control'],
      verbosity: Number(process.env.SAMSUNG_FRAME_VERBOSITY || 2),
      logLevel:
        process.env.SAMSUNG_FRAME_LOG_LEVEL || process.env.LOG_LEVEL || 'info',
    },
    syncIntervalSeconds: Number(process.env.ICLOUD_SYNC_INTERVAL || 60),
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
