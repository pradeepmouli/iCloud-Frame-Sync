import { expect } from 'chai';
import type { Logger } from 'pino';
import sinon from 'sinon';
import { PhotoSyncService } from '../../src/services/PhotoSyncService';

describe('PhotoSyncService', () => {
	let photoSyncService: PhotoSyncService;
	let mockFrameClient: any;
	let mockLogger: any;
	let sandbox: sinon.SinonSandbox;
	let mockiCloudService: any;

	const markServiceReady = (service: PhotoSyncService): void => {
		(service as any).ready = true;
		(service as any).initializationError = null;
	};

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
			child: sandbox.stub().returnsThis(),
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
				photos: 'mocked-photos-url',
			},
		};

		const config = {
			frame: {
				host: 'mock-frame-host',
				name: 'MockFrame',
				services: ['art-mode'],
			},
			iCloud: {
				username: 'test@example.com',
				password: 'testpassword',
				sourceAlbum: 'Test Album',
				dataDirectory: './test-data',
			},
		};

		// Create a real SyncStateStore instance but stub its methods
		const stateStore = Object.create({});
		stateStore.initialize = sandbox.stub().resolves();
		stateStore.getAlbumLastSyncTimestamp = sandbox.stub().resolves(null);
		stateStore.getPhotoState = sandbox.stub().resolves(null);
		stateStore.updatePhotoState = sandbox.stub().resolves();
		stateStore.updateAlbumState = sandbox.stub().resolves();

		photoSyncService = new PhotoSyncService(config, mockLogger, {
			frameEndpoint: mockFrameClient,
			iCloudEndpoint: mockiCloudService,
			stateStore,
		});
		markServiceReady(photoSyncService);
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('constructor', () => {
		it('should create a PhotoSyncService instance', () => {
			expect(photoSyncService).to.be.instanceOf(PhotoSyncService);
		});
	});



	describe('syncPhotos', () => {
		it('should call state store and endpoints for each photo', async () => {
			// Setup mocks for endpoints and state store
			const mockPhoto = {
				id: 'photo-1',
				filename: 'test.jpg',
				lastModified: new Date(),
				download: sandbox.stub().resolves(new Uint8Array([1, 2, 3])),
			};
			// Attach stubs to public getters
			const iCloudEndpoint = photoSyncService.iCloud;
			const frameEndpoint = photoSyncService.frame;
			const stateStore = (photoSyncService as any).stateStore ?? photoSyncService['stateStore'];

			const listPhotosStub = sandbox.stub().resolves([mockPhoto]);
			const uploadStub = sandbox.stub().resolves('frame-art-id-1');
			iCloudEndpoint.listPhotos = listPhotosStub;
			frameEndpoint.upload = uploadStub;
			stateStore.getAlbumLastSyncTimestamp = sandbox.stub().resolves(null);
			stateStore.getPhotoState = sandbox.stub().resolves(null);
			stateStore.updatePhotoState = sandbox.stub().resolves();
			stateStore.updateAlbumState = sandbox.stub().resolves();

			await photoSyncService.syncPhotos();

			expect(listPhotosStub.calledOnce).to.be.true;
			expect(uploadStub.calledOnce).to.be.true;
			expect(stateStore.updatePhotoState.called).to.be.true;
			expect(stateStore.updateAlbumState.calledOnce).to.be.true;
		});
	});
});
