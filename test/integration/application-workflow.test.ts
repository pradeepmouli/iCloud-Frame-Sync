import { Application } from '../../src/Application.js';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

describe('Integration: Application Workflow', () => {
  let application: Application;
  let config: any;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

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
        services: ['art-mode', 'device', 'remote-control'],
        verbosity: 0,
      },
      syncIntervalSeconds: 5, // Short interval for testing
      logLevel: 'silent',
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
    config.frame.host = 'invalid-host';
    application = new Application(config);

    try {
      await application.start();
      expect.fail('Should have thrown an error for invalid host');
    } catch (error) {
      expect(error).to.be.an('error');
    }
  });

  it('should handle missing iCloud credentials gracefully', async () => {
    config.photoSync.username = '';
    config.photoSync.password = '';
    application = new Application(config);

    try {
      await application.start();
      expect.fail('Should have thrown an error for missing credentials');
    } catch (error) {
      expect(error).to.be.an('error');
    }
  });

  it('should create and configure all services correctly', () => {
    application = new Application(config);

    const frameManager = application.getFrameManager();
    const photoSyncService = application.getPhotoSyncService();
    const syncScheduler = application.getSyncScheduler();

    expect(frameManager).to.not.be.undefined;
    expect(photoSyncService).to.not.be.undefined;
    expect(syncScheduler).to.not.be.undefined;

    expect(syncScheduler.getIntervalSeconds()).to.equal(5);
    expect(syncScheduler.isRunning()).to.be.false;
  });

  it('should stop all services when application stops', async () => {
    application = new Application(config);

    // Mock the services to avoid actual network calls
    const frameManager = application.getFrameManager();
    const photoSyncService = application.getPhotoSyncService();
    const syncScheduler = application.getSyncScheduler();

    sinon.stub(frameManager, 'initialize').resolves();
    sinon.stub(frameManager, 'close').resolves();
    sinon.stub(photoSyncService, 'authenticate').resolves();
    sinon.stub(photoSyncService, 'initialize').resolves();
    sinon.stub(syncScheduler, 'start').resolves();
    sinon.stub(syncScheduler, 'stop');

    await application.start();
    await application.stop();

    expect((syncScheduler.stop as sinon.SinonStub).calledOnce).to.be.true;
    expect((frameManager.close as sinon.SinonStub).calledOnce).to.be.true;
  });
});
