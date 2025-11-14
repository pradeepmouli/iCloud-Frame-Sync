/**
 * Integration test for JSON to SQLite migration
 *
 * Tests the migrate-json-to-sqlite script with fixture data
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prisma } from '../../src/lib/prisma.js';
import { decrypt } from '../../src/lib/encryption.js';
import { migrateJsonState } from '../../src/scripts/migrate-json-to-sqlite.js';

describe('JSON to SQLite Migration', () => {
	const testStateDir = path.join(os.tmpdir(), '.icloud-frame-sync-test-' + Date.now());
	const testStatePath = path.join(testStateDir, 'state.json');

	beforeEach(async () => {
		// Clean database
		await prisma.photoRecord.deleteMany();
		await prisma.album.deleteMany();
		await prisma.configuration.deleteMany();
		await prisma.syncState.deleteMany();
		await prisma.databaseMetadata.deleteMany();

		// Create test state directory
		await fs.mkdir(testStateDir, { recursive: true });
	});

	afterEach(async () => {
		// Clean up test files
		try {
			await fs.rm(testStateDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}

		// Clean database
		await prisma.photoRecord.deleteMany();
		await prisma.album.deleteMany();
		await prisma.configuration.deleteMany();
		await prisma.syncState.deleteMany();
		await prisma.databaseMetadata.deleteMany();
	});

	it('should skip migration when no JSON file exists', async () => {
		// Don't create any JSON file
		await migrateJsonState();

		// Verify nothing was created
		const config = await prisma.configuration.findUnique({ where: { id: 'default' } });
		expect(config).to.equal(null);
	});

	it('should migrate configuration with password encryption', async () => {
		const jsonState = {
			config: {
				icloudUsername: 'test@example.com',
				icloudPassword: 'plaintext-password',
				icloudSourceAlbum: 'Test Album',
				frameHost: '192.168.1.100',
				framePort: 8002,
				syncInterval: 120,
				syncEnabled: true,
				deleteAfterSync: false,
				maxRetries: 5,
			},
		};

		// Create JSON state file in expected location
		const jsonPath = path.join(process.cwd(), '.icloud-frame-sync', 'state.json');
		await fs.mkdir(path.dirname(jsonPath), { recursive: true });
		await fs.writeFile(jsonPath, JSON.stringify(jsonState, null, 2));

		try {
			await migrateJsonState();

			// Verify configuration was migrated
			const config = await prisma.configuration.findUnique({ where: { id: 'default' } });
			expect(config).to.not.equal(null);
			expect(config?.icloudUsername).to.equal('test@example.com');
			expect(config?.icloudSourceAlbum).to.equal('Test Album');
			expect(config?.frameHost).to.equal('192.168.1.100');
			expect(config?.framePort).to.equal(8002);
			expect(config?.syncInterval).to.equal(120);
			expect(config?.syncEnabled).to.equal(true);
			expect(config?.deleteAfterSync).to.equal(false);
			expect(config?.maxRetries).to.equal(5);

			// Verify password was encrypted
			expect(config?.icloudPassword).to.not.equal('plaintext-password');
			expect(config?.icloudPassword).to.not.equal(null);

			// Verify password can be decrypted
			const decrypted = decrypt(config!.icloudPassword!);
			expect(decrypted).to.equal('plaintext-password');

			// Verify backup was created
			const files = await fs.readdir(path.dirname(jsonPath));
			const backupFiles = files.filter(f => f.startsWith('state.json.backup.'));
			expect(backupFiles).to.have.lengthOf(1);

			// Verify metadata was recorded
			const metadata = await prisma.databaseMetadata.findUnique({ where: { key: 'last_migration' } });
			expect(metadata).to.not.equal(null);
			expect(metadata?.value).to.not.equal(null);
		} finally {
			// Cleanup test JSON file and backup
			await fs.rm(path.join(process.cwd(), '.icloud-frame-sync'), { recursive: true, force: true });
		}
	});

	it('should migrate albums with correct metadata', async () => {
		const jsonState = {
			albums: {
				'album-1': {
					name: 'Vacation Photos',
					photoCount: 25,
					lastFetchedAt: '2024-01-15T10:00:00Z',
				},
				'album-2': {
					name: 'Family Events',
					photoCount: 40,
				},
			},
		};

		// Create JSON state file
		const jsonPath = path.join(process.cwd(), '.icloud-frame-sync', 'state.json');
		await fs.mkdir(path.dirname(jsonPath), { recursive: true });
		await fs.writeFile(jsonPath, JSON.stringify(jsonState, null, 2));

		try {
			await migrateJsonState();

			// Verify albums were migrated
			const albums = await prisma.album.findMany();
			expect(albums).to.have.lengthOf(2);

			const album1 = albums.find(a => a.albumId === 'album-1');
			expect(album1).to.not.equal(null);
			expect(album1?.name).to.equal('Vacation Photos');
			expect(album1?.photoCount).to.equal(25);
			expect(album1?.lastFetchedAt).to.not.equal(null);

			const album2 = albums.find(a => a.albumId === 'album-2');
			expect(album2).to.not.equal(null);
			expect(album2?.name).to.equal('Family Events');
			expect(album2?.photoCount).to.equal(40);
			expect(album2?.lastFetchedAt).to.equal(null);
		} finally {
			await fs.rm(path.join(process.cwd(), '.icloud-frame-sync'), { recursive: true, force: true });
		}
	});

	it('should migrate photos with correct status and relationships', async () => {
		const jsonState = {
			albums: {
				'album-1': {
					name: 'Test Album',
					photoCount: 2,
				},
			},
			photos: {
				'checksum-1': {
					filename: 'photo1.jpg',
					sourceAlbum: 'Test Album',
					sourceAlbumId: 'album-1',
					sourcePhotoId: 'photo-id-1',
					frameContentId: 'frame-1',
					uploaded: true,
					lastSyncedAt: '2024-01-15T12:00:00Z',
					errorCount: 0,
					fileSize: 1024000,
					captureDate: '2024-01-10T08:30:00Z',
				},
				'checksum-2': {
					filename: 'photo2.jpg',
					sourceAlbum: 'Test Album',
					sourceAlbumId: 'album-1',
					sourcePhotoId: 'photo-id-2',
					uploaded: false,
					errorCount: 2,
					fileSize: 2048000,
				},
			},
		};

		const jsonPath = path.join(process.cwd(), '.icloud-frame-sync', 'state.json');
		await fs.mkdir(path.dirname(jsonPath), { recursive: true });
		await fs.writeFile(jsonPath, JSON.stringify(jsonState, null, 2));

		try {
			await migrateJsonState();

			// Verify photos were migrated
			const photos = await prisma.photoRecord.findMany({
				include: { album: true },
			});
			expect(photos).to.have.lengthOf(2);

			// Check synced photo
			const photo1 = photos.find(p => p.checksum === 'checksum-1');
			expect(photo1).to.not.equal(null);
			expect(photo1?.filename).to.equal('photo1.jpg');
			expect(photo1?.sourcePhotoId).to.equal('photo-id-1');
			expect(photo1?.frameContentId).to.equal('frame-1');
			expect(photo1?.status).to.equal('synced');
			expect(photo1?.lastSyncedAt).to.not.equal(null);
			expect(photo1?.errorCount).to.equal(0);
			expect(photo1?.fileSize).to.equal(1024000);
			expect(photo1?.captureDate).to.not.equal(null);
			expect(photo1?.album.albumId).to.equal('album-1');

			// Check pending photo
			const photo2 = photos.find(p => p.checksum === 'checksum-2');
			expect(photo2).to.not.equal(null);
			expect(photo2?.filename).to.equal('photo2.jpg');
			expect(photo2?.frameContentId).to.equal(null);
			expect(photo2?.status).to.equal('pending');
			expect(photo2?.lastSyncedAt).to.equal(null);
			expect(photo2?.errorCount).to.equal(2);
			expect(photo2?.fileSize).to.equal(2048000);
		} finally {
			await fs.rm(path.join(process.cwd(), '.icloud-frame-sync'), { recursive: true, force: true });
		}
	});

	it('should create albums for orphaned photos', async () => {
		const jsonState = {
			photos: {
				'checksum-1': {
					filename: 'orphan.jpg',
					sourceAlbum: 'Orphaned Album',
					sourceAlbumId: 'orphan-album',
					sourcePhotoId: 'orphan-photo',
					uploaded: false,
				},
			},
		};

		const jsonPath = path.join(process.cwd(), '.icloud-frame-sync', 'state.json');
		await fs.mkdir(path.dirname(jsonPath), { recursive: true });
		await fs.writeFile(jsonPath, JSON.stringify(jsonState, null, 2));

		try {
			await migrateJsonState();

			// Verify album was auto-created
			const album = await prisma.album.findFirst({
				where: { albumId: 'orphan-album' },
			});
			expect(album).to.not.equal(null);
			expect(album?.name).to.equal('Orphaned Album');

			// Verify photo is linked to album
			const photo = await prisma.photoRecord.findUnique({
				where: { checksum: 'checksum-1' },
				include: { album: true },
			});
			expect(photo).to.not.equal(null);
			expect(photo?.album.id).to.equal(album?.id);
		} finally {
			await fs.rm(path.join(process.cwd(), '.icloud-frame-sync'), { recursive: true, force: true });
		}
	});

	it('should initialize sync state', async () => {
		const jsonState = {
			config: {
				icloudUsername: 'test@example.com',
			},
		};

		const jsonPath = path.join(process.cwd(), '.icloud-frame-sync', 'state.json');
		await fs.mkdir(path.dirname(jsonPath), { recursive: true });
		await fs.writeFile(jsonPath, JSON.stringify(jsonState, null, 2));

		try {
			await migrateJsonState();

			// Verify sync state was initialized
			const syncState = await prisma.syncState.findUnique({
				where: { id: 'default' },
			});
			expect(syncState).to.not.equal(null);
			expect(syncState?.status).to.equal('idle');
		} finally {
			await fs.rm(path.join(process.cwd(), '.icloud-frame-sync'), { recursive: true, force: true });
		}
	});

	it('should handle configuration with defaults', async () => {
		const jsonState = {
			config: {
				icloudUsername: 'test@example.com',
				// Missing optional fields
			},
		};

		const jsonPath = path.join(process.cwd(), '.icloud-frame-sync', 'state.json');
		await fs.mkdir(path.dirname(jsonPath), { recursive: true });
		await fs.writeFile(jsonPath, JSON.stringify(jsonState, null, 2));

		try {
			await migrateJsonState();

			const config = await prisma.configuration.findUnique({ where: { id: 'default' } });
			expect(config).to.not.equal(null);
			expect(config?.icloudUsername).to.equal('test@example.com');
			expect(config?.framePort).to.equal(8002); // Default
			expect(config?.syncInterval).to.equal(60); // Default
			expect(config?.syncEnabled).to.equal(false); // Default
			expect(config?.deleteAfterSync).to.equal(true); // Default
			expect(config?.maxRetries).to.equal(3); // Default
		} finally {
			await fs.rm(path.join(process.cwd(), '.icloud-frame-sync'), { recursive: true, force: true });
		}
	});

	it('should handle complete migration workflow', async () => {
		const jsonState = {
			config: {
				icloudUsername: 'complete@example.com',
				icloudPassword: 'test-password',
				icloudSourceAlbum: 'Main Album',
				frameHost: '192.168.1.50',
			},
			albums: {
				'main-album': {
					name: 'Main Album',
					photoCount: 3,
					lastFetchedAt: '2024-01-20T10:00:00Z',
				},
			},
			photos: {
				'hash-1': {
					filename: 'img1.jpg',
					sourceAlbum: 'Main Album',
					sourceAlbumId: 'main-album',
					sourcePhotoId: 'photo-1',
					uploaded: true,
					frameContentId: 'frame-content-1',
					lastSyncedAt: '2024-01-20T11:00:00Z',
				},
				'hash-2': {
					filename: 'img2.jpg',
					sourceAlbum: 'Main Album',
					sourceAlbumId: 'main-album',
					sourcePhotoId: 'photo-2',
					uploaded: false,
					errorCount: 1,
				},
			},
		};

		const jsonPath = path.join(process.cwd(), '.icloud-frame-sync', 'state.json');
		await fs.mkdir(path.dirname(jsonPath), { recursive: true });
		await fs.writeFile(jsonPath, JSON.stringify(jsonState, null, 2));

		try {
			await migrateJsonState();

			// Verify all components migrated correctly
			const config = await prisma.configuration.findUnique({ where: { id: 'default' } });
			const albums = await prisma.album.findMany();
			const photos = await prisma.photoRecord.findMany();
			const syncState = await prisma.syncState.findUnique({ where: { id: 'default' } });
			const metadata = await prisma.databaseMetadata.findUnique({ where: { key: 'last_migration' } });

			expect(config).to.not.equal(null);
			expect(albums).to.have.lengthOf(1);
			expect(photos).to.have.lengthOf(2);
			expect(syncState).to.not.equal(null);
			expect(metadata).to.not.equal(null);

			// Verify relationships
			const photoWithAlbum = await prisma.photoRecord.findUnique({
				where: { checksum: 'hash-1' },
				include: { album: true },
			});
			expect(photoWithAlbum?.album.albumId).to.equal('main-album');
		} finally {
			await fs.rm(path.join(process.cwd(), '.icloud-frame-sync'), { recursive: true, force: true });
		}
	});
});
