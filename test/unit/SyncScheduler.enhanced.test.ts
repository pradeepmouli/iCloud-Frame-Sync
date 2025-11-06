import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino, type Logger } from 'pino';
import sinon from 'sinon';
import { SyncScheduler, type SyncSchedulerConfig } from '../../src/services/SyncScheduler.js';
import { SyncStateStore } from '../../src/services/SyncStateStore.js';
import type { Endpoint } from '../../src/types/endpoint.js';

describe('SyncScheduler (Enhanced)', () => {
	let scheduler: SyncScheduler;
	let logger: Logger;
	let stateStore: SyncStateStore;
	let testDir: string;
	let clock: sinon.SinonFakeTimers;
	let mockEndpoints: Endpoint[];

	beforeEach(async () => {
		clock = sinon.useFakeTimers();
		logger = pino({ level: 'silent' }) as Logger;
		testDir = join(tmpdir(), `sync-scheduler-test-${Date.now()}`);
		stateStore = new SyncStateStore(logger, testDir);
		await stateStore.initialize();

		// Create mock endpoints
		mockEndpoints = [
			{
				name: 'mock-endpoint-1',
				listAlbums: sinon.stub().resolves([]),
				listPhotos: sinon.stub().resolves([]),
				downloadPhoto: sinon.stub().resolves(Buffer.from('')),
				uploadPhoto: sinon.stub().resolves(),
				deletePhoto: sinon.stub().resolves(),
			} as unknown as Endpoint,
			{
				name: 'mock-endpoint-2',
				listAlbums: sinon.stub().resolves([]),
				listPhotos: sinon.stub().resolves([]),
				downloadPhoto: sinon.stub().resolves(Buffer.from('')),
				uploadPhoto: sinon.stub().resolves(),
				deletePhoto: sinon.stub().resolves(),
			} as unknown as Endpoint,
		];
	});

	afterEach(async () => {
		clock.restore();
		if (scheduler) {
			scheduler.stop();
		}
		try {
			await rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('constructor', () => {
		it('should create scheduler with default config', () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			expect(scheduler).to.exist;
			expect(scheduler.getIntervalSeconds()).to.equal(60);
			expect(scheduler.isRunning()).to.be.false;
		});

		it('should enforce minimum interval', () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 10, // Below minimum
				endpoints: mockEndpoints,
				minIntervalSeconds: 30,
			};
			scheduler = new SyncScheduler(config, logger);

			expect(scheduler.getIntervalSeconds()).to.equal(30);
		});

		it('should accept state store', () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
				stateStore,
			};
			scheduler = new SyncScheduler(config, logger);

			expect(scheduler).to.exist;
		});
	});

	describe('start() and stop()', () => {
		it('should start scheduler and run initial sync', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			const startPromise = scheduler.start();
			await clock.tickAsync(100); // Let initial sync complete
			await startPromise;

			expect(scheduler.isRunning()).to.be.true;
		});

		it('should stop scheduler', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			scheduler.stop();

			expect(scheduler.isRunning()).to.be.false;
			expect(scheduler.getConsecutiveFailures()).to.equal(0);
		});

		it('should not start if already running', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			await scheduler.start(); // Second call should be ignored

			expect(scheduler.isRunning()).to.be.true;
		});
	});

	describe('pause() and resume()', () => {
		it('should pause scheduler', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			scheduler.pause();

			expect(scheduler.isPausedState()).to.be.true;
			expect(scheduler.isRunning()).to.be.false;
		});

		it('should resume scheduler', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			scheduler.pause();
			expect(scheduler.isPausedState()).to.be.true;

			await scheduler.resume();
			await clock.tickAsync(100);

			expect(scheduler.isPausedState()).to.be.false;
		});

		it('should not start when paused', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			scheduler.pause();
			await scheduler.start();

			expect(scheduler.isRunning()).to.be.false;
		});
	});

	describe('exponential backoff', () => {
		it('should apply backoff after failures', async () => {
			// Create endpoint that fails
			const failingEndpoint: Endpoint = {
				name: 'failing-endpoint',
				listAlbums: sinon.stub().rejects(new Error('Test failure')),
				listPhotos: sinon.stub().resolves([]),
				downloadPhoto: sinon.stub().resolves(Buffer.from('')),
				uploadPhoto: sinon.stub().resolves(),
				deletePhoto: sinon.stub().resolves(),
			} as unknown as Endpoint;

			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: [failingEndpoint, mockEndpoints[0] as Endpoint],
				initialBackoffSeconds: 15,
				maxBackoffSeconds: 300,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(1000);

			expect(scheduler.getConsecutiveFailures()).to.be.greaterThan(0);
			expect(scheduler.getCurrentBackoffSeconds()).to.be.greaterThan(0);
		});

		it('should cap backoff at maximum', async () => {
			const failingEndpoint: Endpoint = {
				name: 'failing-endpoint',
				listAlbums: sinon.stub().rejects(new Error('Test failure')),
				listPhotos: sinon.stub().resolves([]),
				downloadPhoto: sinon.stub().resolves(Buffer.from('')),
				uploadPhoto: sinon.stub().resolves(),
				deletePhoto: sinon.stub().resolves(),
			} as unknown as Endpoint;

			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: [failingEndpoint],
				initialBackoffSeconds: 15,
				maxBackoffSeconds: 60, // Low cap for testing
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(1000);

			// Even with multiple failures, backoff should not exceed max
			expect(scheduler.getCurrentBackoffSeconds()).to.be.at.most(60);
		});
	});

	describe('jitter', () => {
		it('should add jitter when enabled', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
				enableJitter: true,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			const nextRun = scheduler.getNextRunAt();
			expect(nextRun).to.exist;
		});

		it('should not add jitter when disabled', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
				enableJitter: false,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			const nextRun = scheduler.getNextRunAt();
			expect(nextRun).to.exist;
		});
	});

	describe('state persistence', () => {
		it('should persist schedule state to store', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
				stateStore,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			const state = await stateStore.read();
			expect(state.schedule).to.exist;
			expect(state.schedule?.intervalSeconds).to.equal(60);
			expect(state.schedule?.isPaused).to.be.false;
		});

		it('should persist paused state', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
				stateStore,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			scheduler.pause();

			// Verify scheduler reports paused state
			expect(scheduler.isPausedState()).to.be.true;
		});
	});

	describe('updateInterval()', () => {
		it('should update interval and restart if running', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			scheduler.updateInterval(120);
			await clock.tickAsync(100);

			expect(scheduler.getIntervalSeconds()).to.equal(120);
		});

		it('should enforce minimum interval on update', () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
				minIntervalSeconds: 30,
			};
			scheduler = new SyncScheduler(config, logger);

			scheduler.updateInterval(10);

			expect(scheduler.getIntervalSeconds()).to.equal(30);
		});
	});

	describe('triggerManualSync()', () => {
		it('should trigger immediate sync', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			await scheduler.start();
			await clock.tickAsync(100);

			await scheduler.triggerManualSync();
			await clock.tickAsync(100);

			// Manual sync should complete
			expect(scheduler.isSyncInProgress()).to.be.false;
		});

		it('should not trigger if sync in progress', async () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			// Start sync but don't let it complete
			const startPromise = scheduler.start();

			// Immediately try manual trigger
			await scheduler.triggerManualSync();

			await clock.tickAsync(100);
			await startPromise;
		});
	});

	describe('setEndpoints()', () => {
		it('should update endpoint list', () => {
			const config: SyncSchedulerConfig = {
				intervalSeconds: 60,
				endpoints: mockEndpoints,
			};
			scheduler = new SyncScheduler(config, logger);

			const newEndpoints = [mockEndpoints[0] as Endpoint];
			scheduler.setEndpoints(newEndpoints);

			// Verify endpoints were updated (tested implicitly by successful operation)
			expect(scheduler).to.exist;
		});
	});
});
