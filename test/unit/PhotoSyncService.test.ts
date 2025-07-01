import { expect } from 'chai';
import sinon from 'sinon';
import { PhotoSyncService } from '../../src/services/PhotoSyncService';
import type { Logger } from 'pino';

describe('PhotoSyncService', () => {
  let photoSyncService: PhotoSyncService;
  let mockFrameClient: any;
  let mockLogger: any;
  let sandbox: sinon.SinonSandbox;
  let mockiCloudService: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Create mock frame client
    mockFrameClient = {
      upload: sandbox.stub(),
    };
    
    // Create mock logger
    mockLogger = {
      info: sandbox.stub(),
      error: sandbox.stub(),
      debug: sandbox.stub(),
      trace: sandbox.stub(),
      warn: sandbox.stub(),
    };
    
    // Create mock iCloud service
    mockiCloudService = {
      authenticate: sandbox.stub(),
      provideMfaCode: sandbox.stub(),
      getService: sandbox.stub(),
      status: 'Ready',
      accountInfo: {
        dsInfo: {
          fullName: 'Test User',
        },
      },
      webservices: {
        photos: 'mocked-photos-url'
      }
    };
    
    const config = {
      username: 'test@example.com',
      password: 'testpassword',
      sourceAlbum: 'Test Album',
      dataDirectory: './test-data',
    };
    
    photoSyncService = new PhotoSyncService(config, mockFrameClient, mockLogger);
    
    // Replace the iCloud service with our mock
    (photoSyncService as any).iCloudClient = mockiCloudService;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it('should create a PhotoSyncService instance', () => {
      expect(photoSyncService).to.be.instanceOf(PhotoSyncService);
    });

    it('should initialize with empty handled photos set', () => {
      expect(photoSyncService.getHandledPhotos().size).to.equal(0);
    });
  });

  describe('clearHandledPhotos', () => {
    it('should clear the handled photos set', () => {
      // Add some photos to the set
      (photoSyncService as any).handledPhotos.add('photo1.jpg');
      (photoSyncService as any).handledPhotos.add('photo2.jpg');

      expect(photoSyncService.getHandledPhotos().size).to.equal(2);

      photoSyncService.clearHandledPhotos();

      expect(photoSyncService.getHandledPhotos().size).to.equal(0);
    });
  });

  describe('getHandledPhotos', () => {
    it('should return a copy of the handled photos set', () => {
      (photoSyncService as any).handledPhotos.add('photo1.jpg');
      const handledPhotos = photoSyncService.getHandledPhotos();

      expect(handledPhotos.size).to.equal(1);
      expect(handledPhotos.has('photo1.jpg')).to.be.true;

      // Verify it's a copy, not the original
      handledPhotos.add('photo2.jpg');
      expect((photoSyncService as any).handledPhotos.size).to.equal(1);
    });
  });

  describe('authenticate', () => {
    it('should authenticate successfully without MFA', async () => {
      mockiCloudService.authenticate.resolves();
      mockiCloudService.status = 'Ready';

      await photoSyncService.authenticate();

      expect(mockiCloudService.authenticate.calledOnce).to.be.true;
    });

    it('should handle MFA authentication', async () => {
      mockiCloudService.authenticate.resolves();
      mockiCloudService.provideMfaCode.resolves();

      // Mock the MFA flow by directly setting the status
      let callCount = 0;
      Object.defineProperty(mockiCloudService, 'status', {
        get: () => {
          if (callCount === 0) {
            callCount++;
            return 'MfaRequested';
          }
          return 'Ready';
        },
        configurable: true
      });

      // Mock process.stdin.once to simulate MFA code input
      const originalOnce = process.stdin.once;
      process.stdin.once = sinon.stub().callsArgWith(1, Buffer.from('123456\n'));

      try {
        await photoSyncService.authenticate();

        expect(mockiCloudService.authenticate.calledOnce).to.be.true;
        expect(mockiCloudService.provideMfaCode.calledWith('123456')).to.be.true;
      } finally {
        // Restore process.stdin.once
        process.stdin.once = originalOnce;
      }
    });
  });

  describe('initializePhotosService', () => {
    it('should initialize photos service with valid album', async () => {
      const mockPhotosService = {
        getAlbums: sandbox.stub(),
      };

      const mockAlbums = new Map();
      mockAlbums.set('Test Album', { name: 'Test Album' });

      mockiCloudService.getService.returns(mockPhotosService);
      mockPhotosService.getAlbums.resolves(mockAlbums);

      await photoSyncService.initializePhotosService('Test Album');

      expect(mockiCloudService.getService.calledWith('photos')).to.be.true;
      expect(mockPhotosService.getAlbums.calledOnce).to.be.true;
    });

    it('should throw error for invalid album', async () => {
      const mockPhotosService = {
        getAlbums: sandbox.stub(),
      };

      const mockAlbums = new Map();
      mockAlbums.set('Different Album', { name: 'Different Album' });

      mockiCloudService.getService.returns(mockPhotosService);
      mockPhotosService.getAlbums.resolves(mockAlbums);

      try {
        await photoSyncService.initializePhotosService('Test Album');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.equal('Album not found: Test Album');
      }
    });
  });

  describe('syncPhotos', () => {
    beforeEach(() => {
      const mockAlbum = {
        getPhotos: sandbox.stub(),
      };
      (photoSyncService as any).album = mockAlbum;
    });

    it('should handle empty photo list', async () => {
      (photoSyncService as any).album.getPhotos.resolves([]);

      await photoSyncService.syncPhotos();

      // Should complete without error
      expect((photoSyncService as any).album.getPhotos.calledOnce).to.be.true;
    });

    it('should sync photos successfully', async () => {
      const mockPhoto = {
        filename: 'test.jpg',
        dimension: { width: 1920, height: 1080 },
        masterRecord: { deleted: false },
        download: sandbox.stub().resolves(new Uint8Array([1, 2, 3])),
        delete: sandbox.stub().resolves(true),
      };

      (photoSyncService as any).album.getPhotos.resolves([mockPhoto]);
      mockFrameClient.upload.resolves('upload-id-123');

      await photoSyncService.syncPhotos();

      expect(mockPhoto.download.calledWith('original')).to.be.true;
      expect(mockFrameClient.upload.calledOnce).to.be.true;
      expect(mockPhoto.delete.calledOnce).to.be.true;
      expect(photoSyncService.getHandledPhotos().has('test.jpg')).to.be.true;
    });

    it('should skip deleted photos', async () => {
      const mockPhoto = {
        filename: 'deleted.jpg',
        masterRecord: { deleted: true },
      };

      (photoSyncService as any).album.getPhotos.resolves([mockPhoto]);

      await photoSyncService.syncPhotos();

      expect(mockFrameClient.upload.called).to.be.false;
    });

    it('should skip already handled photos', async () => {
      const mockPhoto = {
        filename: 'handled.jpg',
        masterRecord: { deleted: false },
      };

      (photoSyncService as any).handledPhotos.add('handled.jpg');
      (photoSyncService as any).album.getPhotos.resolves([mockPhoto]);

      await photoSyncService.syncPhotos();

      expect(mockFrameClient.upload.called).to.be.false;
    });

    it('should throw error if photos service not initialized', async () => {
      (photoSyncService as any).album = null;

      try {
        await photoSyncService.syncPhotos();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.equal(
          'Photos service not initialized. Call initializePhotosService first.',
        );
      }
    });
  });
});
