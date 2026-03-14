/**
 * Unit tests for SyncStateService
 *
 * Tests the sync state management and event emission including:
 * - State initialization
 * - State transitions
 * - Progress tracking
 * - Event emission
 * - Database persistence
 */
import '../helpers/setup.js';
import { EventEmitter } from 'events';
import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import pino from 'pino';
import { prisma } from '../../src/lib/prisma.js';
import { SyncStateService } from '../../src/services/SyncStateService.js';
import type { SyncStateEvent } from '../../src/services/SyncStateService.js';

describe('SyncStateService', () => {
	let service: SyncStateService;
	let logger: pino.Logger;

	beforeEach(async () => {
		// Create silent logger for tests
		logger = pino({ level: 'silent' });
		
		// Clean up any existing sync state
		await prisma.syncState.deleteMany({});
		
		// Create service
		service = new SyncStateService(logger);
		await service.initialize();
	});

	afterEach(async () => {
		// Clean up after each test
		await prisma.syncState.deleteMany({});
	});

	describe('initialization', () => {
		it('should initialize with idle state', async () => {
			const state = service.getState();

			expect(state.status).to.equal('idle');
			expect(state.progressPercent).to.equal(0);
			expect(state.photosProcessed).to.equal(0);
			expect(state.photosTotal).to.equal(0);
			expect(state.photosFailed).to.equal(0);
			expect(state.photosSkipped).to.equal(0);
		});

		it('should create database record on initialization', async () => {
			const dbState = await prisma.syncState.findFirst();

			expect(dbState).to.not.be.null;
			expect(dbState?.status).to.equal('idle');
		});

		it('should load existing state from database', async () => {
			// Clean up and create a state with specific values
			await prisma.syncState.deleteMany({});
			await prisma.syncState.create({
				data: {
					status: 'running',
					progressPercent: 50,
					photosProcessed: 5,
					photosTotal: 10,
					photosFailed: 1,
					photosSkipped: 2,
				},
			});

			// Create new service to test loading
			const newService = new SyncStateService(logger);
			await newService.initialize();
			const state = newService.getState();

			expect(state.status).to.equal('running');
			expect(state.progressPercent).to.equal(50);
			expect(state.photosProcessed).to.equal(5);
			expect(state.photosTotal).to.equal(10);
			expect(state.photosFailed).to.equal(1);
			expect(state.photosSkipped).to.equal(2);
		});
	});

	describe('startSync', () => {
		it('should transition to running state', async () => {
			await service.startSync(100);
			const state = service.getState();

			expect(state.status).to.equal('running');
			expect(state.photosTotal).to.equal(100);
			expect(state.photosProcessed).to.equal(0);
			expect(state.progressPercent).to.equal(0);
			expect(state.sessionStartedAt).to.be.instanceOf(Date);
		});

		it('should emit stateChange event', async () => {
			// Set up listener before calling method
			const eventPromise = new Promise<SyncStateEvent>((resolve) => {
				service.once('stateChange', resolve);
			});

			await service.startSync(50);
			
			const event = await eventPromise;
			// startSync sets photosProcessed=0, which triggers 'progress' event type
			expect(event.type).to.equal('progress');
			expect(event.state.status).to.equal('running');
		});

		it('should persist state to database', async () => {
			await service.startSync(75);
			
			const dbState = await prisma.syncState.findFirst();
			expect(dbState?.status).to.equal('running');
			expect(dbState?.photosTotal).to.equal(75);
		});
	});

	describe('updateProgress', () => {
		beforeEach(async () => {
			await service.startSync(100);
		});

		it('should update progress counters', async () => {
			await service.updateProgress(25, 2, 3, 'photo-123');
			const state = service.getState();

			expect(state.photosProcessed).to.equal(25);
			expect(state.photosFailed).to.equal(2);
			expect(state.photosSkipped).to.equal(3);
			expect(state.currentPhotoId).to.equal('photo-123');
			expect(state.progressPercent).to.equal(25); // 25/100 = 25%
		});

		it('should calculate progress percentage correctly', async () => {
			await service.updateProgress(50, 0, 0);
			const state = service.getState();

			expect(state.progressPercent).to.equal(50);
		});

		it('should emit progress event', (done) => {
			service.once('stateChange', (event: SyncStateEvent) => {
				if (event.type === 'progress') {
					expect(event.state.photosProcessed).to.equal(10);
					done();
				}
			});

			service.updateProgress(10, 0, 0);
		});

		it('should handle zero total photos gracefully', async () => {
			await service.startSync(0);
			await service.updateProgress(0, 0, 0);
			const state = service.getState();

			expect(state.progressPercent).to.equal(0);
		});
	});

	describe('completeSync', () => {
		beforeEach(async () => {
			await service.startSync(50);
			await service.updateProgress(45, 2, 3);
		});

		it('should transition to completed state on success', async () => {
			await service.completeSync(true);
			const state = service.getState();

			expect(state.status).to.equal('completed');
			expect(state.progressPercent).to.equal(100);
			expect(state.sessionEndedAt).to.be.instanceOf(Date);
			expect(state.lastError).to.be.undefined;
		});

		it('should transition to error state on failure', async () => {
			await service.completeSync(false, 'Network timeout');
			const state = service.getState();

			expect(state.status).to.equal('error');
			expect(state.lastError).to.equal('Network timeout');
			expect(state.lastErrorAt).to.be.instanceOf(Date);
		});

		it('should emit complete event on success', (done) => {
			service.once('stateChange', (event: SyncStateEvent) => {
				if (event.type === 'complete') {
					expect(event.state.status).to.equal('completed');
					done();
				}
			});

			service.completeSync(true);
		});

		it('should emit error event on failure', (done) => {
			service.once('stateChange', (event: SyncStateEvent) => {
				if (event.type === 'error') {
					expect(event.state.status).to.equal('error');
					expect(event.state.lastError).to.equal('Test error');
					done();
				}
			});

			service.completeSync(false, 'Test error');
		});

		it('should reset to idle after delay', async function() {
			this.timeout(5000); // Increase timeout for this test
			
			await service.completeSync(true);
			
			// Wait for the timeout to reset to idle
			await new Promise(resolve => setTimeout(resolve, 3500));
			
			const state = service.getState();
			expect(state.status).to.equal('idle');
		});
	});

	describe('stopSync', () => {
		beforeEach(async () => {
			await service.startSync(100);
			await service.updateProgress(50, 5, 10);
		});

		it('should reset state to idle', async () => {
			await service.stopSync();
			const state = service.getState();

			expect(state.status).to.equal('idle');
			expect(state.photosProcessed).to.equal(0);
			expect(state.photosTotal).to.equal(0);
			expect(state.photosFailed).to.equal(0);
			expect(state.photosSkipped).to.equal(0);
			expect(state.progressPercent).to.equal(0);
			expect(state.currentPhotoId).to.be.undefined;
		});

		it('should persist reset state to database', async () => {
			await service.stopSync();
			
			const dbState = await prisma.syncState.findFirst();
			expect(dbState?.status).to.equal('idle');
			expect(dbState?.photosProcessed).to.equal(0);
		});
	});

	describe('reportError', () => {
		it('should set error state with message', async () => {
			await service.reportError('Connection failed');
			const state = service.getState();

			expect(state.status).to.equal('error');
			expect(state.lastError).to.equal('Connection failed');
			expect(state.lastErrorAt).to.be.instanceOf(Date);
		});

		it('should persist error to database', async () => {
			await service.reportError('Database error');
			
			const dbState = await prisma.syncState.findFirst();
			expect(dbState?.status).to.equal('error');
			expect(dbState?.lastError).to.equal('Database error');
		});
	});

	describe('state queries', () => {
		it('should correctly report running state', async () => {
			await service.startSync(10);
			expect(service.isRunning()).to.be.true;
			expect(service.isIdle()).to.be.false;
			expect(service.isPaused()).to.be.false;
		});

		it('should correctly report idle state', () => {
			expect(service.isIdle()).to.be.true;
			expect(service.isRunning()).to.be.false;
			expect(service.isPaused()).to.be.false;
		});

		it('should correctly report paused state', async () => {
			await service.pauseSync();
			expect(service.isPaused()).to.be.true;
			expect(service.isRunning()).to.be.false;
			expect(service.isIdle()).to.be.false;
		});
	});

	describe('event emission', () => {
		it('should be an EventEmitter', () => {
			expect(service).to.be.instanceOf(EventEmitter);
		});

		it('should emit events with timestamp', (done) => {
			service.once('stateChange', (event: SyncStateEvent) => {
				expect(event.timestamp).to.be.instanceOf(Date);
				done();
			});

			service.startSync(10);
		});

		it('should allow multiple listeners', async () => {
			let listener1Called = false;
			let listener2Called = false;

			service.once('stateChange', () => { listener1Called = true; });
			service.once('stateChange', () => { listener2Called = true; });

			await service.startSync(10);
			
			// Give time for async event emission
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(listener1Called).to.be.true;
			expect(listener2Called).to.be.true;
		});
	});
});
