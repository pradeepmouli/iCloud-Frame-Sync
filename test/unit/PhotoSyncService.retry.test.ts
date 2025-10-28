/**
 * PhotoSyncService - Retry Logic Tests (T012)
 *
 * Tests for retry mechanism with exponential backoff:
 * - Retries failed uploads/downloads up to maxRetries
 * - Exponential backoff between attempts
 * - Tracks retryCount and errorMessage in SyncStateStore
 * - Skips photos exceeding maxRetries
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { PhotoSyncService } from '../../src/services/PhotoSyncService.js';
import type { PhotoState } from '../../src/services/SyncStateStore.js';
import type { iCloudPhoto } from '../../src/services/iCloudEndpoint.js';

describe('PhotoSyncService (T012 - Retry Logic)', () => {
	let sandbox: sinon.SinonSandbox;
	let clock: sinon.SinonFakeTimers;
	let mockLogger: any;
	let mockStateStore: any;
	let mockiCloudEndpoint: any;
	let mockFrameEndpoint: any;
	let photoSyncService: PhotoSyncService;

	const markServiceReady = (service: PhotoSyncService): void => {
		(service as any).ready = true;
		(service as any).initializationError = null;
	};

	function createMockiCloudPhoto(id: string, filename: string): iCloudPhoto {
		return {
			id,
			filename,
			lastModified: new Date(),
			asset: { dateModified: new Date().toISOString() } as any,
			download: sinon.stub().resolves(Buffer.from(`mock-data-${id}`)),
			_exifData: null as any,
			getExifData: sinon.stub().resolves({}),
			toJSON: sinon.stub().returns({ id, filename }),
		} as any;
	}

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		clock = sinon.useFakeTimers();

		mockLogger = {
			info: sandbox.stub(),
			error: sandbox.stub(),
			debug: sandbox.stub(),
			warn: sandbox.stub(),
			child: sandbox.stub().returnsThis(),
		};

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
		markServiceReady(photoSyncService);
	});

	afterEach(() => {
		sandbox.restore();
		clock.restore();
	});

	it('should retry failed uploads up to maxRetries with exponential backoff', async () => {
		const photo = createMockiCloudPhoto('photo-1', 'test.jpg');
		mockiCloudEndpoint.listPhotos.resolves([photo]);

		// Simulate upload failure for first 2 attempts, success on 3rd
		mockFrameEndpoint.upload
			.onCall(0).rejects(new Error('Upload failed'))
			.onCall(1).rejects(new Error('Upload failed again'))
			.onCall(2).resolves('frame-art-id-123');

		// Simulate retryCount in state
		mockStateStore.getPhotoState
			.onCall(0).resolves(null)
			.onCall(1).resolves({ id: 'photo-1', retryCount: 1 } as PhotoState)
			.onCall(2).resolves({ id: 'photo-1', retryCount: 2 } as PhotoState)
			.onCall(3).resolves({ id: 'photo-1', retryCount: 3, status: 'uploaded' } as PhotoState);

		// Run syncPhotos (should retry twice before success)
		const syncPromise = photoSyncService.syncPhotos();
		// Advance clock for backoff delays: 500ms, 1000ms
		await clock.tickAsync(500);
		await clock.tickAsync(1000);
		await syncPromise;

		expect(mockFrameEndpoint.upload.callCount).to.equal(3);
		expect(mockStateStore.updatePhotoState.calledWith('photo-1', sinon.match({
			retryCount: 1,
			status: 'failed',
			errorMessage: 'Upload failed',
		}))).to.be.true;
		expect(mockStateStore.updatePhotoState.calledWith('photo-1', sinon.match({
			retryCount: 2,
			status: 'failed',
			errorMessage: 'Upload failed again',
		}))).to.be.true;
		expect(mockStateStore.updatePhotoState.calledWith('photo-1', sinon.match({
			status: 'uploaded',
		}))).to.be.true;
	});

	it('should skip photos that exceed maxRetries', async () => {
		const photo = createMockiCloudPhoto('photo-2', 'fail.jpg');
		mockiCloudEndpoint.listPhotos.resolves([photo]);

		// Simulate upload always failing
		mockFrameEndpoint.upload.rejects(new Error('Upload failed'));
		mockStateStore.getPhotoState.resolves({ id: 'photo-2', retryCount: 3, status: 'failed' } as PhotoState);

		await photoSyncService.syncPhotos();

		// Should not attempt upload
		expect(mockFrameEndpoint.upload.called).to.be.false;
		// Check that warn was called with message containing "max retries"
		const warnCalls = mockLogger.warn.getCalls();
		const maxRetriesWarning = warnCalls.find((call: any) =>
			call.args[1] && typeof call.args[1] === 'string' && /max retries/i.test(call.args[1])
		);
		expect(maxRetriesWarning).to.not.be.undefined;
	});

	it('should use custom maxRetries from config', async () => {
		// Recreate service with maxRetries = 5
		const config = {
			frame: { host: 'test-frame' },
			iCloud: {
				username: 'test@example.com',
				password: 'test',
				sourceAlbum: 'Test Album',
				dataDirectory: './test-data',
			},
			maxRetries: 5,
		};
		photoSyncService = new PhotoSyncService(config, mockLogger, {
			frameEndpoint: mockFrameEndpoint as any,
			iCloudEndpoint: mockiCloudEndpoint as any,
			stateStore: mockStateStore as any,
		});
		markServiceReady(photoSyncService);

		const photo = createMockiCloudPhoto('photo-3', 'test3.jpg');
		mockiCloudEndpoint.listPhotos.resolves([photo]);
		mockFrameEndpoint.upload.rejects(new Error('Upload failed'));
		mockStateStore.getPhotoState.resolves({ id: 'photo-3', retryCount: 5, status: 'failed' } as PhotoState);

		await photoSyncService.syncPhotos();
		expect(mockFrameEndpoint.upload.called).to.be.false;
		// Check that warn was called with message containing "max retries"
		const warnCalls = mockLogger.warn.getCalls();
		const maxRetriesWarning = warnCalls.find((call: any) =>
			call.args[1] && typeof call.args[1] === 'string' && /max retries/i.test(call.args[1])
		);
		expect(maxRetriesWarning).to.not.be.undefined;
	});
});
