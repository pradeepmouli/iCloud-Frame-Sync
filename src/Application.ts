import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
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
	private sigintHandler?: NodeJS.SignalsListener;
	private sigtermHandler?: NodeJS.SignalsListener;
	private forceExitController?: AbortController;
	private signalHandlersRegistered = false;
	private isStopping = false;
	private hasStopped = false;

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
		this.logger.info('Starting iCloud Frame Sync application...');

		try {
			await this.photoSyncService.initialize();
		} catch (error) {
			this.logger.error({ error }, 'Photo sync service failed to initialize. Continuing in setup mode.');
			return;
		}

		if (!this.photoSyncService.isReady()) {
			this.logger.warn('Photo sync service not ready. Application running in setup mode.');
			return;
		}

		try {
			await this.syncScheduler.start();
		} catch (error) {
			this.logger.error({ error }, 'Failed to start sync scheduler');
			throw error;
		}

		this.logger.info('Application started successfully');
	}

	async stop(): Promise<void> {
		if (this.hasStopped) {
			return;
		}

		if (this.isStopping) {
			return;
		}

		this.isStopping = true;
		this.logger.info('Stopping application...');

		try {
			this.syncScheduler.stop();
			await this.photoSyncService.close();
			this.hasStopped = true;
			this.logger.info('Application stopped');
		} catch (error) {
			this.logger.error({ error }, 'Failed to stop application cleanly');
			throw error;
		} finally {
			this.cleanupSignalHandlers();
			this.isStopping = false;
		}
	}

	private setupSignalHandlers(): void {
		if (this.signalHandlersRegistered) {
			return;
		}

		this.forceExitController = new AbortController();
		const { signal } = this.forceExitController;

		this.sigintHandler = async (_signal) => {
			this.logger.info('SIGINT received, closing connection...');
			setTimeout(5000, undefined, { signal }).then(() => {
				this.logger.info('Force closing connection...');
				process.exit(1);
			}).catch((error) => {
				if (error?.name !== 'AbortError') {
					this.logger.error({ error }, 'Force close timer failed');
				}
			});
			try {
				await this.stop();
				process.exit(0);
			} catch (error) {
				this.logger.error({ error }, 'Error while stopping after SIGINT');
				process.exit(1);
			}
		};

		this.sigtermHandler = async (_signal) => {
			this.logger.info('SIGTERM received, closing connection...');
			try {
				await this.stop();
				process.exit(0);
			} catch (error) {
				this.logger.error({ error }, 'Error while stopping after SIGTERM');
				process.exit(1);
			}
		};

		process.once('SIGINT', this.sigintHandler);
		process.once('SIGTERM', this.sigtermHandler);
		this.signalHandlersRegistered = true;
	}

	private cleanupSignalHandlers(): void {
		if (!this.signalHandlersRegistered) {
			return;
		}

		if (this.sigintHandler) {
			process.off('SIGINT', this.sigintHandler);
		}
		if (this.sigtermHandler) {
			process.off('SIGTERM', this.sigtermHandler);
		}
		if (this.forceExitController) {
			this.forceExitController.abort();
			this.forceExitController = undefined;
		}
		this.signalHandlersRegistered = false;
	}

	getPhotoSyncService(): PhotoSyncService {
		return this.photoSyncService;
	}

	getSyncScheduler(): SyncScheduler {
		return this.syncScheduler;
	}

	getLogger(): Logger {
		return this.logger;
	}
}
