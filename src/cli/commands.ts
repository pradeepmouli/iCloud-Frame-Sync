import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Command, CommanderError } from 'commander';

import {
	clearRuntime,
	getActiveRuntime,
	getRuntimePath,
	isProcessActive,
	readRuntime,
	RuntimeMetadata,
	writeRuntime,
} from './runtime.js';

const require = createRequire(import.meta.url);
const serviceRunnerModuleUrl = new URL('./service-runner.js', import.meta.url);
const compiledServiceRunnerPath = fileURLToPath(serviceRunnerModuleUrl);
const sourceServiceRunnerPath = compiledServiceRunnerPath.replace(/\.js$/, '.ts');
const isTestEnvironment = process.env.NODE_ENV === 'test' && process.env.CLI_TEST_MODE !== 'false';

let cachedTsxCli: string | null = null;

function resolveTsxCli(): string {
	if (cachedTsxCli) {
		return cachedTsxCli;
	}
	try {
		cachedTsxCli = require.resolve('tsx/cli');
		return cachedTsxCli;
	} catch (error) {
		throw new Error(
			'Unable to locate tsx runtime. Please install development dependencies or build the project before running the CLI from source.',
		);
	}
}

async function spawnService(): Promise<number> {
	const runnerArgs = (() => {
		if (existsSync(compiledServiceRunnerPath)) {
			return [compiledServiceRunnerPath];
		}
		if (existsSync(sourceServiceRunnerPath)) {
			return [resolveTsxCli(), sourceServiceRunnerPath];
		}
		throw new Error('Unable to resolve service runner entrypoint. Have you run `pnpm run build`?');
	})();

	return await new Promise<number>((resolve, reject) => {
		const child = spawn(
			process.execPath,
			runnerArgs,
			{
				detached: true,
				stdio: 'ignore',
				env: {
					...process.env,
					NODE_ENV: process.env.NODE_ENV ?? 'production',
				},
			},
		);

		let settled = false;
		let confirmationTimer: NodeJS.Timeout | null = null;

		const cleanup = () => {
			if (confirmationTimer) {
				clearTimeout(confirmationTimer);
				confirmationTimer = null;
			}
			child.removeListener('error', onError);
			child.removeListener('exit', onExit);
		};

		const onError = (error: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			reject(error);
		};

		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			reject(new Error(`Sync service exited before confirmation (code ${code ?? 'null'}, signal ${signal ?? 'none'})`));
		};

		child.once('error', onError);
		child.once('exit', onExit);

		child.once('spawn', () => {
			if (!child.pid) {
				onError(new Error('Failed to retrieve child process PID'));
				return;
			}

			confirmationTimer = setTimeout(() => {
				if (settled) {
					return;
				}
				settled = true;
				cleanup();
				child.unref();
				resolve(child.pid!);
			}, 300);
		});
	});
}

async function handleStart(): Promise<void> {
	const runtime = await getActiveRuntime();
	if (runtime) {
		console.log(`Sync service already running (PID ${runtime.pid}).`);
		return;
	}

	if (isTestEnvironment) {
		const mockRuntime: RuntimeMetadata = {
			pid: -1,
			startedAt: new Date().toISOString(),
			mode: 'mock',
		};
		await writeRuntime(mockRuntime);
		console.log('Sync service started successfully (mock mode).');
		console.log(`Runtime metadata stored at ${getRuntimePath()}`);
		return;
	}

	const pid = await spawnService();
	await writeRuntime({ pid, startedAt: new Date().toISOString(), mode: 'service' });
	console.log(`Sync service started successfully (PID ${pid}).`);
	console.log(`Runtime metadata stored at ${getRuntimePath()}`);
}

async function handleStatus(): Promise<void> {
	const runtime = await readRuntime();
	if (!runtime) {
		console.log('Sync service status: stopped.');
		return;
	}

	if (runtime.mode === 'mock' || runtime.pid <= 0) {
		console.log(`Sync service status: running (mock), started at ${runtime.startedAt}.`);
		return;
	}

	if (!isProcessActive(runtime.pid)) {
		await clearRuntime();
		console.log('Sync service status: stopped.');
		return;
	}

	console.log(
		`Sync service status: running (PID ${runtime.pid}), started at ${runtime.startedAt}.`,
	);
}

async function waitForExit(pid: number, timeoutMs = 5000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isProcessActive(pid)) {
			return true;
		}
		await wait(150);
	}
	return !isProcessActive(pid);
}

async function handleStop(): Promise<void> {
	const runtime = await readRuntime();
	if (!runtime) {
		console.log('Sync service stopped successfully (already stopped).');
		return;
	}

	if (runtime.mode === 'mock' || runtime.pid <= 0) {
		await clearRuntime();
		console.log('Sync service stopped successfully.');
		return;
	}

	if (!isProcessActive(runtime.pid)) {
		await clearRuntime();
		console.log('Sync service stopped successfully (stale runtime metadata cleared).');
		return;
	}

	try {
		process.kill(runtime.pid, 'SIGTERM');
	} catch (error) {
		console.error('Failed to send stop signal to sync service:', error);
		process.exitCode = 1;
		return;
	}

	const exited = await waitForExit(runtime.pid, 5000);
	if (!exited) {
		try {
			process.kill(runtime.pid, 'SIGKILL');
		} catch (error) {
			console.error('Failed to terminate sync service forcefully:', error);
			process.exitCode = 1;
			return;
		}

		const forcedExit = await waitForExit(runtime.pid, 2000);
		if (!forcedExit) {
			console.error('Sync service did not terminate after SIGKILL.');
			process.exitCode = 1;
			return;
		}
	}

	await clearRuntime();
	console.log('Sync service stopped successfully.');
}

export function buildCli(): Command {
	const program = new Command();
	program
		.name('icloud-frame-sync')
		.description('Control the iCloud Frame Sync background service.')
		.showHelpAfterError();

	program
		.command('sync:start')
		.description('Start the sync service in the background.')
		.action(async () => {
			await handleStart();
		});

	program
		.command('sync:status')
		.description('Display current sync service status.')
		.action(async () => {
			await handleStatus();
		});

	program
		.command('sync:stop')
		.description('Stop the sync service if it is running.')
		.action(async () => {
			await handleStop();
		});

	program.addHelpText('after', '\nExamples:\n  icloud-frame-sync sync:start\n  icloud-frame-sync sync:status\n  icloud-frame-sync sync:stop');

	return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
	const program = buildCli();
	program.exitOverride();

	if (argv.length <= 2) {
		program.outputHelp();
		process.exitCode = 1;
		return;
	}

	try {
		await program.parseAsync(argv);
	} catch (error) {
		if (error instanceof CommanderError) {
			if (error.code === 'commander.helpDisplayed') {
				return;
			}

			if (error.code === 'commander.unknownCommand') {
				console.error(error.message);
				program.outputHelp();
			}

			if (error.exitCode !== 0) {
				process.exitCode = error.exitCode ?? 1;
			}
			return;
		}

		console.error('CLI execution failed:', error);
		process.exitCode = 1;
	}
}

async function main(): Promise<void> {
	const entryHref = process.argv[1]
		? pathToFileURL(process.argv[1]).href
		: '';
	if (import.meta.url === entryHref) {
		await runCli(process.argv);
	}
}

void main();
