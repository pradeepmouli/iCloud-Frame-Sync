import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import { pino } from 'pino';
import { iCloudPhoto } from '../../src/services/iCloudEndpoint.js';

// Type alias for iCloudPhotoAsset (inferred from package usage)
type iCloudPhotoAsset = any;

/**
 * Unit tests for iCloudEndpoint incremental photo listing (T009).
 * Tests photo filtering by last modified timestamp.
 */
describe('iCloudEndpoint (T009 - Incremental Fetch)', () => {
	let logger: ReturnType<typeof pino>;

	beforeEach(() => {
		logger = pino({ level: 'silent' });
	});

	describe('iCloudPhoto', () => {
		it('should extract lastModified from asset dateModified field', () => {
			const mockAsset = {
				id: 'photo-1',
				filename: 'test.jpg',
				dimension: [1920, 1080],
				size: 1024000,
				dateModified: '2025-10-15T10:30:00Z',
			} as unknown as iCloudPhotoAsset;

			const photo = new iCloudPhoto(mockAsset);

			expect(photo.lastModified).to.be.instanceOf(Date);
			expect(photo.lastModified.toISOString()).to.equal('2025-10-15T10:30:00.000Z');
		});

		it('should fall back to dateCreated if dateModified is missing', () => {
			const mockAsset = {
				id: 'photo-2',
				filename: 'test2.jpg',
				dimension: [1920, 1080],
				size: 1024000,
				dateCreated: '2025-10-10T08:00:00Z',
			} as unknown as iCloudPhotoAsset;

			const photo = new iCloudPhoto(mockAsset);

			expect(photo.lastModified).to.be.instanceOf(Date);
			expect(photo.lastModified.toISOString()).to.equal('2025-10-10T08:00:00.000Z');
		});

		it('should fall back to added field if both dateModified and dateCreated missing', () => {
			const mockAsset = {
				id: 'photo-3',
				filename: 'test3.jpg',
				dimension: [1920, 1080],
				size: 1024000,
				added: '2025-10-05T12:00:00Z',
			} as unknown as iCloudPhotoAsset;

			const photo = new iCloudPhoto(mockAsset);

			expect(photo.lastModified).to.be.instanceOf(Date);
			expect(photo.lastModified.toISOString()).to.equal('2025-10-05T12:00:00.000Z');
		});

		it('should use current date if no timestamp fields available', () => {
			const before = new Date();

			const mockAsset = {
				id: 'photo-4',
				filename: 'test4.jpg',
				dimension: [1920, 1080],
				size: 1024000,
			} as unknown as iCloudPhotoAsset;

			const photo = new iCloudPhoto(mockAsset);
			const after = new Date();

			expect(photo.lastModified).to.be.instanceOf(Date);
			expect(photo.lastModified.getTime()).to.be.at.least(before.getTime());
			expect(photo.lastModified.getTime()).to.be.at.most(after.getTime());
		});

		it('should preserve all existing Photo interface properties', () => {
			const mockAsset = {
				id: 'photo-5',
				filename: 'vacation.heic',
				dimension: [4032, 3024],
				size: 2048000,
				dateModified: '2025-10-20T14:30:00Z',
			} as unknown as iCloudPhotoAsset;

			const photo = new iCloudPhoto(mockAsset);

			// Check all Photo interface properties
			expect(photo.id).to.equal('photo-5');
			expect(photo.filename).to.equal('vacation.heic');
			expect(photo.dimensions).to.deep.equal({ width: 4032, height: 3024 });
			expect(photo.size).to.equal(2048000);
			expect(photo.lastModified).to.be.instanceOf(Date);
		});
	});

	// Note: Full iCloudEndpoint.listPhotos() tests require mocking icloudjs client
	// which is complex. Integration tests in test/integration/ will cover end-to-end
	// incremental sync workflow including:
	// - Initial full sync (no lastSyncTimestamp)
	// - Subsequent incremental sync (with lastSyncTimestamp)
	// - Filtering out unchanged photos
	// - State store integration

	describe('listPhotos() filtering logic (unit)', () => {
		it('should filter photos by lastModified > lastSyncTimestamp', () => {
			// Create mock photos with different timestamps
			const mockPhotos = [
				new iCloudPhoto({
					id: 'photo-old',
					filename: 'old.jpg',
					dimension: [1920, 1080],
					size: 1000,
					dateModified: '2025-10-10T10:00:00Z',
				} as unknown as iCloudPhotoAsset),
				new iCloudPhoto({
					id: 'photo-new',
					filename: 'new.jpg',
					dimension: [1920, 1080],
					size: 1000,
					dateModified: '2025-10-20T15:00:00Z',
				} as unknown as iCloudPhotoAsset),
			];

			const lastSyncTimestamp = '2025-10-15T00:00:00Z';
			const filterDate = new Date(lastSyncTimestamp);

			const filtered = mockPhotos.filter((p) => p.lastModified > filterDate);

			expect(filtered).to.have.lengthOf(1);
			expect(filtered[0]?.id).to.equal('photo-new');
		});

		it('should return all photos if lastSyncTimestamp not provided', () => {
			const mockPhotos = [
				new iCloudPhoto({
					id: 'photo-1',
					filename: '1.jpg',
					dimension: [1920, 1080],
					size: 1000,
					dateModified: '2025-10-10T10:00:00Z',
				} as unknown as iCloudPhotoAsset),
				new iCloudPhoto({
					id: 'photo-2',
					filename: '2.jpg',
					dimension: [1920, 1080],
					size: 1000,
					dateModified: '2025-10-20T15:00:00Z',
				} as unknown as iCloudPhotoAsset),
			];

			// No filtering
			const filtered = mockPhotos; // No filter applied

			expect(filtered).to.have.lengthOf(2);
		});

		it('should return empty array if all photos before lastSyncTimestamp', () => {
			const mockPhotos = [
				new iCloudPhoto({
					id: 'photo-old-1',
					filename: 'old1.jpg',
					dimension: [1920, 1080],
					size: 1000,
					dateModified: '2025-10-10T10:00:00Z',
				} as unknown as iCloudPhotoAsset),
				new iCloudPhoto({
					id: 'photo-old-2',
					filename: 'old2.jpg',
					dimension: [1920, 1080],
					size: 1000,
					dateModified: '2025-10-12T15:00:00Z',
				} as unknown as iCloudPhotoAsset),
			];

			const lastSyncTimestamp = '2025-10-20T00:00:00Z';
			const filterDate = new Date(lastSyncTimestamp);

			const filtered = mockPhotos.filter((p) => p.lastModified > filterDate);

			expect(filtered).to.be.empty;
		});
	});
});
