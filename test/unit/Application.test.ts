import { Application, createAppConfigFromEnv } from '../../src/Application.js';
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
      photoSync: {
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
    mockFrameManager = {
      initialize: sinon.stub().resolves(),
      getClient: sinon.stub().returns({}),
      close: sinon.stub().resolves(),
    };

    mockPhotoSyncService = {
      authenticate: sinon.stub().resolves(),
      initializePhotosService: sinon.stub().resolves(),
      syncPhotos: sinon.stub().resolves(),
    };

    mockSyncScheduler = {
      start: sinon.stub().resolves(),
      stop: sinon.stub(),
    };

    application = new Application(config);

    // Replace services with mocks
    application['frameManager'] = mockFrameManager;
    application['photoSyncService'] = mockPhotoSyncService;
    application['syncScheduler'] = mockSyncScheduler;
  });

  describe('constructor', () => {
    it('should create an Application instance', () => {
      expect(application).to.be.instanceOf(Application);
    });
  });

  describe('start', () => {
    it('should start all services successfully', async () => {
      await application.start();

      expect(mockFrameManager.initialize.calledOnce).to.be.true;
      expect(mockPhotoSyncService.authenticate.calledOnce).to.be.true;
      expect(
        mockPhotoSyncService.initializePhotosService.calledWith('Test Album'),
      ).to.be.true;
      expect(mockSyncScheduler.start.calledOnce).to.be.true;
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Frame initialization failed');
      mockFrameManager.initialize.rejects(error);

      try {
        await application.start();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.equal(error);
      }
    });

    it('should handle photo sync service errors', async () => {
      const error = new Error('Authentication failed');
      mockPhotoSyncService.authenticate.rejects(error);

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
      expect(mockFrameManager.close.calledOnce).to.be.true;
    });
  });

  describe('getters', () => {
    it('should return frame manager', () => {
      const frameManager = application.getFrameManager();
      expect(frameManager).to.equal(mockFrameManager);
    });

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
    expect(config.iCloud.dataDirectory).to.equal('./data');

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
