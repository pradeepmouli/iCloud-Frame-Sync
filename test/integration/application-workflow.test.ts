import { Application } from '../../src/Application.js';
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
		config._testFrameEndpoint = { upload: sandbox.stub().resolves('mock-art-id') };
		config._testICloudEndpoint = { listPhotos: sandbox.stub().resolves([]) };
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
		config.frame.host = 'invalid-host';
		application = new Application(config, {
			frameEndpoint: config._testFrameEndpoint,
			iCloudEndpoint: config._testICloudEndpoint,
			logger: mockLogger,
		});

		try {
			await application.start();
			expect.fail('Should have thrown an error for invalid host');
		} catch (error) {
			expect(error).to.be.an('error');
		}
	});

	it('should handle missing iCloud credentials gracefully', async () => {
		config.iCloud.username = '';
		config.iCloud.password = '';
		application = new Application(config, {
			frameEndpoint: config._testFrameEndpoint,
			iCloudEndpoint: config._testICloudEndpoint,
			logger: mockLogger,
		});

		try {
			await application.start();
			expect.fail('Should have thrown an error for missing credentials');
		} catch (error) {
			expect(error).to.be.an('error');
		}
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
