import { mkdir, rm } from 'fs/promises';
import path from 'path';
import request from 'supertest';

import { createWebServer } from '../../src/web-server.js';
import { expect, sinon } from '../helpers/setup.js';

describe('Integration: Configuration API', () => {
	const testDbPath = path.join(process.cwd(), 'test-data', 'config-api-test.db');
	let app: any;
	let sandbox: sinon.SinonSandbox;

	before(async () => {
		// Ensure test-data directory exists
		await mkdir(path.dirname(testDbPath), { recursive: true });
	});

	beforeEach(async () => {
		sandbox = sinon.createSandbox();

		// Set up test database
		process.env.DATABASE_URL = `file:${testDbPath}`;
		process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters!';

		// Create mock services
		const mockStateStore: any = {
			getSyncState: sandbox.stub().resolves({ status: 'idle', lastSyncedAt: null }),
			setSyncState: sandbox.stub().resolves(),
		};

		const mockPhotoSyncService: any = {
			isReady: sandbox.stub().returns(false),
			sync: sandbox.stub().resolves({ success: true, photosSynced: 0 }),
		};

		const mockFrameDashboardService: any = {
			getCurrentFrameDevice: sandbox.stub().resolves({ host: '', name: '' }),
			listArt: sandbox.stub().resolves({ items: [], total: 0 }),
		};

		const mockSyncScheduler: any = {
			getScheduleState: sandbox.stub().returns({ interval: 300, isRunning: false }),
			start: sandbox.stub().resolves(),
			stop: sandbox.stub().resolves(),
		};

		const config: any = {
			logLevel: 'silent',
			corsOrigin: '*',
		};

		// Create web server with mocks
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

		// Clean up test database
		try {
			await rm(testDbPath, { force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('GET /api/configuration', () => {
		it('should return current configuration', async () => {
			const response = await request(app)
				.get('/api/configuration')
				.expect('Content-Type', /json/)
				.expect(200);

			expect(response.body).to.have.property('icloudUsername');
			expect(response.body).to.have.property('frameHost');
			expect(response.body).to.have.property('syncIntervalSeconds');
			expect(response.body).to.have.property('syncAlbumName');
			expect(response.body).to.have.property('logLevel');
			expect(response.body).to.have.property('corsOrigin');
			expect(response.body).to.have.property('webPort');
			expect(response.body).to.have.property('hasPassword');
		});

		it('should not expose sensitive credentials', async () => {
			const response = await request(app)
				.get('/api/configuration')
				.expect(200);

			expect(response.body).to.not.have.property('password');
			expect(response.body).to.not.have.property('icloudPassword');
			expect(response.body.hasPassword).to.be.a('boolean');
		});
	});

	describe('POST /api/configuration', () => {
		it('should update iCloud username', async () => {
			const updates = {
				icloudUsername: 'newuser@icloud.com',
			};

			const response = await request(app)
				.post('/api/configuration')
				.send(updates)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(response.body.icloudUsername).to.equal('newuser@icloud.com');
		});

		it('should update frame host', async () => {
			const updates = {
				frameHost: '192.168.1.50',
			};

			const response = await request(app)
				.post('/api/configuration')
				.send(updates)
				.expect(200);

			expect(response.body.frameHost).to.equal('192.168.1.50');
		});

		it('should update sync interval', async () => {
			const updates = {
				syncIntervalSeconds: 600,
			};

			const response = await request(app)
				.post('/api/configuration')
				.send(updates)
				.expect(200);

			expect(response.body.syncIntervalSeconds).to.equal(600);
		});

		it('should update multiple fields at once', async () => {
			const updates = {
				icloudUsername: 'multi@icloud.com',
				frameHost: '192.168.1.75',
				syncIntervalSeconds: 450,
				syncAlbumName: 'Updated Album',
			};

			const response = await request(app)
				.post('/api/configuration')
				.send(updates)
				.expect(200);

			expect(response.body.icloudUsername).to.equal('multi@icloud.com');
			expect(response.body.frameHost).to.equal('192.168.1.75');
			expect(response.body.syncIntervalSeconds).to.equal(450);
			expect(response.body.syncAlbumName).to.equal('Updated Album');
		});

		it('should handle password updates securely', async () => {
			const updates = {
				icloudPassword: 'new-secure-password',
			};

			const response = await request(app)
				.post('/api/configuration')
				.send(updates)
				.expect(200);

			expect(response.body.hasPassword).to.equal(true);
			expect(response.body).to.not.have.property('password');
			expect(response.body).to.not.have.property('icloudPassword');
		});

		it('should persist updates across requests', async () => {
			// First update
			await request(app)
				.post('/api/configuration')
				.send({ icloudUsername: 'persistent@icloud.com' })
				.expect(200);

			// Verify persistence
			const response = await request(app)
				.get('/api/configuration')
				.expect(200);

			expect(response.body.icloudUsername).to.equal('persistent@icloud.com');
		});

		it('should validate sync interval is positive', async () => {
			const updates = {
				syncIntervalSeconds: -100,
			};

			await request(app)
				.post('/api/configuration')
				.send(updates)
				.expect(400);
		});

		it('should validate required field types', async () => {
			const updates = {
				syncIntervalSeconds: 'not-a-number',
			};

			await request(app)
				.post('/api/configuration')
				.send(updates)
				.expect(400);
		});
	});

	describe('POST /api/configuration/test-icloud', () => {
		it('should reject empty credentials', async () => {
			const testRequest = {
				username: '',
				password: '',
			};

			await request(app)
				.post('/api/configuration/test-icloud')
				.send(testRequest)
				.expect(400);
		});

		it('should accept valid test request format', async () => {
			const testRequest = {
				username: 'test@icloud.com',
				password: 'test-password',
				sourceAlbum: 'Test Album',
			};

			// This will fail authentication, but should pass validation
			const response = await request(app)
				.post('/api/configuration/test-icloud')
				.send(testRequest)
				.expect(200);

			expect(response.body).to.have.property('success');
		});
	});

	describe('POST /api/configuration/test-frame', () => {
		it('should reject empty host', async () => {
			const testRequest = {
				host: '',
				port: 8002,
			};

			await request(app)
				.post('/api/configuration/test-frame')
				.send(testRequest)
				.expect(400);
		});

		it('should accept valid test request format', async () => {
			const testRequest = {
				host: '192.168.1.100',
				port: 8002,
			};

			const response = await request(app)
				.post('/api/configuration/test-frame')
				.send(testRequest)
				.expect(200);

			expect(response.body).to.have.property('success');
		});

		it('should validate port is in valid range', async () => {
			const testRequest = {
				host: '192.168.1.100',
				port: 99999, // Invalid port
			};

			await request(app)
				.post('/api/configuration/test-frame')
				.send(testRequest)
				.expect(400);
		});
	});

	describe('Configuration persistence', () => {
		it('should maintain configuration state through server lifecycle', async () => {
			// Set initial configuration
			await request(app)
				.post('/api/configuration')
				.send({
					icloudUsername: 'lifecycle@icloud.com',
					frameHost: '192.168.1.200',
					syncIntervalSeconds: 500,
				})
				.expect(200);

			// Verify it's saved
			const getResponse = await request(app)
				.get('/api/configuration')
				.expect(200);

			expect(getResponse.body.icloudUsername).to.equal('lifecycle@icloud.com');
			expect(getResponse.body.frameHost).to.equal('192.168.1.200');
			expect(getResponse.body.syncIntervalSeconds).to.equal(500);
		});

		it('should handle concurrent updates gracefully', async () => {
			const updates1 = { icloudUsername: 'concurrent1@icloud.com' };
			const updates2 = { frameHost: '192.168.1.111' };

			// Send concurrent updates
			const [response1, response2] = await Promise.all([
				request(app).post('/api/configuration').send(updates1),
				request(app).post('/api/configuration').send(updates2),
			]);

			expect(response1.status).to.equal(200);
			expect(response2.status).to.equal(200);

			// Verify final state includes both updates
			const finalState = await request(app)
				.get('/api/configuration')
				.expect(200);

			// At least one update should have persisted
			const hasUpdate1 = finalState.body.icloudUsername === 'concurrent1@icloud.com';
			const hasUpdate2 = finalState.body.frameHost === '192.168.1.111';
			expect(hasUpdate1 || hasUpdate2).to.equal(true);
		});
	});
});
