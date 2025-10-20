import { setTimeout } from 'node:timers/promises';
import process from 'node:process';
import type { Logger } from 'pino';

import { createAppConfigFromEnv, type AppConfig } from './config/environment.js';
import { createComponentLogger, createLogger } from './observability/logger.js';
import { PhotoSyncService } from './services/PhotoSyncService.js';
import { SyncScheduler } from './services/SyncScheduler.js';

export class Application {
	private logger: Logger;
	//private frameManager: FrameManager;
	private photoSyncService: PhotoSyncService;
	private syncScheduler: SyncScheduler;
	private config: AppConfig;

	constructor (
		config: AppConfig,
		overrides?: {
			photoSyncService?: PhotoSyncService,
			syncScheduler?: SyncScheduler,
			frameEndpoint?: any,
			iCloudEndpoint?: any,
			stateStore?: any,
			logger?: any,
		}
	) {
		this.config = config;
		this.logger = overrides?.logger ?? createLogger({ level: config.logLevel });
		const frameLogger = createComponentLogger(this.logger, 'Samsung Frame Client');
		const iCloudLogger = createComponentLogger(this.logger, 'iCloud Client');
		if (overrides?.photoSyncService) {
			this.photoSyncService = overrides.photoSyncService;
		} else {
			this.photoSyncService = new PhotoSyncService(
				config,
				this.logger,
				{
					frameEndpoint: overrides?.frameEndpoint,
					iCloudEndpoint: overrides?.iCloudEndpoint,
					stateStore: overrides?.stateStore,
				}
			);
		}
		if (overrides?.syncScheduler) {
			this.syncScheduler = overrides.syncScheduler;
		} else {
			this.syncScheduler = new SyncScheduler(
				{
					intervalSeconds: config.syncIntervalSeconds,
					endpoints: [this.photoSyncService.iCloud, this.photoSyncService.frame],
				},
				this.logger,
			);
		}
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
			this.logger.error({ error }, 'Failed to start application');
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
