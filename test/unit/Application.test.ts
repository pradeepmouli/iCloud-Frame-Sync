import path from 'node:path';
import { Application } from '../../src/Application.js';
import { createAppConfigFromEnv } from '../../src/config/environment.js';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

describe('Application', () => {
	let application: Application;
	let mockFrameManager: any;
	let mockPhotoSyncService: any;
	let mockSyncScheduler: any;
	let config: any;

	beforeEach(() => {
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
				services: ['art-mode'],
				verbosity: 0,
			},
			syncIntervalSeconds: 30,
			logLevel: 'silent',
		};

		// Mock the service classes
		mockPhotoSyncService = {
			initialize: sinon.stub().resolves(),
			syncPhotos: sinon.stub().resolves(),
			close: sinon.stub().resolves(),
			iCloud: {},
			frame: {},
			isReady: sinon.stub().returns(true),
			getLastError: sinon.stub().returns(null),
		};

		mockSyncScheduler = {
			start: sinon.stub().resolves(),
			stop: sinon.stub(),
		};

		const mockLogger = {
			info: sinon.stub(),
			error: sinon.stub(),
			debug: sinon.stub(),
			warn: sinon.stub(),
			child: sinon.stub().returnsThis(),
		};

		application = new Application(config, {
			photoSyncService: mockPhotoSyncService as any,
			syncScheduler: mockSyncScheduler as any,
			logger: mockLogger as any,
		});
	});

	afterEach(async () => {
		if (application) {
			try {
				await application.stop();
			} catch (error) {
				// Suppress cleanup errors in tests
			}
		}
	});

	describe('constructor', () => {
		it('should create an Application instance', () => {
			expect(application).to.be.instanceOf(Application);
		});
	});

	describe('start', () => {
		it('should start all services successfully', async () => {
			await application.start();

			expect(mockPhotoSyncService.initialize.calledOnce).to.be.true;
			expect(mockSyncScheduler.start.calledOnce).to.be.true;
		});

		it('should remain in setup mode when initialization fails', async () => {
			const error = new Error('PhotoSyncService initialization failed');
			mockPhotoSyncService.initialize.rejects(error);

			await application.start();

			expect(mockPhotoSyncService.initialize.calledOnce).to.be.true;
			expect(mockSyncScheduler.start.called).to.be.false;
		});

		it('should remain in setup mode when service not ready', async () => {
			mockPhotoSyncService.isReady.returns(false);

			await application.start();

			expect(mockSyncScheduler.start.called).to.be.false;
		});

		it('should handle scheduler errors', async () => {
			const error = new Error('Scheduler failed to start');
			mockSyncScheduler.start.rejects(error);

			try {
				await application.start();
				expect.fail('Should have thrown an error');
			} catch (err) {
				expect(err).to.equal(error);
			}
		});
	});

	describe('stop', () => {
		it('should stop all services', async () => {
			await application.stop();

			expect(mockSyncScheduler.stop.calledOnce).to.be.true;
			expect(mockPhotoSyncService.close.calledOnce).to.be.true;
		});
	});

	describe('getters', () => {
		it('should return photo sync service', () => {
			const photoSyncService = application.getPhotoSyncService();
			expect(photoSyncService).to.equal(mockPhotoSyncService);
		});

		it('should return sync scheduler', () => {
			const syncScheduler = application.getSyncScheduler();
			expect(syncScheduler).to.equal(mockSyncScheduler);
		});
	});
});

describe('createAppConfigFromEnv', () => {
	beforeEach(() => {
		// Set up environment variables
		process.env.ICLOUD_USERNAME = 'test@icloud.com';
		process.env.ICLOUD_PASSWORD = 'testpassword';
		process.env.ICLOUD_SOURCE_ALBUM = 'My Album';
		process.env.SAMSUNG_FRAME_HOST = '192.168.1.50';
		process.env.SAMSUNG_FRAME_VERBOSITY = '1';
		process.env.ICLOUD_SYNC_INTERVAL = '120';
		process.env.LOG_LEVEL = 'debug';
	});

	afterEach(() => {
		// Clean up environment variables
		delete process.env.ICLOUD_USERNAME;
		delete process.env.ICLOUD_PASSWORD;
		delete process.env.ICLOUD_SOURCE_ALBUM;
		delete process.env.SAMSUNG_FRAME_HOST;
		delete process.env.SAMSUNG_FRAME_VERBOSITY;
		delete process.env.ICLOUD_SYNC_INTERVAL;
		delete process.env.LOG_LEVEL;
	});

	it('should create config from environment variables', () => {
		const config = createAppConfigFromEnv();

		expect(config.iCloud.username).to.equal('test@icloud.com');
		expect(config.iCloud.password).to.equal('testpassword');
		expect(config.iCloud.sourceAlbum).to.equal('My Album');
		expect(config.iCloud.dataDirectory).to.equal(path.resolve('data'));

		expect(config.frame.host).to.equal('192.168.1.50');
		expect(config.frame.name).to.equal('SamsungTv');
		expect(config.frame.verbosity).to.equal(1);

		expect(config.syncIntervalSeconds).to.equal(120);
		expect(config.logLevel).to.equal('debug');
	});

	it('should use default values when environment variables are not set', () => {
		delete process.env.ICLOUD_SOURCE_ALBUM;
		delete process.env.SAMSUNG_FRAME_VERBOSITY;
		delete process.env.ICLOUD_SYNC_INTERVAL;
		delete process.env.LOG_LEVEL;

		const config = createAppConfigFromEnv();

		expect(config.iCloud.sourceAlbum).to.equal('Frame Sync');
		expect(config.frame.verbosity).to.equal(0);
		expect(config.syncIntervalSeconds).to.equal(60);
		expect(config.logLevel).to.equal('info');
	});
});
