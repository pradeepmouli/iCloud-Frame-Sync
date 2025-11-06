import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import '../helpers/setup.js';
import { expect } from '../helpers/setup.js';

describe('Integration: CLI Smoke Tests', () => {
	const require = createRequire(path.resolve(process.cwd(), 'test/integration/application-cli.test.ts'));
	const tsxCli = require.resolve('tsx/cli');
	const cliEntrypoint = path.resolve(process.cwd(), 'src/cli/commands.ts');

	const tempRoot = mkdtempSync(path.join(tmpdir(), 'cli-runtime-'));
	const runtimeDir = path.join(tempRoot, '.icloud-frame-sync');
	const runtimePath = path.join(runtimeDir, 'runtime.json');

	function runCli(command: string, ...args: string[]): SpawnSyncReturns<string> {
		return spawnSync(
			process.execPath,
			[tsxCli, cliEntrypoint, command, ...args],
			{
				encoding: 'utf8',
				env: {
					...process.env,
					NODE_ENV: 'test',
					CLI_TEST_MODE: 'true',
					HOME: tempRoot,
					USERPROFILE: tempRoot,
				},
			},
		);
	}

	function readRuntimeFile(): { pid: number; startedAt: string; mode?: string; } {
		const content = readFileSync(runtimePath, 'utf8');
		return JSON.parse(content) as { pid: number; startedAt: string; mode?: string; };
	}

	function cleanupRuntime(): void {
		rmSync(runtimeDir, { recursive: true, force: true });
	}

	afterEach(() => {
		cleanupRuntime();
	});

	after(() => {
		rmSync(tempRoot, { recursive: true, force: true });
	});

	it('sync:start writes runtime metadata in mock environment', () => {
		cleanupRuntime();
		const result = runCli('sync:start');

		expect(result.status).to.equal(0);
		expect(result.stderr).to.equal('');
		expect(result.stdout).to.contain('Sync service started successfully (mock mode).');
		expect(existsSync(runtimePath)).to.be.true;
		const runtime = readRuntimeFile();
		expect(runtime.mode).to.equal('mock');
		expect(runtime.pid).to.equal(-1);
		expect(new Date(runtime.startedAt).toString()).to.not.equal('Invalid Date');

		const secondStart = runCli('sync:start');
		expect(secondStart.status).to.equal(0);
		expect(secondStart.stdout).to.contain('Sync service already running (PID -1).');
	});

	it('sync:status reports running state after start', () => {
		cleanupRuntime();
		runCli('sync:start');
		const statusResult = runCli('sync:status');

		expect(statusResult.status).to.equal(0);
		expect(statusResult.stderr).to.equal('');
		expect(statusResult.stdout).to.match(/running \(mock\).*started at/);
	});

	it('sync:stop clears runtime metadata and is idempotent', () => {
		cleanupRuntime();
		runCli('sync:start');
		const stopResult = runCli('sync:stop');

		expect(stopResult.status).to.equal(0);
		expect(stopResult.stderr).to.equal('');
		expect(stopResult.stdout).to.contain('Sync service stopped successfully.');
		expect(existsSync(runtimePath)).to.be.false;

		const secondStop = runCli('sync:stop');
		expect(secondStop.status).to.equal(0);
		expect(secondStop.stdout).to.contain('already stopped');
	});

	it('sync:status reports stopped state when no runtime exists', () => {
		cleanupRuntime();
		const statusResult = runCli('sync:status');

		expect(statusResult.status).to.equal(0);
		expect(statusResult.stderr).to.equal('');
		expect(statusResult.stdout.trim()).to.equal('Sync service status: stopped.');
	});
});
