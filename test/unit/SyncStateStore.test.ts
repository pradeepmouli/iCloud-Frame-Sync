import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino, type Logger } from 'pino';
import {
    SyncStateStore,
    type AlbumState,
    type PhotoState,
    type SyncState,
} from '../../src/services/SyncStateStore.js';

/**
 * Helper function to create test PhotoState objects with all required fields.
 */
function createTestPhoto(overrides: Partial<PhotoState> = {}): PhotoState {
	return {
		id: 'test-photo',
		albumId: 'test-album',
		takenAt: '2025-01-01T00:00:00Z',
		uploadedAt: null,
		sizeBytes: 1024,
		format: 'jpeg',
		status: 'pending',
		retryCount: 0,
		checksum: null,
		lastModifiedAt: '2025-01-01T00:00:00Z',
		sourceEndpoint: 'icloud',
		lastSyncedAt: null,
		errorMessage: null,
		...overrides,
	};
}

describe('SyncStateStore', () => {
	let store: SyncStateStore;
	let testDir: string;
	let logger: Logger;

	beforeEach(() => {
		// Create unique test directory for each test
		testDir = join(tmpdir(), `sync-state-test-${Date.now()}`);
		logger = pino({ level: 'silent' }) as Logger; // Silent logger for tests
		store = new SyncStateStore(logger, testDir);
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await rm(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	describe('initialize()', () => {
		it('should create state directory if it does not exist', async () => {
			await store.initialize();
			const statePath = store.getStatePath();
			const content = await readFile(statePath, 'utf8');
			expect(content).to.be.a('string');
		});

		it('should create default state file on first run', async () => {
			await store.initialize();
			const state = await store.read();

			expect(state).to.deep.equal({
				photos: {},
				albums: {},
				frames: {},
				operations: {},
				schedule: null,
				version: '1.0.0',
			});
		});

		it('should not overwrite existing state file', async () => {
			await store.initialize();

			// Modify state
			await store.update((state) => {
				state.photos['test-photo'] = {
					id: 'test-photo',
					albumId: 'album-1',
					takenAt: '2025-01-01T00:00:00Z',
					uploadedAt: null,
					sizeBytes: 1024,
					format: 'jpeg',
					status: 'pending',
					retryCount: 0,
					checksum: null,
					lastModifiedAt: '2025-01-01T00:00:00Z',
					sourceEndpoint: 'icloud',
					lastSyncedAt: null,
					errorMessage: null,
				};
				return state;
			});

			// Re-initialize
			await store.initialize();

			// State should be preserved
			const state = await store.read();
			expect(state.photos['test-photo']).to.exist;
			expect(state.photos['test-photo']?.id).to.equal('test-photo');
		});
	});

	describe('read()', () => {
		it('should read state from disk', async () => {
			await store.initialize();
			const state = await store.read();
			expect(state).to.be.an('object');
			expect(state.version).to.equal('1.0.0');
		});

		it('should throw error if state file is corrupted', async () => {
			await store.initialize();
			const statePath = store.getStatePath();

			// Corrupt the file
			await readFile(statePath, 'utf8');
			await rm(statePath);
			await readFile(statePath, 'utf8').catch(() => {
				// File should not exist
			});

			try {
				await store.read();
				expect.fail('Should have thrown error');
			} catch (error) {
				expect(error).to.be.an('error');
				expect((error as Error).message).to.include('Failed to read sync state');
			}
		});
	});

	describe('write()', () => {
		it('should write state to disk atomically', async () => {
			await store.initialize();

			const newState: SyncState = {
				photos: {
					'photo-1': {
						id: 'photo-1',
						albumId: 'album-1',
						takenAt: '2025-01-15T10:30:00Z',
						uploadedAt: '2025-01-15T10:35:00Z',
						sizeBytes: 2048,
						format: 'jpeg',
						status: 'uploaded',
						retryCount: 0,
						checksum: 'abc123',
						lastModifiedAt: '2025-01-15T10:30:00Z',
						sourceEndpoint: 'icloud',
						lastSyncedAt: '2025-01-15T10:35:00Z',
						errorMessage: null,
					},
				},
				albums: {
					'album-1': {
						id: 'album-1',
						name: 'Test Album',
						lastSyncedAt: '2025-01-15T10:35:00Z',
						photoCount: 1,
					},
				},
				frames: {},
				operations: {},
				schedule: null,
				version: '1.0.0',
			};

			await store.write(newState);

			const readState = await store.read();
			expect(readState).to.deep.equal(newState);
		});

		it('should format JSON with indentation', async () => {
			await store.initialize();

			const newState: SyncState = {
				photos: {},
				albums: {},
				frames: {},
				operations: {},
				schedule: {
					nextRunAt: '2025-01-15T11:00:00Z',
					intervalSeconds: 60,
					isPaused: false,
				},
				version: '1.0.0',
			};

			await store.write(newState);

			const statePath = store.getStatePath();
			const content = await readFile(statePath, 'utf8');

			// Should be pretty-printed with 2-space indentation
			expect(content).to.include('  "schedule":');
			expect(content).to.include('    "nextRunAt"');
		});
	});

	describe('update()', () => {
		it('should apply updater function and persist changes', async () => {
			await store.initialize();

			const photoState: PhotoState = createTestPhoto({
				id: 'photo-2',
				albumId: 'album-1',
				takenAt: '2025-01-16T08:00:00Z',
				sizeBytes: 4096,
				format: 'png',
				status: 'pending',
			});

			await store.update((state) => {
				state.photos['photo-2'] = photoState;
				return state;
			});

			const state = await store.read();
			expect(state.photos['photo-2']).to.deep.equal(photoState);
		});

		it('should support multiple sequential updates', async () => {
			await store.initialize();

			// First update: add photo
			await store.update((state) => {
				state.photos['photo-3'] = createTestPhoto({
					id: 'photo-3',
					albumId: 'album-1',
					takenAt: '2025-01-17T12:00:00Z',
					sizeBytes: 8192,
				});
				return state;
			});

			// Second update: mark as uploaded
			await store.update((state) => {
				const photo = state.photos['photo-3'];
				if (photo) {
					photo.status = 'uploaded';
					photo.uploadedAt = '2025-01-17T12:05:00Z';
				}
				return state;
			});

			const state = await store.read();
			expect(state.photos['photo-3']?.status).to.equal('uploaded');
			expect(state.photos['photo-3']?.uploadedAt).to.equal('2025-01-17T12:05:00Z');
		});

		it('should handle complex state mutations', async () => {
			await store.initialize();

			await store.update((state) => {
				// Add multiple photos
				state.photos['photo-4'] = createTestPhoto({
					id: 'photo-4',
					albumId: 'album-2',
					takenAt: '2025-01-18T09:00:00Z',
				});

				state.photos['photo-5'] = createTestPhoto({
					id: 'photo-5',
					albumId: 'album-2',
					takenAt: '2025-01-18T09:05:00Z',
					sizeBytes: 2048,
					format: 'png',
					status: 'failed',
					retryCount: 3,
				});

				// Add album
				state.albums['album-2'] = {
					id: 'album-2',
					name: 'Vacation Photos',
					lastSyncedAt: '2025-01-18T09:10:00Z',
					photoCount: 2,
				};

				return state;
			});

			const state = await store.read();
			expect(Object.keys(state.photos)).to.have.lengthOf(2);
			expect(Object.keys(state.albums)).to.have.lengthOf(1);
			expect(state.albums['album-2']?.photoCount).to.equal(2);
		});
	});

	describe('clear()', () => {
		it('should reset state to default', async () => {
			await store.initialize();

			// Add some data
			await store.update((state) => {
				state.photos['photo-6'] = createTestPhoto({
					id: 'photo-6',
					albumId: 'album-3',
					takenAt: '2025-01-19T14:00:00Z',
					sizeBytes: 512,
				});
				return state;
			});

			// Clear state
			await store.clear();

			const state = await store.read();
			expect(state.photos).to.be.empty;
			expect(state.albums).to.be.empty;
			expect(state.frames).to.be.empty;
			expect(state.operations).to.be.empty;
			expect(state.schedule).to.be.null;
		});
	});

	describe('getStatePath()', () => {
		it('should return the full path to state file', () => {
			const statePath = store.getStatePath();
			expect(statePath).to.include('state.json');
			expect(statePath).to.be.a('string');
		});
	});

	describe('retry scenarios', () => {
		it('should track photo retry counts correctly', async () => {
			await store.initialize();

			const photoId = 'photo-retry-test';

			// Initial pending state
			await store.update((state) => {
				state.photos[photoId] = createTestPhoto({
					id: photoId,
					albumId: 'album-1',
					takenAt: '2025-01-20T10:00:00Z',
				});
				return state;
			});

			// First failure
			await store.update((state) => {
				const photo = state.photos[photoId];
				if (photo) {
					photo.status = 'failed';
					photo.retryCount = 1;
				}
				return state;
			});

			// Second failure
			await store.update((state) => {
				const photo = state.photos[photoId];
				if (photo) {
					photo.retryCount = 2;
				}
				return state;
			});

			const state = await store.read();
			expect(state.photos[photoId]?.retryCount).to.equal(2);
			expect(state.photos[photoId]?.status).to.equal('failed');
		});

		it('should reset retry count on successful upload', async () => {
			await store.initialize();

			const photoId = 'photo-reset-retry';

			await store.update((state) => {
				state.photos[photoId] = createTestPhoto({
					id: photoId,
					albumId: 'album-1',
					takenAt: '2025-01-20T11:00:00Z',
					sizeBytes: 2048,
					format: 'png',
					status: 'failed',
					retryCount: 2,
				});
				return state;
			});

			// Successful upload
			await store.update((state) => {
				const photo = state.photos[photoId];
				if (photo) {
					photo.status = 'uploaded';
					photo.uploadedAt = '2025-01-20T11:05:00Z';
					photo.retryCount = 0; // Reset on success
				}
				return state;
			});

			const state = await store.read();
			expect(state.photos[photoId]?.retryCount).to.equal(0);
			expect(state.photos[photoId]?.status).to.equal('uploaded');
		});
	});

	// ========================================
	// Photo State Helper Methods Tests (T008)
	// ========================================
	describe('Photo State Helpers', () => {
		beforeEach(async () => {
			await store.initialize();
		});

		describe('getPhotoState()', () => {
			it('should return photo state if it exists', async () => {
				const photoId = 'photo-123';
				await store.updatePhotoState(photoId, {
					albumId: 'album-1',
					status: 'pending',
					checksum: 'abc123',
					sourceEndpoint: 'icloud-endpoint',
				});

				const photo = await store.getPhotoState(photoId);
				expect(photo).to.not.be.null;
				expect(photo?.id).to.equal(photoId);
				expect(photo?.checksum).to.equal('abc123');
				expect(photo?.sourceEndpoint).to.equal('icloud-endpoint');
			});

			it('should return null if photo does not exist', async () => {
				const photo = await store.getPhotoState('nonexistent-photo');
				expect(photo).to.be.null;
			});
		});

		describe('updatePhotoState()', () => {
			it('should create new photo state with defaults', async () => {
				const photoId = 'photo-new';
				await store.updatePhotoState(photoId, {
					albumId: 'album-1',
					checksum: 'def456',
					sourceEndpoint: 'icloud',
				});

				const photo = await store.getPhotoState(photoId);
				expect(photo).to.not.be.null;
				expect(photo?.id).to.equal(photoId);
				expect(photo?.albumId).to.equal('album-1');
				expect(photo?.checksum).to.equal('def456');
				expect(photo?.status).to.equal('pending');
				expect(photo?.retryCount).to.equal(0);
				expect(photo?.lastSyncedAt).to.be.null;
				expect(photo?.errorMessage).to.be.null;
			});

			it('should update existing photo state', async () => {
				const photoId = 'photo-existing';
				await store.updatePhotoState(photoId, {
					albumId: 'album-1',
					status: 'pending',
					checksum: 'old-checksum',
				});

				await store.updatePhotoState(photoId, {
					status: 'uploaded',
					checksum: 'new-checksum',
					lastSyncedAt: '2025-10-20T12:00:00Z',
				});

				const photo = await store.getPhotoState(photoId);
				expect(photo?.status).to.equal('uploaded');
				expect(photo?.checksum).to.equal('new-checksum');
				expect(photo?.lastSyncedAt).to.equal('2025-10-20T12:00:00Z');
				expect(photo?.albumId).to.equal('album-1'); // Preserved
			});

			it('should track error messages on failure', async () => {
				const photoId = 'photo-failed';
				await store.updatePhotoState(photoId, {
					albumId: 'album-1',
					status: 'failed',
					errorMessage: 'Network timeout',
					retryCount: 1,
				});

				const photo = await store.getPhotoState(photoId);
				expect(photo?.status).to.equal('failed');
				expect(photo?.errorMessage).to.equal('Network timeout');
				expect(photo?.retryCount).to.equal(1);
			});
		});

		describe('getPhotosForAlbum()', () => {
			it('should return all photos in an album', async () => {
				await store.updatePhotoState('photo-1', {
					albumId: 'album-A',
					status: 'pending',
				});
				await store.updatePhotoState('photo-2', {
					albumId: 'album-A',
					status: 'uploaded',
				});
				await store.updatePhotoState('photo-3', {
					albumId: 'album-B',
					status: 'pending',
				});

				const photosA = await store.getPhotosForAlbum('album-A');
				const photosB = await store.getPhotosForAlbum('album-B');

				expect(photosA).to.have.lengthOf(2);
				expect(photosB).to.have.lengthOf(1);
				expect(photosA.map((p) => p.id)).to.include.members(['photo-1', 'photo-2']);
			});

			it('should return empty array if album has no photos', async () => {
				const photos = await store.getPhotosForAlbum('empty-album');
				expect(photos).to.be.an('array').that.is.empty;
			});
		});

		describe('getPhotosByStatus()', () => {
			it('should filter photos by status', async () => {
				await store.updatePhotoState('photo-1', {
					albumId: 'album-1',
					status: 'pending',
				});
				await store.updatePhotoState('photo-2', {
					albumId: 'album-1',
					status: 'uploaded',
				});
				await store.updatePhotoState('photo-3', {
					albumId: 'album-1',
					status: 'failed',
				});

				const pending = await store.getPhotosByStatus('pending');
				const uploaded = await store.getPhotosByStatus('uploaded');
				const failed = await store.getPhotosByStatus('failed');

				expect(pending).to.have.lengthOf(1);
				expect(uploaded).to.have.lengthOf(1);
				expect(failed).to.have.lengthOf(1);
				expect(pending[0]?.id).to.equal('photo-1');
				expect(uploaded[0]?.id).to.equal('photo-2');
				expect(failed[0]?.id).to.equal('photo-3');
			});
		});

		describe('getPhotosNeedingSync()', () => {
			it('should return pending and retryable failed photos', async () => {
				await store.updatePhotoState('photo-pending', {
					albumId: 'album-1',
					status: 'pending',
				});
				await store.updatePhotoState('photo-failed-retry', {
					albumId: 'album-1',
					status: 'failed',
					retryCount: 2, // Below default max of 3
				});
				await store.updatePhotoState('photo-failed-exhausted', {
					albumId: 'album-1',
					status: 'failed',
					retryCount: 3, // At max, should not retry
				});
				await store.updatePhotoState('photo-uploaded', {
					albumId: 'album-1',
					status: 'uploaded',
				});

				const needsSync = await store.getPhotosNeedingSync();

				expect(needsSync).to.have.lengthOf(2);
				expect(needsSync.map((p) => p.id)).to.include.members([
					'photo-pending',
					'photo-failed-retry',
				]);
			});

			it('should respect custom max retry count', async () => {
				await store.updatePhotoState('photo-1', {
					albumId: 'album-1',
					status: 'failed',
					retryCount: 1,
				});
				await store.updatePhotoState('photo-2', {
					albumId: 'album-1',
					status: 'failed',
					retryCount: 5,
				});

				const needsSync = await store.getPhotosNeedingSync(5);
				expect(needsSync).to.have.lengthOf(1);
				expect(needsSync[0]?.id).to.equal('photo-1');
			});
		});

		describe('updateAlbumState()', () => {
			it('should create new album state', async () => {
				await store.updateAlbumState('album-1', {
					name: 'Vacation 2025',
					photoCount: 42,
				});

				const state = await store.read();
				expect(state.albums['album-1']).to.exist;
				expect(state.albums['album-1']?.name).to.equal('Vacation 2025');
				expect(state.albums['album-1']?.photoCount).to.equal(42);
			});

			it('should update existing album state', async () => {
				await store.updateAlbumState('album-1', {
					name: 'Old Name',
					photoCount: 10,
				});

				await store.updateAlbumState('album-1', {
					name: 'New Name',
					lastSyncedAt: '2025-10-20T12:00:00Z',
				});

				const state = await store.read();
				expect(state.albums['album-1']?.name).to.equal('New Name');
				expect(state.albums['album-1']?.photoCount).to.equal(10); // Preserved
				expect(state.albums['album-1']?.lastSyncedAt).to.equal('2025-10-20T12:00:00Z');
			});
		});

		describe('getAlbumLastSyncTimestamp()', () => {
			it('should return last sync timestamp if album exists', async () => {
				await store.updateAlbumState('album-1', {
					name: 'Test Album',
					lastSyncedAt: '2025-10-20T10:30:00Z',
				});

				const timestamp = await store.getAlbumLastSyncTimestamp('album-1');
				expect(timestamp).to.equal('2025-10-20T10:30:00Z');
			});

			it('should return null if album never synced', async () => {
				await store.updateAlbumState('album-1', {
					name: 'Never Synced',
				});

				const timestamp = await store.getAlbumLastSyncTimestamp('album-1');
				expect(timestamp).to.be.null;
			});

			it('should return null if album does not exist', async () => {
				const timestamp = await store.getAlbumLastSyncTimestamp('nonexistent');
				expect(timestamp).to.be.null;
			});
		});
	});
});
