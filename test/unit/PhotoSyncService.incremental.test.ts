/**
 * PhotoSyncService - Incremental Sync Tests (T011)
 *
 * Tests for state-aware incremental sync logic:
 * - SyncStateStore integration for tracking photo states
 * - iCloudEndpoint.listPhotos() with lastSyncTimestamp filtering
 * - Photo state updates during sync operations (pending → uploaded → failed)
 * - Checksum calculation and validation
 * - Progress reporting integration
 */

import { expect } from 'chai';
import crypto from 'node:crypto';
import sinon from 'sinon';
import { PhotoSyncService } from '../../src/services/PhotoSyncService.js';
import type { PhotoState } from '../../src/services/SyncStateStore.js';
import type { iCloudPhoto } from '../../src/services/iCloudEndpoint.js';

describe('PhotoSyncService (T011 - Incremental Sync)', () => {
	let sandbox: sinon.SinonSandbox;
	let mockLogger: any;
	let mockStateStore: any;
	let mockiCloudEndpoint: any;
	let mockFrameEndpoint: any;
	let photoSyncService: PhotoSyncService;

	// Helper to create mock iCloudPhoto objects
	function createMockiCloudPhoto(
		id: string,
		filename: string,
		lastModified: Date = new Date('2025-01-01T00:00:00Z')
	): iCloudPhoto {
		return {
			id,
			filename,
			lastModified,
			asset: { dateModified: lastModified.toISOString() } as any,
			download: sinon.stub().resolves(Buffer.from(`mock-data-${id}`)),
			_exifData: null as any,
			getExifData: sinon.stub().resolves({}),
			toJSON: sinon.stub().returns({ id, filename }),
		} as any;
	}

	beforeEach(() => {
		sandbox = sinon.createSandbox();

		// Create mock logger
		mockLogger = {
			info: sandbox.stub(),
			error: sandbox.stub(),
			debug: sandbox.stub(),
			warn: sandbox.stub(),
			child: sandbox.stub().returnsThis(),
		};

		// Create simple mock objects
		mockStateStore = {
			getAlbumLastSyncTimestamp: sandbox.stub().resolves(null),
			getPhotoState: sandbox.stub().resolves(null),
			updatePhotoState: sandbox.stub().resolves(),
			updateAlbumState: sandbox.stub().resolves(),
		};

		mockiCloudEndpoint = {
			listPhotos: sandbox.stub().resolves([]),
			getPhotoCount: sandbox.stub().resolves(0),
		};

		mockFrameEndpoint = {
			upload: sandbox.stub().resolves('frame-art-id-123'),
		};

		// Create PhotoSyncService
		const config = {
			frame: { host: 'test-frame' },
			iCloud: {
				username: 'test@example.com',
				password: 'test',
				sourceAlbum: 'Test Album',
				dataDirectory: './test-data',
			},
		};

		photoSyncService = new PhotoSyncService(config, mockLogger, {
			frameEndpoint: mockFrameEndpoint as any,
			iCloudEndpoint: mockiCloudEndpoint as any,
			stateStore: mockStateStore as any,
		});
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe('syncPhotos() - incremental sync logic', () => {
		it('should use lastSyncTimestamp from state store for incremental fetch', async () => {
			const lastSync = '2025-01-01T00:00:00Z';
			mockStateStore.getAlbumLastSyncTimestamp.resolves(lastSync);

			await photoSyncService.syncPhotos();

			expect(mockStateStore.getAlbumLastSyncTimestamp.calledWith('Test Album')).to.be.true;
			expect(mockiCloudEndpoint.listPhotos.calledWith('Test Album', lastSync)).to.be.true;
		});

		it('should fetch all photos if no previous sync timestamp', async () => {
			await photoSyncService.syncPhotos();

			expect(mockiCloudEndpoint.listPhotos.calledWith('Test Album', undefined)).to.be.true;
		});

		it('should update photo state to pending before processing', async () => {
			const photo = createMockiCloudPhoto('photo-1', 'test.jpg');
			mockiCloudEndpoint.listPhotos.resolves([photo]);

			await photoSyncService.syncPhotos();

			expect(mockStateStore.updatePhotoState.calledWith('photo-1', sinon.match({
				status: 'pending',
				albumId: 'Test Album',
				sourceEndpoint: 'iCloud',
			}))).to.be.true;
		});

		it('should calculate and store photo checksum', async () => {
			const photo = createMockiCloudPhoto('photo-1', 'test.jpg');
			const photoData = Buffer.from('mock-data-photo-1');
			photo.download = sinon.stub().resolves(photoData);

			const expectedChecksum = crypto
				.createHash('sha256')
				.update(photoData)
				.digest('hex');

			mockiCloudEndpoint.listPhotos.resolves([photo]);

			await photoSyncService.syncPhotos();

			expect(mockStateStore.updatePhotoState.calledWith('photo-1', sinon.match({
				checksum: expectedChecksum,
			}))).to.be.true;
		});

		it('should update photo state to uploaded after successful upload', async () => {
			const photo = createMockiCloudPhoto('photo-1', 'test.jpg');
			mockiCloudEndpoint.listPhotos.resolves([photo]);

			await photoSyncService.syncPhotos();

			// Should update to uploaded with upload timestamp
			const uploadedCall = mockStateStore.updatePhotoState.getCalls().find((call: any) =>
				call.args[0] === 'photo-1' && call.args[1].status === 'uploaded'
			);
			expect(uploadedCall).to.not.be.undefined;
			expect(uploadedCall.args[1]).to.have.property('uploadedAt');
		});

		it('should update photo state to failed on upload error', async () => {
			const photo = createMockiCloudPhoto('photo-1', 'test.jpg');
			mockiCloudEndpoint.listPhotos.resolves([photo]);
			mockFrameEndpoint.upload.rejects(new Error('Upload failed'));

			await photoSyncService.syncPhotos();

			expect(mockStateStore.updatePhotoState.calledWith('photo-1', sinon.match({
				status: 'failed',
				errorMessage: sinon.match('Upload failed'),
			}))).to.be.true;
		});

		it('should skip photos that are already uploaded', async () => {
			const photo = createMockiCloudPhoto('photo-1', 'test.jpg');
			mockiCloudEndpoint.listPhotos.resolves([photo]);

			const existingState: Partial<PhotoState> = {
				id: 'photo-1',
				status: 'uploaded',
				checksum: 'existing-checksum',
			};
			mockStateStore.getPhotoState.resolves(existingState);

			await photoSyncService.syncPhotos();

			expect(mockFrameEndpoint.upload.called).to.be.false;
		});

		it('should update album state with sync timestamp', async () => {
			const photo = createMockiCloudPhoto('photo-1', 'test.jpg');
			mockiCloudEndpoint.listPhotos.resolves([photo]);

			const beforeSync = Date.now();
			await photoSyncService.syncPhotos();
			const afterSync = Date.now();

			expect(mockStateStore.updateAlbumState.calledOnce).to.be.true;
			const call = mockStateStore.updateAlbumState.firstCall;
			expect(call.args[0]).to.equal('Test Album');

			const albumUpdate = call.args[1];
			expect(albumUpdate).to.have.property('lastSyncedAt');
			const syncTime = new Date(albumUpdate.lastSyncedAt).getTime();
			expect(syncTime).to.be.at.least(beforeSync);
			expect(syncTime).to.be.at.most(afterSync);
		});

		it('should continue processing after individual photo failure', async () => {
			const photo1 = createMockiCloudPhoto('photo-1', 'test1.jpg');
			const photo2 = createMockiCloudPhoto('photo-2', 'test2.jpg');

			mockiCloudEndpoint.listPhotos.resolves([photo1, photo2]);

			// First upload fails all retries (3 attempts), second succeeds
			mockFrameEndpoint.upload.rejects(new Error('Upload failed'));
			mockFrameEndpoint.upload.onCall(3).resolves('frame-art-id-2'); // After 3 failed attempts for photo1

			await photoSyncService.syncPhotos();

			// Should be called 4 times: 3 retries for photo1, 1 for photo2
			expect(mockFrameEndpoint.upload.callCount).to.equal(4);
			expect(mockStateStore.updatePhotoState.calledWith('photo-1', sinon.match({
				status: 'failed',
			}))).to.be.true;
			expect(mockStateStore.updatePhotoState.calledWith('photo-2', sinon.match({
				status: 'uploaded',
			}))).to.be.true;
		});

		it('should track lastModifiedAt from photo metadata', async () => {
			const lastModified = new Date('2025-01-15T12:30:00Z');
			const photo = createMockiCloudPhoto('photo-1', 'test.jpg', lastModified);

			mockiCloudEndpoint.listPhotos.resolves([photo]);

			await photoSyncService.syncPhotos();

			expect(mockStateStore.updatePhotoState.calledWith('photo-1', sinon.match({
				lastModifiedAt: lastModified.toISOString(),
			}))).to.be.true;
		});

		it('should handle empty photo list gracefully', async () => {
			await photoSyncService.syncPhotos();

			expect(mockFrameEndpoint.upload.called).to.be.false;
			expect(mockStateStore.updateAlbumState.calledOnce).to.be.true;
		});

		it('should log summary with processed/succeeded/failed counts', async () => {
			const photo1 = createMockiCloudPhoto('photo-1', 'test1.jpg');
			const photo2 = createMockiCloudPhoto('photo-2', 'test2.jpg');
			const photo3 = createMockiCloudPhoto('photo-3', 'test3.jpg');

			mockiCloudEndpoint.listPhotos.resolves([photo1, photo2, photo3]);

			// One already uploaded, one succeeds, one fails all retries
			mockStateStore.getPhotoState
				.onFirstCall().resolves({ id: 'photo-1', status: 'uploaded' } as PhotoState)
				.onSecondCall().resolves(null)
				.onThirdCall().resolves(null);

			mockFrameEndpoint.upload
				.onFirstCall().resolves('frame-art-id-2')
				.onCall(1).rejects(new Error('Upload failed'))
				.onCall(2).rejects(new Error('Upload failed'))
				.onCall(3).rejects(new Error('Upload failed'));

			await photoSyncService.syncPhotos();

			// Should log completion with counts
			const logCalls = mockLogger.info.getCalls();
			const completionLog = logCalls.find((call: any) =>
				call.args[1] === 'Photo sync completed'
			);

			expect(completionLog).to.not.be.undefined;
			expect(completionLog.args[0]).to.include({
				processed: 3,
				succeeded: 1,
				failed: 3, // 3 failed attempts for photo3
				skipped: 1,
			});
		});
	});
});
