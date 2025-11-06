import request from 'supertest';

import { createWebServer } from '../../src/web-server.js';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

describe('Integration: Connection Management', () => {
	let sandbox: sinon.SinonSandbox;
	let app: any;
	let connectionTester: {
		testICloudConnection: sinon.SinonStub;
		testFrameConnection: sinon.SinonStub;
	};
	let stateStoreStub: { read: sinon.SinonStub; };
	let photoSyncServiceStub: Record<string, sinon.SinonStub | (() => unknown)>;
	let frameDashboardServiceStub: Record<string, sinon.SinonStub>;
	let syncSchedulerStub: Record<string, sinon.SinonStub>;
	let loggerStub: Record<string, sinon.SinonStub>;

	const baseConfig = {
		port: 3010,
		corsOrigin: 'http://localhost:5173',
	};

	beforeEach(async () => {
		sandbox = sinon.createSandbox();

		connectionTester = {
			testICloudConnection: sandbox.stub(),
			testFrameConnection: sandbox.stub(),
		};

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
				albums: {},
				frames: {},
				operations: {},
				schedule: null,
				version: '1.0.0',
			}),
		};

		photoSyncServiceStub = {
			queueManualSync: sandbox.stub().resolves({ operationId: 'manual-connection-test' }),
			listAlbums: sandbox.stub().resolves([]),
			listPhotos: sandbox.stub().resolves({ items: [], pagination: { page: 1, pageSize: 24, total: 0 } }),
			updateConfiguration: sandbox.stub().resolves({}),
			getCurrentSettings: sandbox.stub().returns({
				syncAlbumName: 'Family Album',
				frameHost: '192.168.1.55',
				isConfigured: true,
			}),
			isReady: sandbox.stub().returns(true),
			getLastError: sandbox.stub().returns(null),
		};

		frameDashboardServiceStub = {
			getStatusSnapshot: sandbox.stub().resolves({ isReachable: true }),
			setPowerState: sandbox.stub().resolves({}),
			listArt: sandbox.stub().resolves({ items: [], pagination: { page: 1, pageSize: 24, total: 0 } }),
			uploadArt: sandbox.stub().resolves({}),
			deleteArt: sandbox.stub().resolves(true),
			getThumbnail: sandbox.stub().resolves(Buffer.from([0xff, 0xd8, 0xff])),
		};

		syncSchedulerStub = {
			getIntervalSeconds: sandbox.stub().returns(300),
			getNextRunAt: sandbox.stub().returns(new Date(Date.now() + 60_000)),
			isPausedState: sandbox.stub().returns(false),
			triggerManualSync: sandbox.stub().resolves(),
			updateInterval: sandbox.stub(),
			isRunning: sandbox.stub().returns(false),
			start: sandbox.stub().resolves(),
		};

		const options: any = {
			config: baseConfig,
			logger: loggerStub,
			stateStore: stateStoreStub,
			photoSyncService: photoSyncServiceStub,
			frameDashboardService: frameDashboardServiceStub,
			syncScheduler: syncSchedulerStub,
			connectionTester,
		};
		app = await createWebServer(options);
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('POST /api/connections/test returns aggregated success results when probes pass', async () => {
		const payload = {
			icloud: {
				username: 'test@example.com',
				password: 'password-123',
			},
			frame: {
				host: '192.168.1.55',
			},
		};

		const icloudResult = {
			success: true,
			status: 'Authenticated',
			userInfo: {
				fullName: 'Test User',
				appleId: payload.icloud.username,
			},
		};
		const frameResult = {
			success: true,
			host: payload.frame.host,
			isReachable: true,
			responseTimeMs: 125,
		};

		connectionTester.testICloudConnection.resolves(icloudResult);
		connectionTester.testFrameConnection.resolves(frameResult);

		const response = await request(app)
			.post('/api/connections/test')
			.send(payload)
			.expect(200);

		expect(connectionTester.testICloudConnection.calledOnceWithExactly(payload.icloud)).to.be.true;
		expect(connectionTester.testFrameConnection.calledOnceWithExactly(payload.frame)).to.be.true;
		expect(response.body).to.deep.equal({
			overall: 'ready',
			icloud: icloudResult,
			frame: frameResult,
		});
	});

	it('POST /api/connections/test surfaces MFA requirement from iCloud probe', async () => {
		const payload = {
			icloud: {
				username: 'mfa-user@example.com',
				password: 'password-123',
			},
			frame: {
				host: '192.168.1.55',
			},
		};

		const icloudResult = {
			success: false,
			requiresMfa: true,
			sessionId: 'session-123',
			status: 'MfaRequested',
			message: 'Two-factor authentication code required',
		};
		const frameResult = {
			success: true,
			host: payload.frame.host,
			isReachable: true,
		};

		connectionTester.testICloudConnection.resolves(icloudResult);
		connectionTester.testFrameConnection.resolves(frameResult);

		const response = await request(app)
			.post('/api/connections/test')
			.send(payload)
			.expect(200);

		expect(response.body).to.deep.equal({
			overall: 'attention',
			icloud: icloudResult,
			frame: frameResult,
		});
	});

	it('POST /api/connections/test validates payload structure', async () => {
		await request(app)
			.post('/api/connections/test')
			.send({})
			.expect(400)
			.expect(res => {
				expect(res.body).to.deep.equal({
					error: 'Payload must include icloud and frame configuration.',
				});
			});

		expect(connectionTester.testICloudConnection.notCalled).to.be.true;
		expect(connectionTester.testFrameConnection.notCalled).to.be.true;
	});

	it('POST /api/connections/test reports frame errors without failing entire request', async () => {
		const payload = {
			icloud: {
				username: 'healthy@example.com',
				password: 'password-123',
			},
			frame: {
				host: '192.168.1.200',
			},
		};

		const icloudResult = {
			success: true,
			status: 'Authenticated',
		};

		connectionTester.testICloudConnection.resolves(icloudResult);
		connectionTester.testFrameConnection.rejects(new Error('Device unreachable'));

		const response = await request(app)
			.post('/api/connections/test')
			.send(payload)
			.expect(200);

		expect(response.body).to.deep.equal({
			overall: 'attention',
			icloud: icloudResult,
			frame: {
				success: false,
				host: payload.frame.host,
				error: 'Device unreachable',
			},
		});
	});
});
