import { config } from '@dotenvx/dotenvx';
import { setTimeout } from 'node:timers/promises';
import { pino, type Logger } from 'pino';
import { FrameManager, type FrameConfig } from './services/FrameManager.js';
import {
  PhotoSyncService,
  type PhotoSyncConfig,
} from './services/PhotoSyncService.js';
import { SyncScheduler } from './services/SyncScheduler.js';

config();

export interface AppConfig {
  iCloud: PhotoSyncConfig;
  frame: FrameConfig;
  syncIntervalSeconds: number;
  logLevel: string;
}

export class Application {
  private logger: Logger;
  private frameManager: FrameManager;
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

    this.frameManager = new FrameManager(config.frame, frameLogger);
    this.photoSyncService = new PhotoSyncService(
      config.iCloud,
      this.frameManager.getClient(),
      iCloudLogger,
    );

    this.syncScheduler = new SyncScheduler(
      () => this.photoSyncService.syncPhotos(),
      { intervalSeconds: config.syncIntervalSeconds },
      this.logger,
    );

    this.setupSignalHandlers();
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting iCloud Frame Sync application...');

      // Initialize Frame
      await this.frameManager.initialize();

      // Initialize Photo Sync Service
      await this.photoSyncService.authenticate();
      await this.photoSyncService.initializePhotosService(
        this.config.iCloud.sourceAlbum,
      );

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
    await this.frameManager.close();

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

  getFrameManager(): FrameManager {
    return this.frameManager;
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
      dataDirectory: './data',
    },
    frame: {
      host: process.env.SAMSUNG_FRAME_HOST!,
      name: 'SamsungTv',
      services: ['art-mode', 'device', 'remote-control'],
      verbosity: Number(process.env.SAMSUNG_FRAME_VERBOSITY || 0),
    },
    syncIntervalSeconds: Number(process.env.ICLOUD_SYNC_INTERVAL || 60),
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
