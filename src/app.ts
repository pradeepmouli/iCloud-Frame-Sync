import { Application } from './Application.js';
import { createAppConfigFromEnv } from './config/environment.js';
import process from 'node:process';

async function main() {
	try {
		const config = createAppConfigFromEnv();
		const app = new Application(config);
		await app.start();
	} catch (error) {
		console.error('Failed to start application:', error);
		process.exit(1);
	}
}

main();
