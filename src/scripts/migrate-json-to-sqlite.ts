/**
 * JSON to SQLite Migration Script
 *
 * Migrates existing JSON state file to SQLite database
 * Runs automatically on Docker startup if JSON file exists
 *
 * @module scripts/migrate-json-to-sqlite
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import { encrypt } from '../lib/encryption.js';
import { prisma } from '../lib/prisma.js';

const logger = pino({ name: 'migration' });

interface JsonState {
	config?: {
		icloudUsername?: string;
		icloudPassword?: string;
		icloudSourceAlbum?: string;
		frameHost?: string;
		framePort?: number;
		syncInterval?: number;
		syncEnabled?: boolean;
		deleteAfterSync?: boolean;
		maxRetries?: number;
	};
	photos?: Record<
		string,
		{
			filename: string;
			sourceAlbum: string;
			sourceAlbumId: string;
			sourcePhotoId: string;
			frameContentId?: string;
			uploaded?: boolean;
			lastSyncedAt?: string;
			errorCount?: number;
			fileSize?: number;
			captureDate?: string;
		}
	>;
	albums?: Record<
		string,
		{
			name: string;
			photoCount: number;
			lastFetchedAt?: string;
		}
	>;
}

async function findJsonStateFile(): Promise<string | null> {
	const possiblePaths = [
		path.join(process.cwd(), '.icloud-frame-sync', 'state.json'),
		path.join(os.homedir(), '.icloud-frame-sync', 'state.json'),
		'/app/.icloud-frame-sync/state.json',
	];

	for (const filePath of possiblePaths) {
		try {
			await fs.access(filePath);
			logger.info({ filePath }, 'Found JSON state file');
			return filePath;
		} catch {
			// File doesn't exist, try next path
		}
	}

	return null;
}

async function migrateJsonState() {
	try {
		// Find JSON state file
		const jsonPath = await findJsonStateFile();

		if (!jsonPath) {
			logger.info('No JSON state file found, skipping migration');
			return;
		}

		// Read JSON state
		const jsonContent = await fs.readFile(jsonPath, 'utf-8');
		const jsonState: JsonState = JSON.parse(jsonContent);

		logger.info('Starting JSON to SQLite migration...');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await prisma.$transaction(async (tx: any) => {
			// Migrate configuration
			if (jsonState.config) {
				logger.info('Migrating configuration...');
				await tx.configuration.upsert({
					where: { id: 'default' },
					create: {
						id: 'default',
						icloudUsername: jsonState.config.icloudUsername,
						icloudPassword: jsonState.config.icloudPassword
							? encrypt(jsonState.config.icloudPassword)
							: null,
						icloudSourceAlbum: jsonState.config.icloudSourceAlbum,
						frameHost: jsonState.config.frameHost,
						framePort: jsonState.config.framePort || 8002,
						syncInterval: jsonState.config.syncInterval || 60,
						syncEnabled: jsonState.config.syncEnabled ?? false,
						deleteAfterSync: jsonState.config.deleteAfterSync ?? true,
						maxRetries: jsonState.config.maxRetries || 3,
					},
					update: {
						icloudUsername: jsonState.config.icloudUsername,
						icloudPassword: jsonState.config.icloudPassword
							? encrypt(jsonState.config.icloudPassword)
							: undefined,
						icloudSourceAlbum: jsonState.config.icloudSourceAlbum,
						frameHost: jsonState.config.frameHost,
						framePort: jsonState.config.framePort || 8002,
						syncInterval: jsonState.config.syncInterval || 60,
						syncEnabled: jsonState.config.syncEnabled ?? false,
						deleteAfterSync: jsonState.config.deleteAfterSync ?? true,
						maxRetries: jsonState.config.maxRetries || 3,
					},
				});
				logger.info('✓ Configuration migrated');
			}

			// Migrate albums
			const albumMap = new Map<string, string>(); // albumId -> database ID
			if (jsonState.albums) {
				logger.info(
					`Migrating ${Object.keys(jsonState.albums).length} albums...`,
				);
				for (const [albumId, albumData] of Object.entries(jsonState.albums)) {
					const album = await tx.album.upsert({
						where: { albumId },
						create: {
							albumId,
							name: albumData.name,
							photoCount: albumData.photoCount || 0,
							lastFetchedAt: albumData.lastFetchedAt
								? new Date(albumData.lastFetchedAt)
								: null,
						},
						update: {
							name: albumData.name,
							photoCount: albumData.photoCount || 0,
							lastFetchedAt: albumData.lastFetchedAt
								? new Date(albumData.lastFetchedAt)
								: null,
						},
					});
					albumMap.set(albumId, album.id);
				}
				logger.info(`✓ ${albumMap.size} albums migrated`);
			}

			// Migrate photos
			if (jsonState.photos) {
				logger.info(
					`Migrating ${Object.keys(jsonState.photos).length} photos...`,
				);
				let migratedCount = 0;

				for (const [checksum, photoData] of Object.entries(jsonState.photos)) {
					// Ensure album exists
					let dbAlbumId = albumMap.get(photoData.sourceAlbumId);
					if (!dbAlbumId) {
						// Create album if not found
						const album = await tx.album.upsert({
							where: { albumId: photoData.sourceAlbumId },
							create: {
								albumId: photoData.sourceAlbumId,
								name: photoData.sourceAlbum,
								photoCount: 0,
							},
							update: {},
						});
						dbAlbumId = album.id;
						albumMap.set(photoData.sourceAlbumId, album.id);
					}

					// Create photo record
					await tx.photoRecord.upsert({
						where: { checksum },
						create: {
							checksum,
							filename: photoData.filename,
							sourceAlbumId: dbAlbumId,
							sourcePhotoId: photoData.sourcePhotoId,
							frameContentId: photoData.frameContentId,
							status: photoData.uploaded ? 'synced' : 'pending',
							lastSyncedAt: photoData.lastSyncedAt
								? new Date(photoData.lastSyncedAt)
								: null,
							errorCount: photoData.errorCount || 0,
							fileSize: photoData.fileSize,
							captureDate: photoData.captureDate
								? new Date(photoData.captureDate)
								: null,
						},
						update: {
							filename: photoData.filename,
							frameContentId: photoData.frameContentId,
							status: photoData.uploaded ? 'synced' : 'pending',
							lastSyncedAt: photoData.lastSyncedAt
								? new Date(photoData.lastSyncedAt)
								: null,
							errorCount: photoData.errorCount || 0,
							fileSize: photoData.fileSize,
							captureDate: photoData.captureDate
								? new Date(photoData.captureDate)
								: null,
						},
					});

					migratedCount++;
				}

				logger.info(`✓ ${migratedCount} photos migrated`);
			}

			// Initialize sync state
			await tx.syncState.upsert({
				where: { id: 'default' },
				create: {
					id: 'default',
					status: 'idle',
				},
				update: {},
			});
		});

		// Backup original JSON file
		const backupPath = `${jsonPath}.backup.${Date.now()}`;
		await fs.copyFile(jsonPath, backupPath);
		logger.info({ backupPath }, '✅ Migration complete. JSON backup created.');

		// Add migration metadata
		await prisma.databaseMetadata.upsert({
			where: { key: 'last_migration' },
			create: {
				key: 'last_migration',
				value: new Date().toISOString(),
			},
			update: {
				value: new Date().toISOString(),
			},
		});
	} catch (error) {
		logger.error({ error }, '❌ Migration failed');
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	migrateJsonState()
		.then(() => {
			logger.info('Migration script completed successfully');
			process.exit(0);
		})
		.catch((error) => {
			logger.error({ error }, 'Migration script failed');
			process.exit(1);
		});
}

export { migrateJsonState };
