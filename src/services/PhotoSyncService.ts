import crypto from 'node:crypto';
import path from 'node:path';
import type { Logger } from 'pino';
import type {
	Endpoint,
	FrameConfig,
	iCloudConfig,
	Photo,
} from '../types/endpoint.js';
import { FrameEndpoint } from './FrameEndpoint.js';
import { iCloudEndpoint } from './iCloudEndpoint.js';
import { SyncStateStore, type PhotoState } from './SyncStateStore.js';

export interface PhotoSyncServiceConfig {
	frame: FrameConfig;
	iCloud: iCloudConfig;
}

export interface PhotoSyncServiceOptions {
	frameEndpoint?: FrameEndpoint;
	iCloudEndpoint?: iCloudEndpoint;
	stateStore?: SyncStateStore;
}

export class PhotoSyncService {
	private logger: Logger;
	private frameEndpoint: FrameEndpoint;
	private iCloudEndpoint: iCloudEndpoint;
	private stateStore: SyncStateStore;
	private sourceAlbum: string;
	private handledPhotos = new Set<string>();
	private maxRetries: number;
	private baseDelayMs: number = 500;

	public get frame() {
		return this.frameEndpoint;
	}

	public get iCloud() {
		return this.iCloudEndpoint;
	}

	constructor (
		config: PhotoSyncServiceConfig,
		logger: Logger,
		options?: PhotoSyncServiceOptions,
	) {
		this.logger = logger;
		// Defensive: allow missing config.iCloud or sourceAlbum
		this.sourceAlbum = config?.iCloud?.sourceAlbum ?? 'Default Album';
		this.maxRetries = (config as any)?.maxRetries ?? 3;

		// Use provided instances or create new ones
		const frameConfig = {
			...config?.frame,
			services: (config?.frame?.services || []).map(String),
		};
		this.frameEndpoint = options?.frameEndpoint ?? new FrameEndpoint(
			frameConfig,
			this.logger.child({ name: 'Frame' }),
		);
		this.iCloudEndpoint = options?.iCloudEndpoint ?? new iCloudEndpoint(
			{
				...config?.iCloud,
				dataDirectory: config?.iCloud?.dataDirectory || path.resolve('data'),
			},
			this.logger.child({ name: 'iCloud' }),
		);
		// Initialize state store
		this.stateStore = options?.stateStore ?? new SyncStateStore(
			this.logger.child({ name: 'StateStore' })
		);
	}

	async initialize(): Promise<void> {
		this.logger.info('Initializing Photo Sync Service...');
		await this.stateStore.initialize();
		await this.iCloudEndpoint.initialize();
		await this.frameEndpoint.initialize();
		this.logger.info('Photo Sync Service initialized');
	}

	async close(): Promise<void> {
		this.logger.info('Closing Photo Sync Service...');
		await this.frameEndpoint?.close();
		await this.iCloudEndpoint?.close();
		this.logger.info('Photo Sync Service closed');
	}

	/**
	 * Syncs photos from iCloud to Samsung Frame with incremental sync and state tracking.
	 * Uses lastSyncTimestamp to fetch only new/modified photos.
	 */
	async syncPhotos(): Promise<void> {
		this.logger.info(
			{ albumId: this.sourceAlbum },
			'Starting incremental photo sync...'
		);

		const startTime = Date.now();
		let processed = 0;
		let succeeded = 0;
		let failed = 0;
		let skipped = 0;

		try {
			// Get last sync timestamp for incremental fetch
			const lastSyncTimestamp = await this.stateStore.getAlbumLastSyncTimestamp(
				this.sourceAlbum
			);
			this.logger.debug(
				{ albumId: this.sourceAlbum, lastSyncTimestamp },
				'Fetching photos for incremental sync'
			);
			// Fetch photos from iCloud (only new/modified if lastSyncTimestamp exists)
			const photos = await this.iCloudEndpoint.listPhotos(
				this.sourceAlbum,
				lastSyncTimestamp ?? undefined
			);
			this.logger.info(
				{ photoCount: photos.length, albumId: this.sourceAlbum },
				'Fetched photos from iCloud'
			);
			// Process each photo
			for (const photo of photos) {
				processed++;
				// Check state for retryCount and status
				const existingState = await this.stateStore.getPhotoState(photo.id);
				const currentRetry = existingState?.retryCount ?? 0;
				if (existingState?.status === 'uploaded') {
					this.logger.debug(
						{ photoId: photo.id, filename: photo.filename },
						'Photo already uploaded, skipping'
					);
					skipped++;
					continue;
				}
				// If retryCount >= maxRetries, skip before any upload attempt
				if (currentRetry >= this.maxRetries) {
					this.logger.warn(
						{ photoId: photo.id, retryCount: currentRetry, filename: photo.filename },
						`Photo exceeded max retries (${this.maxRetries}), skipping.`
					);
					skipped++;
					continue;
				}
				let lastError: string | undefined;
				let success = false;
				for (let attempt = currentRetry; attempt < this.maxRetries; attempt++) {
					try {
						// Update state to pending
						await this.stateStore.updatePhotoState(photo.id, {
							status: 'pending',
							albumId: this.sourceAlbum,
							sourceEndpoint: 'iCloud',
							lastModifiedAt: photo.lastModified.toISOString(),
							retryCount: attempt,
						});
						// Download photo data
						this.logger.debug({ photoId: photo.id, attempt }, 'Downloading photo');
						const photoData = await photo.download();
						// Calculate checksum
						const checksum = crypto
							.createHash('sha256')
							.update(photoData)
							.digest('hex');
						// Update state with checksum
						await this.stateStore.updatePhotoState(photo.id, {
							checksum,
							sizeBytes: photoData.length,
						});
						// Upload to Frame
						this.logger.info(
							{ photoId: photo.id, filename: photo.filename, size: photoData.length, attempt },
							'Uploading photo to Frame'
						);
						const frameArtId = await this.frameEndpoint.upload(photo);
						// Update state to uploaded
						await this.stateStore.updatePhotoState(photo.id, {
							status: 'uploaded',
							uploadedAt: new Date().toISOString(),
							lastSyncedAt: new Date().toISOString(),
							retryCount: attempt,
							errorMessage: undefined,
						});
						succeeded++;
						this.logger.info(
							{ photoId: photo.id, frameArtId, filename: photo.filename, attempt },
							'Photo uploaded successfully'
						);
						success = true;
						break;
					} catch (error) {
						lastError = error instanceof Error ? error.message : String(error);
						this.logger.error(
							{ photoId: photo.id, filename: photo.filename, error: lastError, attempt },
							'Failed to sync photo (will retry if attempts remain)'
						);
						await this.stateStore.updatePhotoState(photo.id, {
							status: 'failed',
							errorMessage: lastError,
							retryCount: attempt + 1,
						});
						failed++;
						// Exponential backoff
						const delayMs = this.baseDelayMs * Math.pow(2, attempt);
						await new Promise(res => setTimeout(res, delayMs));
					}
				}
				if (!success) {
					this.logger.warn(
						{ photoId: photo.id, filename: photo.filename, lastError, maxRetries: this.maxRetries },
						'Photo failed all retry attempts, skipping.'
					);
				}
			}
			// Update album state with sync timestamp
			await this.stateStore.updateAlbumState(this.sourceAlbum, {
				lastSyncedAt: new Date().toISOString(),
				photoCount: photos.length,
			});
			const duration = Date.now() - startTime;
			this.logger.info(
				{
					albumId: this.sourceAlbum,
					processed,
					succeeded,
					failed,
					skipped,
					durationMs: duration,
				},
				'Photo sync completed'
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			this.logger.error(
				{ albumId: this.sourceAlbum, error: errorMessage },
				'Photo sync failed'
			);
			throw error;
		}
	}

	// Optionally, add handledPhotos tracking if needed for deduplication, etc.
}


// Remove duplicate/old class definition and members below:
// ...existing code...
