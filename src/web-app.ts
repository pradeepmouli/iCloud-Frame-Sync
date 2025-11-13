import process from 'node:process';

import { Application } from './Application.js';
import { createAppConfigFromEnv } from './config/environment.js';
import { createComponentLogger, createLogger } from './observability/logger.js';
import { ConnectionTesterService } from './services/ConnectionTester.js';
import { FrameDashboardService } from './services/FrameDashboardService.js';
import { SyncStateService } from './services/SyncStateService.js';
import type { WebServerConfig } from './web-server.js';
import { createWebServer } from './web-server.js';

const suppressedAuthMessage = 'Invalid status code: 403';

const bootstrapLogger = createLogger({ level: 'warn' });

process.on('unhandledRejection', (reason) => {
	if (reason instanceof Error && reason.message.includes(suppressedAuthMessage)) {
		bootstrapLogger.warn({ error: reason.message }, 'Suppressed iCloud authentication rejection while in setup mode');
		return;
	}
	// Log but don't exit - allows server to continue in setup mode
	const errorDetails = reason instanceof Error
		? { message: reason.message, stack: reason.stack, name: reason.name }
		: { raw: reason };
	bootstrapLogger.warn({ reason: errorDetails }, 'Unhandled promise rejection (non-fatal in setup mode)');
});

process.on('uncaughtException', (error) => {
	if (error instanceof Error && error.message.includes(suppressedAuthMessage)) {
		bootstrapLogger.warn({ error: error.message }, 'Suppressed iCloud authentication exception while in setup mode');
		return;
	}
	bootstrapLogger.error({ error }, 'Uncaught exception');
	process.exit(1);
});

async function main(): Promise<void> {
	try {
		const appConfig = createAppConfigFromEnv();
		const logger = createLogger({ level: appConfig.logLevel });
		
		// Create SyncStateService early so it can be passed to both Application and web server
		const syncStateService = new SyncStateService(logger);
		await syncStateService.initialize();
		
		const application = new Application(appConfig);
		await application.start();

		const photoSyncService = application.getPhotoSyncService();
		
		// Wire up SyncStateService to PhotoSyncService for real-time updates
		photoSyncService.setSyncStateService(syncStateService);
		
		const syncScheduler = application.getSyncScheduler();
		
		// Wire up SyncStateService to SyncScheduler for real-time updates
		syncScheduler.setSyncStateService(syncStateService);
		
		const stateStore = photoSyncService.getStateStore();
		const frameDashboardService = new FrameDashboardService(
			photoSyncService.frame,
			stateStore,
			createComponentLogger(application.getLogger(), 'FrameDashboardService'),
		);

		const webServerConfig: WebServerConfig = {
			port: appConfig.webPort ?? Number.parseInt(process.env.WEB_PORT ?? '3001', 10),
			corsOrigin: appConfig.corsOrigin,
			logLevel: appConfig.logLevel as WebServerConfig['logLevel'],
		};

		const webServerLogger = createComponentLogger(application.getLogger(), 'WebServer');
		const connectionTesterLogger = createComponentLogger(application.getLogger(), 'ConnectionTester');

		const connectionTester = new ConnectionTesterService({
			logger: connectionTesterLogger,
			defaultAlbum: photoSyncService.getCurrentSettings()?.syncAlbumName ?? undefined,
		});

		const app = await createWebServer({
			config: webServerConfig,
			stateStore,
			photoSyncService,
			frameDashboardService,
			syncScheduler,
			syncStateService,
			logger: webServerLogger,
			connectionTester,
		});

		const server = app.listen(webServerConfig.port, () => {
			webServerLogger.info({ port: webServerConfig.port }, 'Web server listening');
		});

		const shutdown = async (): Promise<void> => {
			const closeServer = (): Promise<void> =>
				new Promise((resolve, reject) => {
					server.close((error) => {
						if (error) {
							reject(error);
						} else {
							resolve();
						}
					});
				});

			try {
				await closeServer();
				await application.stop();
				process.exit(0);
			} catch (shutdownError) {
				console.error('Error while shutting down application', shutdownError);
				process.exit(1);
			}
		};

		process.once('SIGINT', shutdown);
		process.once('SIGTERM', shutdown);
	} catch (error) {
		console.error('Failed to start web server application', error);
		process.exit(1);
	}
}

void main();
