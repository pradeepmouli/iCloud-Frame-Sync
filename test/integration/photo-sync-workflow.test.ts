import type { Logger } from 'pino';
import { FrameManager } from '../../src/services/FrameManager.js';
import { PhotoSyncService } from '../../src/services/PhotoSyncService.js';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

describe('Integration: Photo Sync Workflow', () => {
  let photoSyncService: PhotoSyncService;
  let frameManager: FrameManager;
  let mockLogger: sinon.SinonStubbedInstance<Logger>;
  let mockFrameClient: any;

  beforeEach(() => {
    mockLogger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      trace: sinon.stub(),
      warn: sinon.stub(),
      child: sinon.stub().returns({
        info: sinon.stub(),
        error: sinon.stub(),
        debug: sinon.stub(),
        trace: sinon.stub(),
        warn: sinon.stub(),
      }),
    } as any;

    // Create a mock Samsung Frame client
    mockFrameClient = {
      upload: sinon.stub(),
      device: {
        turnOn: sinon.stub().resolves(true),
        isOn: sinon.stub().resolves(true),
        getInfo: sinon.stub().resolves({ name: 'TestTV' }),
      },
      artMode: {
        isOn: sinon.stub().resolves(true),
        getInfo: sinon.stub().resolves({ mode: 'art' }),
      },
      close: sinon.stub(),
    };

    const frameConfig = {
      host: '192.168.1.100',
      name: 'TestTV',
      services: ['art-mode', 'device', 'remote-control'],
      verbosity: 0,
    };

    const photoConfig = {
      username: 'test@example.com',
      password: 'testpass',
      sourceAlbum: 'Test Album',
      dataDirectory: './test-data',
    };

    frameManager = new FrameManager(frameConfig, mockLogger as any);
    // Replace the frame client with our mock
    (frameManager as any).frameClient = mockFrameClient;

    photoSyncService = new PhotoSyncService(
      photoConfig,
      mockFrameClient,
      mockLogger as any,
    );
  });

  it('should handle complete photo sync workflow with mocked services', async () => {
    // Mock all external dependencies
    const mockFrameClient = {
      upload: sinon.stub().resolves('upload-123'),
      getDeviceInfo: sinon.stub().resolves({ model: 'Samsung Frame' }),
      isOn: sinon.stub().resolves(true),
      connect: sinon.stub().resolves(),
      inArtMode: sinon.stub().resolves(true),
      getArtModeInfo: sinon.stub().resolves({ currentArt: 'art1' }),
      getAvailableArt: sinon.stub().resolves(),
      close: sinon.stub().resolves(),
    };

    const mockPhoto = {
      filename: 'test-photo.jpg',
      dimension: { width: 1920, height: 1080 },
      masterRecord: { deleted: false },
      download: sinon.stub().resolves(new Uint8Array([255, 216, 255, 224])), // JPEG header
      delete: sinon.stub().resolves(true),
    };

    const mockAlbum = {
      getPhotos: sinon.stub().resolves([mockPhoto]),
    };

    const mockPhotosService = {
      getAlbums: sinon.stub().resolves(new Map([['Test Album', mockAlbum]])),
    };

    const mockiCloudClient = {
      authenticate: sinon.stub().resolves(),
      awaitReady: Promise.resolve(),
      status: 'Ready',
      accountInfo: {
        dsInfo: {
          fullName: 'Test User',
        },
      },
      getService: sinon.stub().returns(mockPhotosService),
    };

    // Replace the internal clients with mocks
    frameManager['client'] = mockFrameClient as any;
    photoSyncService['iCloudClient'] = mockiCloudClient as any;
    photoSyncService['frameClient'] = mockFrameClient as any;

    // Test the complete workflow
    await photoSyncService.authenticate();
    await photoSyncService.initializePhotosService('Test Album');

    // Sync photos
    await photoSyncService.syncPhotos();

    // Verify the workflow
    expect(mockPhoto.download.calledWith('original')).to.be.true;
    expect(mockFrameClient.upload.calledOnce).to.be.true;
    expect(mockPhoto.delete.calledOnce).to.be.true;
    expect(photoSyncService.getHandledPhotos().has('test-photo.jpg')).to.be
      .true;
  });

  it('should handle multiple photos with different states', async () => {
    const mockFrameClient = {
      upload: sinon.stub().resolves('upload-123'),
    };

    const photos = [
      {
        filename: 'photo1.jpg',
        dimension: { width: 1920, height: 1080 },
        masterRecord: { deleted: false },
        download: sinon.stub().resolves(new Uint8Array([1, 2, 3])),
        delete: sinon.stub().resolves(true),
      },
      {
        filename: 'photo2.jpg',
        dimension: { width: 1920, height: 1080 },
        masterRecord: { deleted: true }, // This should be skipped
        download: sinon.stub(),
        delete: sinon.stub(),
      },
      {
        filename: 'photo3.jpg',
        dimension: { width: 1920, height: 1080 },
        masterRecord: { deleted: false },
        download: sinon.stub().resolves(new Uint8Array([4, 5, 6])),
        delete: sinon.stub().resolves(false), // Delete fails
      },
    ];

    const mockAlbum = {
      getPhotos: sinon.stub().resolves(photos),
    };

    const mockPhotosService = {
      getAlbums: sinon.stub().resolves(new Map([['Test Album', mockAlbum]])),
    };

    const mockiCloudClient = {
      authenticate: sinon.stub().resolves(),
      awaitReady: Promise.resolve(),
      status: 'Ready',
      accountInfo: { dsInfo: { fullName: 'Test User' } },
      getService: sinon.stub().returns(mockPhotosService),
    };

    frameManager['client'] = mockFrameClient as any;
    photoSyncService['iCloudClient'] = mockiCloudClient as any;

    await photoSyncService.initialize();
    await photoSyncService.syncPhotos();

    // Verify photo1 was processed
    expect(photos[0].download.calledOnce).to.be.true;
    expect(photos[0].delete.calledOnce).to.be.true;
    expect(photoSyncService.getHandledPhotos().has('photo1.jpg')).to.be.true;

    // Verify photo2 was skipped (deleted)
    expect(photos[1].download.called).to.be.false;
    expect(photos[1].delete.called).to.be.false;
    expect(photoSyncService.getHandledPhotos().has('photo2.jpg')).to.be.false;

    // Verify photo3 was processed but not marked as handled (delete failed)
    expect(photos[2].download.calledOnce).to.be.true;
    expect(photos[2].delete.calledOnce).to.be.true;
    expect(photoSyncService.getHandledPhotos().has('photo3.jpg')).to.be.true; // Still added to handled
  });

  it('should handle photo sync errors gracefully', async () => {
    const mockFrameClient = {
      upload: sinon.stub().rejects(new Error('Upload failed')),
    };

    const mockPhoto = {
      filename: 'error-photo.jpg',
      dimension: { width: 1920, height: 1080 },
      masterRecord: { deleted: false },
      download: sinon.stub().resolves(new Uint8Array([1, 2, 3])),
      delete: sinon.stub(),
    };

    const mockAlbum = {
      getPhotos: sinon.stub().resolves([mockPhoto]),
    };

    const mockPhotosService = {
      getAlbums: sinon.stub().resolves(new Map([['Test Album', mockAlbum]])),
    };

    const mockiCloudClient = {
      authenticate: sinon.stub().resolves(),
      awaitReady: Promise.resolve(),
      status: 'Ready',
      accountInfo: { dsInfo: { fullName: 'Test User' } },
      getService: sinon.stub().returns(mockPhotosService),
    };

    frameManager['client'] = mockFrameClient as any;
    photoSyncService['iCloudClient'] = mockiCloudClient as any;
    photoSyncService['frameClient'] = mockFrameClient as any;

    await photoSyncService.authenticate();
    await photoSyncService.initializePhotosService('Test Album');

    try {
      await photoSyncService.syncPhotos();
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.equal('Upload failed');
    }

    // Verify photo was not marked as handled due to error
    expect(photoSyncService.getHandledPhotos().has('error-photo.jpg')).to.be
      .false;
  });
});
