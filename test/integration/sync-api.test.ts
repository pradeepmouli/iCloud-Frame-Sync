/**
 * Integration tests for Sync API endpoints
 *
 * Tests the sync control endpoints:
 * - GET /api/sync/status
 * - GET /api/sync/status/stream (SSE)
 * - POST /api/sync/start
 * - POST /api/sync/stop
 */
import { mkdir, rm } from 'fs/promises';
import path from 'path';
import request from 'supertest';

import { prisma } from '../../src/lib/prisma.js';
import { createWebServer } from '../../src/web-server.js';
import { expect, sinon } from '../helpers/setup.js';

describe('Integration: Sync API', () => {
	const testDbPath = path.join(process.cwd(), 'test-data', 'sync-api-test.db');
	let app: any;
	let sandbox: sinon.SinonSandbox;
	let mockPhotoSyncService: any;
	let mockSyncScheduler: any;

	before(async () => {
		// Ensure test-data directory exists
		await mkdir(path.dirname(testDbPath), { recursive: true });
	});

	beforeEach(async () => {
		sandbox = sinon.createSandbox();

		// Set up test database
		process.env.DATABASE_URL = `file:${testDbPath}`;
		process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters!';

		// Clean up the database before each test
		await prisma.syncState.deleteMany({});

		// Create mock services
		const mockStateStore: any = {
			getSyncState: sandbox.stub().resolves({ status: 'idle', lastSyncedAt: null }),
			setSyncState: sandbox.stub().resolves(),
			read: sandbox.stub().resolves({ operations: {}, albums: {}, photos: {}, schedule: null }),
		};

		mockPhotoSyncService = {
			isReady: sandbox.stub().returns(true),
			sync: sandbox.stub().resolves({ success: true, photosSynced: 0 }),
			getCurrentSettings: sandbox.stub().returns({
				isConfigured: true,
				missingFields: [],
			}),
		};

		const mockFrameDashboardService: any = {
			getCurrentFrameDevice: sandbox.stub().resolves({ host: '', name: '' }),
			listArt: sandbox.stub().resolves({ items: [], total: 0 }),
		};

		mockSyncScheduler = {
			getScheduleState: sandbox.stub().returns({ interval: 300, isRunning: false }),
			start: sandbox.stub().resolves(),
			stop: sandbox.stub().resolves(),
			triggerManualSync: sandbox.stub().resolves(),
			isRunning: sandbox.stub().returns(false),
			getIntervalSeconds: sandbox.stub().returns(300),
			getNextRunAt: sandbox.stub().returns(null),
			isPausedState: sandbox.stub().returns(false),
			updateInterval: sandbox.stub(),
		};

		const config: any = {
			port: 0,
			logLevel: 'silent',
			corsOrigin: '*',
		};

		// Create web server with mocks (SyncStateService will be created internally)
		app = await createWebServer({
			config,
			stateStore: mockStateStore,
			photoSyncService: mockPhotoSyncService,
			frameDashboardService: mockFrameDashboardService,
			syncScheduler: mockSyncScheduler,
		});
	});

	afterEach(async () => {
		sandbox.restore();

		// Clean up sync state from database
		await prisma.syncState.deleteMany({});

		// Clean up test database
		try {
			await rm(testDbPath, { force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('GET /api/sync/status', () => {
		it('should return current sync state', async () => {
			const response = await request(app)
				.get('/api/sync/status')
				.expect('Content-Type', /json/)
				.expect(200);

			expect(response.body).to.have.property('status');
			expect(response.body).to.have.property('progressPercent');
			expect(response.body).to.have.property('photosProcessed');
			expect(response.body).to.have.property('photosTotal');
			expect(response.body).to.have.property('photosFailed');
			expect(response.body).to.have.property('photosSkipped');
		});

		it('should return idle state initially', async () => {
			const response = await request(app)
				.get('/api/sync/status')
				.expect(200);

			expect(response.body.status).to.equal('idle');
			expect(response.body.progressPercent).to.equal(0);
			expect(response.body.photosProcessed).to.equal(0);
			expect(response.body.photosTotal).to.equal(0);
		});
	});

	describe('POST /api/sync/start', () => {
		it('should start sync when configured', async () => {
			mockPhotoSyncService.getCurrentSettings.returns({
				isConfigured: true,
				missingFields: [],
			});

			const response = await request(app)
				.post('/api/sync/start')
				.expect('Content-Type', /json/)
				.expect(202);

			expect(response.body.accepted).to.be.true;
			expect(response.body.status).to.equal('started');
			
			// Verify scheduler was triggered
			expect(mockSyncScheduler.triggerManualSync.called).to.be.true;
		});

		it('should reject start when not configured', async () => {
			mockPhotoSyncService.getCurrentSettings.returns({
				isConfigured: false,
				missingFields: ['ICLOUD_USERNAME', 'ICLOUD_PASSWORD'],
			});

			const response = await request(app)
				.post('/api/sync/start')
				.expect(503);

			expect(response.body.error).to.equal('Configuration incomplete');
			expect(response.body.missingFields).to.be.an('array');
			expect(response.body.missingFields).to.include('ICLOUD_USERNAME');
		});

		it('should reject start when sync already running', async () => {
			// Start first sync
			await request(app)
				.post('/api/sync/start')
				.expect(202);

			// Try to start again
			const response = await request(app)
				.post('/api/sync/start')
				.expect(409);

			expect(response.body.error).to.equal('Sync already running');
		});
	});

	describe('POST /api/sync/stop', () => {
		it('should stop running sync', async () => {
			// Start sync first
			await request(app)
				.post('/api/sync/start')
				.expect(202);

			// Stop it
			const response = await request(app)
				.post('/api/sync/stop')
				.expect(200);

			expect(response.body.status).to.equal('stopped');
		});

		it('should return idle when no sync is running', async () => {
			const response = await request(app)
				.post('/api/sync/stop')
				.expect(200);

			// When no sync is running, stop returns current status which is idle
			expect(response.body.status).to.be.oneOf(['idle', 'stopped']);
		});
	});

	describe('GET /api/sync/status/stream (SSE)', () => {
		it('should stream initial state event with correct headers', (done) => {
			const req = request(app)
				.get('/api/sync/status/stream')
				.buffer(false);
				
			let headersSeen = false;
			let dataSeen = false;
			
			req.on('response', (res: any) => {
				// Check headers
				expect(res.headers['content-type']).to.include('text/event-stream');
				expect(res.headers['cache-control']).to.equal('no-cache');
				expect(res.headers['connection']).to.equal('keep-alive');
				headersSeen = true;
			});
			
			req.parse((res, callback) => {
				let buffer = '';
				res.on('data', (chunk) => {
					buffer += chunk.toString();
					
					// Check if we got a complete event
					if (buffer.includes('\n\n') && !dataSeen) {
						dataSeen = true;
						// Parse SSE format: event: <type>\ndata: <json>\n\n
						const lines = buffer.split('\n');
						if (lines[0]?.startsWith('event: status') && lines[1]?.startsWith('data: ')) {
							const data = JSON.parse(lines[1].substring(6));
							expect(data).to.have.property('status');
							expect(data).to.have.property('progressPercent');
							
							// Success - end the stream
							res.destroy();
							if (headersSeen) {
								done();
							}
						}
					}
				});
				
				res.on('error', (err: any) => {
					// Ignore expected errors from destroying the stream
					if (err.code !== 'ECONNRESET' && err.message !== 'aborted') {
						callback(err, buffer);
					} else {
						callback(null, buffer);
					}
				});
				
				res.on('end', () => callback(null, buffer));
			});

			req.end();
		});
	});

	describe('Sync state transitions', () => {
		it('should track state through complete sync cycle', async () => {
			// Initial state should be idle
			let response = await request(app)
				.get('/api/sync/status')
				.expect(200);
			expect(response.body.status).to.equal('idle');

			// Start sync
			await request(app)
				.post('/api/sync/start')
				.expect(202);

			// State should be running
			response = await request(app)
				.get('/api/sync/status')
				.expect(200);
			expect(response.body.status).to.equal('running');

			// Stop sync
			await request(app)
				.post('/api/sync/stop')
				.expect(200);

			// State should be idle again
			response = await request(app)
				.get('/api/sync/status')
				.expect(200);
			expect(response.body.status).to.equal('idle');
		});
	});

	describe('Error handling', () => {
		it('should handle scheduler errors gracefully', async () => {
			mockSyncScheduler.triggerManualSync.rejects(new Error('Scheduler error'));

			const response = await request(app)
				.post('/api/sync/start')
				.expect(500);

			expect(response.body.error).to.equal('Failed to start sync');
		});

		it('should handle scheduler stop errors gracefully', async () => {
			// Start sync
			await request(app)
				.post('/api/sync/start')
				.expect(202);

			// Mock scheduler error on stop
			mockSyncScheduler.stop.rejects(new Error('Stop error'));
			mockSyncScheduler.isRunning.returns(true);

			// Should still succeed despite scheduler error
			const response = await request(app)
				.post('/api/sync/stop')
				.expect(200);

			expect(response.body.status).to.equal('stopped');
		});
	});
});
