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

	const markServiceReady = (service: PhotoSyncService): void => {
		(service as any).ready = true;
		(service as any).initializationError = null;
	};

	beforeEach(() => {
		mockLogger = {
			info: sinon.stub(),
			error: sinon.stub(),
			debug: sinon.stub(),
			warn: sinon.stub(),
			child: sinon.stub().returnsThis(),
		} as unknown as sinon.SinonStubbedInstance<Logger>;
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
		const iCloudConfig = {
			username: 'test@example.com',
			password: 'testpass',
			sourceAlbum: 'Test Album',
			dataDirectory: './test-data',
		};
		frameManager = new FrameManager(frameConfig, mockLogger as any);
		(frameManager as any).frameClient = mockFrameClient;
		// Provide endpoint mocks directly
		photoSyncService = new PhotoSyncService(
			{ iCloud: iCloudConfig, frame: frameConfig },
			mockLogger as any,
			{
				frameEndpoint: frameManager as any,
				iCloudEndpoint: { listPhotos: sinon.stub().resolves([]) } as any,
				stateStore: undefined,
			}
		);
		markServiceReady(photoSyncService);
	});

	it('should handle complete photo sync workflow with mocked services', async () => {
		// Create mock photo
		const mockPhoto = {
			id: 'photo-1',
			filename: 'test-photo.jpg',
			lastModified: new Date(),
			dimensions: { width: 1920, height: 1080 },
			size: 12345,
			download: sinon.stub().resolves(Buffer.from([255, 216, 255, 224])), // JPEG header
		};

		// Mock the endpoints used by photoSyncService
		const iCloudEndpoint = photoSyncService.iCloud;
		const frameEndpoint = photoSyncService.frame;
		const stateStore = (photoSyncService as any).stateStore;

		// If already stubbed in constructor, reset behavior; otherwise stub fresh
		const listPhotosStub = (iCloudEndpoint.listPhotos as any)?.resetBehavior
			? (iCloudEndpoint.listPhotos as sinon.SinonStub)
			: sinon.stub(iCloudEndpoint, 'listPhotos');
		listPhotosStub.resolves([mockPhoto as any]);
		sinon.stub(frameEndpoint, 'upload').resolves('frame-art-id-123');
		sinon.stub(stateStore, 'getAlbumLastSyncTimestamp').resolves(null);
		sinon.stub(stateStore, 'getPhotoState').resolves(null);
		sinon.stub(stateStore, 'updatePhotoState').resolves();
		sinon.stub(stateStore, 'updateAlbumState').resolves();

		// Sync photos
		await photoSyncService.syncPhotos();

		// Verify the workflow
		expect(mockPhoto.download.called).to.be.true;
		expect((frameEndpoint.upload as sinon.SinonStub).calledOnce).to.be.true;
	});

	it('should handle multiple photos with different states', async () => {
		const mockFrameClient = {
			upload: sinon.stub().resolves('upload-123'),
		};

		const photos = [
			{
				id: 'photo-1',
				filename: 'photo1.jpg',
				lastModified: new Date(),
				dimensions: { width: 1920, height: 1080 },
				size: 100,
				download: sinon.stub().resolves(Buffer.from([1, 2, 3])),
			},
			{
				id: 'photo-2',
				filename: 'photo2.jpg',
				lastModified: new Date(),
				dimensions: { width: 1920, height: 1080 },
				size: 200,
				download: sinon.stub().resolves(Buffer.from([4, 5, 6])),
			},
		];

		const iCloudEndpoint = photoSyncService.iCloud;
		const frameEndpoint = photoSyncService.frame;
		const stateStore = (photoSyncService as any).stateStore;

		const lpStub2 = (iCloudEndpoint.listPhotos as any)?.resetBehavior
			? (iCloudEndpoint.listPhotos as sinon.SinonStub)
			: sinon.stub(iCloudEndpoint, 'listPhotos');
		lpStub2.resolves(photos as any);
		sinon.stub(frameEndpoint, 'upload').resolves('frame-art-id');
		sinon.stub(stateStore, 'getAlbumLastSyncTimestamp').resolves(null);
		// photo-1 already uploaded, photo-2 is new
		sinon.stub(stateStore, 'getPhotoState')
			.onFirstCall().resolves({ id: 'photo-1', status: 'uploaded' } as any)
			.onSecondCall().resolves(null);
		sinon.stub(stateStore, 'updatePhotoState').resolves();
		sinon.stub(stateStore, 'updateAlbumState').resolves();

		await photoSyncService.syncPhotos();

		// Verify photo1 was skipped (already uploaded)
		expect(photos[0].download.called).to.be.false;
		// Verify photo2 was processed
		expect(photos[1].download.calledOnce).to.be.true;
	});

	it('should handle photo sync errors gracefully', async () => {
		const mockPhoto = {
			id: 'error-photo',
			filename: 'error-photo.jpg',
			lastModified: new Date(),
			dimensions: { width: 1920, height: 1080 },
			size: 100,
			download: sinon.stub().resolves(Buffer.from([1, 2, 3])),
		};

		const iCloudEndpoint = photoSyncService.iCloud;
		const frameEndpoint = photoSyncService.frame;
		const stateStore = (photoSyncService as any).stateStore;

		const lpStub3 = (iCloudEndpoint.listPhotos as any)?.resetBehavior
			? (iCloudEndpoint.listPhotos as sinon.SinonStub)
			: sinon.stub(iCloudEndpoint, 'listPhotos');
		lpStub3.resolves([mockPhoto as any]);
		sinon.stub(frameEndpoint, 'upload').rejects(new Error('Upload failed'));
		sinon.stub(stateStore, 'getAlbumLastSyncTimestamp').resolves(null);
		sinon.stub(stateStore, 'getPhotoState').resolves(null);
		sinon.stub(stateStore, 'updatePhotoState').resolves();
		sinon.stub(stateStore, 'updateAlbumState').resolves();

		// syncPhotos should not throw - it handles errors internally
		await photoSyncService.syncPhotos();

		// Verify error was logged and photo state was updated to failed
		expect((stateStore.updatePhotoState as sinon.SinonStub).calledWith('error-photo', sinon.match({
			status: 'failed',
			errorMessage: sinon.match('Upload failed'),
		}))).to.be.true;
	});
});
