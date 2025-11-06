import request from 'supertest';

import { Application } from '../../src/Application.js';
import { createWebServer } from '../../src/web-server.js';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

describe('Integration: Application Workflow', () => {
	let application: Application;
	let config: any;
	let sandbox: sinon.SinonSandbox;
	let mockLogger: any;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		mockLogger = {
			info: sandbox.stub(),
			error: sandbox.stub(),
			debug: sandbox.stub(),
			warn: sandbox.stub(),
			child: sandbox.stub().returnsThis(),
		};
		config = {
			iCloud: {
				username: 'test@example.com',
				password: 'testpass',
				sourceAlbum: 'Test Album',
				dataDirectory: './test-data',
			},
			frame: {
				host: '192.168.1.100',
				name: 'TestTV',
				services: ['art-mode', 'device', 'remote-control'],
				verbosity: 0,
			},
			syncIntervalSeconds: 5,
			logLevel: 'silent',
		};
		// Provide endpoint mocks for Application
		config._testFrameEndpoint = {
			initialize: sandbox.stub().resolves(),
			close: sandbox.stub().resolves(),
			upload: sandbox.stub().resolves('mock-art-id'),
			getHost: sandbox.stub().returns(config.frame.host),
		};
		config._testICloudEndpoint = {
			initialize: sandbox.stub().resolves(),
			close: sandbox.stub().resolves(),
			listPhotos: sandbox.stub().resolves([]),
		};
	});

	afterEach(async () => {
		sandbox.restore();
		if (application) {
			try {
				await application.stop();
			} catch (error) {
				// Ignore cleanup errors in tests
			}
		}
	});

	it('should handle missing Samsung Frame host gracefully', async () => {
		config.frame.host = '';
		application = new Application(config, {
			frameEndpoint: config._testFrameEndpoint,
			iCloudEndpoint: config._testICloudEndpoint,
			logger: mockLogger,
		});

		const scheduler = application.getSyncScheduler();
		const startSpy = sandbox.spy(scheduler, 'start');

		await application.start();

		expect(application.getPhotoSyncService().isReady()).to.be.false;
		expect(startSpy.called).to.be.false;
	});

	it('should handle missing iCloud credentials gracefully', async () => {
		config.iCloud.username = '';
		config.iCloud.password = '';
		application = new Application(config, {
			frameEndpoint: config._testFrameEndpoint,
			iCloudEndpoint: config._testICloudEndpoint,
			logger: mockLogger,
		});

		const scheduler = application.getSyncScheduler();
		const startSpy = sandbox.spy(scheduler, 'start');

		await application.start();

		expect(application.getPhotoSyncService().isReady()).to.be.false;
		expect(startSpy.called).to.be.false;
	});

	it('should create and configure all services correctly', () => {
		application = new Application(config, {
			frameEndpoint: config._testFrameEndpoint,
			iCloudEndpoint: config._testICloudEndpoint,
			logger: mockLogger,
		});

		// Validate that Application constructed services
		expect(application).to.have.property('photoSyncService');
		expect(application).to.have.property('syncScheduler');
		expect(application['photoSyncService']).to.not.be.undefined;
		expect(application['syncScheduler']).to.not.be.undefined;
		// Validate scheduler config - SyncScheduler enforces minimum 30 seconds
		expect(application['syncScheduler'].getIntervalSeconds()).to.equal(30);
		expect(application['syncScheduler'].isRunning()).to.be.false;
	});

	it('should stop all services when application stops', async () => {
		application = new Application(config, {
			frameEndpoint: config._testFrameEndpoint,
			iCloudEndpoint: config._testICloudEndpoint,
			logger: mockLogger,
		});

		// Mock the services to avoid actual network calls
		const photoSyncService = application['photoSyncService'];
		const syncScheduler = application['syncScheduler'];
		sinon.stub(photoSyncService, 'initialize').resolves();
		sinon.stub(photoSyncService, 'close').resolves();
		sinon.stub(syncScheduler, 'start').resolves();
		sinon.stub(syncScheduler, 'stop');
		await application.start();
		await application.stop();
		expect((syncScheduler.stop as sinon.SinonStub).calledOnce).to.be.true;
		expect((photoSyncService.close as sinon.SinonStub).calledOnce).to.be.true;
	});
});

describe('Integration: Web API Contract', () => {
	let sandbox: sinon.SinonSandbox;
	let app: any;
	let stateStoreStub: Record<string, sinon.SinonStub>;
	let photoSyncServiceStub: Record<string, sinon.SinonStub>;
	let syncSchedulerStub: Record<string, sinon.SinonStub>;
	let frameDashboardServiceStub: Record<string, sinon.SinonStub>;
	let loggerStub: Record<string, sinon.SinonStub>;
	interface FakeICloudEndpoint {
		authenticate: sinon.SinonStub;
		provideMfaCode: sinon.SinonStub;
		status: string;
		accountInfo: { dsInfo: { fullName: string; }; } | null;
	}
	let createdEndpoints: FakeICloudEndpoint[];

	const baseConfig = {
		port: 3001,
		corsOrigin: 'http://localhost:3000',
	};

	const latestOperation = {
		id: 'op-200',
		startedAt: '2024-02-01T10:00:00.000Z',
		completedAt: null,
		status: 'running',
		photoIds: ['photo-1', 'photo-2'],
		error: null,
		attempt: 2,
		frameId: 'frame-1',
	};

	const scheduleState = {
		nextRunAt: '2024-02-01T11:00:00.000Z',
		intervalSeconds: 300,
		isPaused: false,
	};

	const albumsPayload = [
		{
			id: 'album-1',
			name: 'Family Album',
			photoCount: 120,
			lastSyncedAt: '2024-02-01T09:59:59.000Z',
		},
		{
			id: 'album-2',
			name: 'Landscapes',
			photoCount: 45,
			lastSyncedAt: null,
		},
	];

	const photoPage = {
		items: [
			{
				id: 'photo-200',
				albumId: 'album-1',
				takenAt: '2024-01-31T20:00:00.000Z',
				sizeBytes: 512000,
				format: 'jpeg',
				status: 'uploaded',
			},
		],
		pagination: {
			page: 2,
			pageSize: 1,
			total: 10,
		},
	};

	const updatedConfig = {
		syncAlbumName: 'Family Album',
		frameHost: '192.168.1.55',
		syncIntervalSeconds: 120,
		logLevel: 'debug',
		corsOrigin: 'http://localhost:5173',
		webPort: baseConfig.port,
		iCloudUsername: 'user@example.com',
		hasICloudPassword: true,
		isConfigured: true,
		missingFields: [],
		lastError: null,
	};

	const frameStatusSnapshot = {
		host: '192.168.1.55',
		isReachable: true,
		isOn: true,
		inArtMode: false,
		brightness: 45,
		currentArt: {
			id: 'art-101',
			name: 'Sunset',
			categoryId: 'MY-C0002',
			width: 3840,
			height: 2160,
			isFavorite: true,
			matte: { type: 'shadowbox', color: 'black' },
			addedAt: '2024-02-01T10:00:00.000Z',
		},
		device: {
			name: 'The Frame',
			model: 'QN55',
			serialNumber: 'ABC123',
			firmwareVersion: '1470',
		},
		lastCheckedAt: '2024-02-01T12:00:00.000Z',
	};

	const frameArtPage = {
		items: [
			{
				id: 'art-101',
				name: 'Sunset',
				categoryId: 'MY-C0002',
				width: 3840,
				height: 2160,
				isFavorite: true,
				matte: { type: 'shadowbox', color: 'black' },
				addedAt: '2024-02-01T10:00:00.000Z',
			},
		],
		pagination: {
			page: 1,
			pageSize: 24,
			total: 1,
		},
	};

	beforeEach(async () => {
		sandbox = sinon.createSandbox();
		loggerStub = {
			info: sandbox.stub(),
			warn: sandbox.stub(),
			error: sandbox.stub(),
			debug: sandbox.stub(),
			child: sandbox.stub().returnsThis(),
		};

		stateStoreStub = {
			read: sandbox.stub().resolves({
				photos: {},
				albums: {
					'alb-original': {
						id: 'alb-original',
						name: 'Original',
						lastSyncedAt: '2024-01-30T10:00:00.000Z',
						photoCount: 15,
					},
				},
				frames: {},
				operations: {
					'op-100': {
						id: 'op-100',
						startedAt: '2024-02-01T09:00:00.000Z',
						completedAt: '2024-02-01T09:05:00.000Z',
						status: 'succeeded',
						photoIds: ['photo-100'],
						error: null,
						attempt: 1,
						frameId: 'frame-1',
					},
					[latestOperation.id]: latestOperation,
				},
				schedule: scheduleState,
				version: '1.0.0',
			}),
		};

		photoSyncServiceStub = {
			queueManualSync: sandbox.stub().resolves({ operationId: 'manual-001' }),
			listAlbums: sandbox.stub().resolves(albumsPayload),
			listPhotos: sandbox.stub().resolves(photoPage),
			updateConfiguration: sandbox.stub().resolves(updatedConfig),
			getCurrentSettings: sandbox.stub().returns(updatedConfig),
			isReady: sandbox.stub().returns(true),
			getLastError: sandbox.stub().returns(null),
		};

		frameDashboardServiceStub = {
			getStatusSnapshot: sandbox.stub().resolves(frameStatusSnapshot),
			setPowerState: sandbox.stub().resolves({ isOn: true, wasToggled: true, action: 'toggle' }),
			listArt: sandbox.stub().resolves(frameArtPage),
			uploadArt: sandbox.stub().resolves({ artId: 'art-999', setAsCurrent: false }),
			deleteArt: sandbox.stub().resolves(true),
			getThumbnail: sandbox.stub().resolves(Buffer.from([0xff, 0xd8, 0xff])),
		};

		syncSchedulerStub = {
			getIntervalSeconds: sandbox.stub().returns(scheduleState.intervalSeconds),
			getNextRunAt: sandbox.stub().returns(new Date(scheduleState.nextRunAt)),
			isPausedState: sandbox.stub().returns(scheduleState.isPaused),
			triggerManualSync: sandbox.stub().resolves(),
			updateInterval: sandbox.stub(),
			isRunning: sandbox.stub().returns(false),
			start: sandbox.stub().resolves(),
		};

		createdEndpoints = [];
		const factory = (_config: any): FakeICloudEndpoint => {
			const endpoint: FakeICloudEndpoint = {
				authenticate: sandbox.stub().callsFake(async (
					username: string,
					_password: string,
					mfaCallback?: () => Promise<string>,
				) => {
					if (username === 'mfa-user@example.com') {
						endpoint.status = 'MfaRequested';
						endpoint.accountInfo = {
							dsInfo: { fullName: 'Pending MFA User' },
						};
						if (mfaCallback) {
							await mfaCallback();
						}
						return;
					}
					if (username === 'invalid-user@example.com') {
						throw new Error('Authentication failed');
					}
					endpoint.status = 'Authenticated';
					endpoint.accountInfo = {
						dsInfo: { fullName: 'Test User' },
					};
				}),
				provideMfaCode: sandbox.stub().callsFake(async (code: string) => {
					if (code === '000000') {
						throw new Error('Invalid MFA code');
					}
					endpoint.status = 'Authenticated after MFA';
					endpoint.accountInfo = {
						dsInfo: { fullName: 'MFA User' },
					};
				}),
				status: 'Initialized',
				accountInfo: null,
			};
			createdEndpoints.push(endpoint);
			return endpoint;
		};

		app = await createWebServer({
			config: baseConfig,
			logger: loggerStub as unknown as any,
			photoSyncService: photoSyncServiceStub as unknown as any,
			frameDashboardService: frameDashboardServiceStub as unknown as any,
			syncScheduler: syncSchedulerStub as unknown as any,
			stateStore: stateStoreStub as unknown as any,
			createICloudEndpoint: factory as unknown as any,
		});
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('GET /api/status returns sync, schedule, and config snapshots', async () => {
		const response = await request(app).get('/api/status').expect(200);
		expect(response.body).to.deep.equal({
			sync: latestOperation,
			schedule: scheduleState,
			config: updatedConfig,
		});
		expect(photoSyncServiceStub.getCurrentSettings.calledOnce).to.be.true;
	});

	it('POST /api/auth/icloud authenticates successfully without MFA', async () => {
		const response = await request(app)
			.post('/api/auth/icloud')
			.send({ username: 'user@example.com', password: 'secret' });
		expect(
			response.status,
			JSON.stringify({
				body: response.body,
				log: loggerStub.error.firstCall?.args ?? null,
				authenticateCalls: createdEndpoints[0]?.authenticate.callCount ?? 0,
			}),
		).to.equal(200);
		expect(createdEndpoints[0]?.authenticate.calledOnce).to.be.true;
		expect(response.body).to.deep.equal({
			success: true,
			status: 'Authenticated',
			userInfo: {
				fullName: 'Test User',
				appleId: 'user@example.com',
			},
		});
	});

	it('POST /api/auth/icloud returns MFA challenge when required', async () => {
		const response = await request(app)
			.post('/api/auth/icloud')
			.send({ username: 'mfa-user@example.com', password: 'secret' });
		expect(
			response.status,
			JSON.stringify({
				body: response.body,
				log: loggerStub.error.firstCall?.args ?? null,
				authenticateCalls: createdEndpoints[0]?.authenticate.callCount ?? 0,
			}),
		).to.equal(200);
		expect(response.body.success).to.be.false;
		expect(response.body.requiresMfa).to.be.true;
		expect(response.body.sessionId).to.be.a('string');
	});

	it('POST /api/auth/mfa completes MFA verification for pending session', async () => {
		const challenge = await request(app)
			.post('/api/auth/icloud')
			.send({ username: 'mfa-user@example.com', password: 'secret' })
			.expect(200);
		const sessionId = challenge.body.sessionId;
		const response = await request(app)
			.post('/api/auth/mfa')
			.send({ sessionId, code: '123456' })
			.expect(200);
		expect(createdEndpoints[0]?.provideMfaCode.calledOnceWithExactly('123456')).to.be.true;
		expect(response.body).to.deep.equal({
			success: true,
			status: 'Authenticated after MFA',
			userInfo: {
				fullName: 'MFA User',
				appleId: 'mfa-user@example.com',
			},
		});
	});

	it('POST /api/auth/mfa returns error for invalid code but keeps session active', async () => {
		const challenge = await request(app)
			.post('/api/auth/icloud')
			.send({ username: 'mfa-user@example.com', password: 'secret' })
			.expect(200);
		const sessionId = challenge.body.sessionId;
		const invalid = await request(app)
			.post('/api/auth/mfa')
			.send({ sessionId, code: '000000' })
			.expect(400);
		expect(createdEndpoints[0]?.provideMfaCode.calledOnceWithExactly('000000')).to.be.true;
		expect(invalid.body).to.deep.equal({ success: false, error: 'Invalid MFA code' });

		const retry = await request(app)
			.post('/api/auth/mfa')
			.send({ sessionId, code: '123456' })
			.expect(200);
		expect(createdEndpoints[0]?.provideMfaCode.calledWithExactly('123456')).to.be.true;
		expect(retry.body.success).to.be.true;
	});

	it('POST /api/auth/mfa removes session after successful verification', async () => {
		const challenge = await request(app)
			.post('/api/auth/icloud')
			.send({ username: 'mfa-user@example.com', password: 'secret' })
			.expect(200);
		const sessionId = challenge.body.sessionId;
		await request(app)
			.post('/api/auth/mfa')
			.send({ sessionId, code: '123456' })
			.expect(200);

		const reuse = await request(app)
			.post('/api/auth/mfa')
			.send({ sessionId, code: '123456' })
			.expect(404);
		expect(reuse.body).to.deep.equal({ success: false, error: 'MFA session expired. Please try again.' });
	});

	it('POST /api/auth/mfa rejects unknown session identifiers', async () => {
		const response = await request(app)
			.post('/api/auth/mfa')
			.send({ sessionId: 'unknown', code: '123456' })
			.expect(404);
		expect(response.body).to.deep.equal({
			success: false,
			error: 'MFA session expired. Please try again.',
		});
	});

	it('POST /api/auth/icloud validates required credentials', async () => {
		const response = await request(app)
			.post('/api/auth/icloud')
			.send({ username: '', password: '' })
			.expect(400);
		expect(response.body).to.deep.equal({
			success: false,
			error: 'Username and password are required',
		});
	});

	it('POST /api/sync accepts manual trigger requests', async () => {
		const manualRequest = {
			albumName: 'Family Album',
			frameHost: 'frame.local',
		};
		const response = await request(app)
			.post('/api/sync')
			.send(manualRequest)
			.expect(202);
		expect(photoSyncServiceStub.queueManualSync.calledOnceWithExactly(manualRequest)).to
			.be.true;
		expect(syncSchedulerStub.triggerManualSync.calledOnce).to.be.true;
		expect(response.body).to.deep.equal({ operationId: 'manual-001' });
	});

	it('GET /api/albums returns album collection', async () => {
		const response = await request(app).get('/api/albums').expect(200);
		expect(response.body).to.deep.equal({ albums: albumsPayload });
		expect(photoSyncServiceStub.listAlbums.calledOnce).to.be.true;
	});

	it('GET /api/photos returns paginated album photos', async () => {
		const response = await request(app)
			.get('/api/photos')
			.query({ albumId: 'album-1', page: 2, pageSize: 1 })
			.expect(200);
		expect(photoSyncServiceStub.listPhotos.calledOnceWithExactly({
			albumId: 'album-1',
			page: 2,
			pageSize: 1,
		})).to.be.true;
		expect(response.body).to.deep.equal(photoPage);
	});

	it('POST /api/settings applies configuration updates', async () => {
		const updateRequest = {
			syncAlbumName: 'Family Album',
			frameHost: '192.168.1.55',
			syncIntervalSeconds: 120,
			logLevel: 'debug',
			corsOrigin: 'http://localhost:5173',
		};
		const response = await request(app)
			.post('/api/settings')
			.send(updateRequest)
			.expect(200);
		expect(photoSyncServiceStub.updateConfiguration.calledOnceWithExactly(updateRequest)).to
			.be.true;
		expect(syncSchedulerStub.updateInterval.calledOnceWithExactly(120)).to.be.true;
		expect(syncSchedulerStub.start.calledOnce).to.be.true;
		expect(response.body).to.deep.equal({ success: true, config: updatedConfig });
	});

	it('GET /api/frame/status returns frame snapshot', async () => {
		const response = await request(app).get('/api/frame/status').expect(200);
		expect(frameDashboardServiceStub.getStatusSnapshot.calledOnce).to.be.true;
		expect(response.body).to.deep.equal(frameStatusSnapshot);
	});

	it('POST /api/frame/power updates power state', async () => {
		const response = await request(app)
			.post('/api/frame/power')
			.send({ action: 'toggle' })
			.expect(200);
		expect(frameDashboardServiceStub.setPowerState.calledOnceWithExactly('toggle')).to.be
			.true;
		expect(response.body).to.deep.equal({ isOn: true, wasToggled: true, action: 'toggle' });
	});

	it('GET /api/frame/art returns paginated art list', async () => {
		const response = await request(app)
			.get('/api/frame/art')
			.query({ page: 1, pageSize: 24 })
			.expect(200);
		expect(frameDashboardServiceStub.listArt.calledOnceWithExactly({
			page: 1,
			pageSize: 24,
			categoryId: undefined,
		})).to.be.true;
		expect(response.body).to.deep.equal(frameArtPage);
	});

	it('POST /api/frame/art uploads art and returns identifier', async () => {
		const payload = {
			filename: 'upload.jpg',
			data: Buffer.from('test').toString('base64'),
			contentType: 'image/jpeg',
			setAsCurrent: false,
		};
		const response = await request(app)
			.post('/api/frame/art')
			.send(payload)
			.expect(201);
		expect(frameDashboardServiceStub.uploadArt.calledOnceWithExactly(payload)).to.be.true;
		expect(response.body).to.deep.equal({ artId: 'art-999', setAsCurrent: false });
	});

	it('DELETE /api/frame/art/:artId removes art asset', async () => {
		await request(app).delete('/api/frame/art/art-101').expect(204);
		expect(frameDashboardServiceStub.deleteArt.calledOnceWithExactly('art-101')).to.be.true;
	});

	it('GET /api/frame/art/:artId/thumbnail streams thumbnail bytes', async () => {
		const response = await request(app)
			.get('/api/frame/art/art-101/thumbnail')
			.expect(200);
		expect(frameDashboardServiceStub.getThumbnail.calledOnceWithExactly('art-101')).to.be.true;
		expect(response.headers['content-type']).to.equal('image/jpeg');
		expect(response.body).to.be.instanceOf(Buffer);
	});
});
