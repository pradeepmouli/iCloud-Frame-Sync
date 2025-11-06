import process from 'node:process';

import { Application } from '../Application.js';
import { createAppConfigFromEnv } from '../config/environment.js';

async function main(): Promise<void> {
	try {
		const config = createAppConfigFromEnv();
		const app = new Application(config);
		await app.start();
		process.on('uncaughtException', async (error) => {
			console.error('Uncaught exception in sync service:', error);
			try {
				await app.stop();
			} finally {
				process.exit(1);
			}
		});
		process.on('unhandledRejection', async (reason) => {
			console.error('Unhandled rejection in sync service:', reason);
			try {
				await app.stop();
			} finally {
				process.exit(1);
			}
		});
	} catch (error) {
		console.error('Failed to start sync service from CLI:', error);
		process.exit(1);
	}
}

void main();
