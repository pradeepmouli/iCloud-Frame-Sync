import process from 'node:process';

import { Application } from './Application.js';
import { createAppConfigFromEnv } from './config/environment.js';

async function maybeHandleCli(argv: string[] = process.argv): Promise<boolean> {
	if (argv.length <= 2) {
		return false;
	}

	const commandToken = argv[2] ?? '';
	try {
		if (!commandToken) {
			return false;
		}

		const { runCli } = await import('./cli/commands.js');
		await runCli(argv);
	} catch (error) {
		console.error('Failed to execute CLI command:', error);
		process.exit(1);
	}

	return true;
}

export async function startApplication(): Promise<void> {
	const config = createAppConfigFromEnv();
	const app = new Application(config);
	await app.start();
}

async function main(): Promise<void> {
	if (await maybeHandleCli()) {
		return;
	}

	try {
		await startApplication();
	} catch (error) {
		console.error('Failed to start application:', error);
		process.exit(1);
	}
}

void main();
