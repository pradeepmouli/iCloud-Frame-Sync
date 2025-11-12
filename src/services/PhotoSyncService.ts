import crypto from 'node:crypto';
import path from 'node:path';
import type { Logger } from 'pino';

import type { FrameConfig, iCloudConfig } from '../types/endpoint.js';
import type {
	AlbumSummary,
	ManualSyncRequest,
	PhotoListQuery,
	PhotoPage,
	PhotoSummary,
	SettingsConfigSnapshot,
	SettingsUpdateRequest,
	SyncAccepted,
} from './dashboardTypes.js';
import { FrameEndpoint } from './FrameEndpoint.js';
import { iCloudEndpoint } from './iCloudEndpoint.js';
import { SyncStateStore } from './SyncStateStore.js';

export class SetupRequiredError extends Error {
	constructor (message = 'Photo sync service is not fully configured yet.') {
		super(message);
		this.name = 'SetupRequiredError';
	}
}

export interface PhotoSyncServiceConfig {
	frame: FrameConfig;
	iCloud: iCloudConfig;
}

export interface PhotoSyncServiceOptions {
	frameEndpoint?: FrameEndpoint;
	iCloudEndpoint?: iCloudEndpoint;
	stateStore?: SyncStateStore;
}

interface SyncSummary {
	processed: number;
	succeeded: number;
	failed: number;
	skipped: number;
	photoIds: string[];
}

export class PhotoSyncService {
	private frameEndpoint: FrameEndpoint;
	private iCloudEndpoint: iCloudEndpoint;
	private readonly stateStore: SyncStateStore;
	private sourceAlbum: string;
	private readonly maxRetries: number;
	private readonly baseDelayMs = 500;
	private readonly webPort: number;
	private currentSettings: SettingsConfigSnapshot;
	private readonly initialFrameHost: string;
	private readonly initialSyncIntervalSeconds?: number;
	private stateStoreInitialized = false;
	private ready = false;
	private initializationError: Error | null = null;
	private readonly useFrameOverride: boolean;
	private readonly useICloudOverride: boolean;
	private frameEndpointHost: string;
	private iCloudEndpointUsername: string;
	private iCloudEndpointPassword: string;

	constructor (
		private readonly config: PhotoSyncServiceConfig,
		private readonly logger: Logger,
		options?: PhotoSyncServiceOptions,
	) {
		this.sourceAlbum = config?.iCloud?.sourceAlbum ?? 'Default Album';
		this.maxRetries = (config as unknown as { maxRetries?: number; })?.maxRetries ?? 3;
		this.initialFrameHost = config?.frame?.host ?? 'unknown-frame';
		this.initialSyncIntervalSeconds = (config as unknown as { syncIntervalSeconds?: number; })?.syncIntervalSeconds;
		this.webPort = Number.parseInt(process.env.WEB_PORT ?? '3001', 10);

		const frameConfig: FrameConfig = {
			...config.frame,
			services: (config.frame?.services || []).map(String),
		};

		this.useFrameOverride = Boolean(options?.frameEndpoint);
		this.useICloudOverride = Boolean(options?.iCloudEndpoint);

		this.frameEndpoint =
			options?.frameEndpoint ??
			new FrameEndpoint(frameConfig, this.logger.child({ name: 'Frame' }));
		this.frameEndpointHost = frameConfig.host;

		const iCloudConfig: iCloudConfig = {
			...config.iCloud,
			dataDirectory:
				config.iCloud?.dataDirectory ?? path.resolve('data'),
		};
		this.iCloudEndpoint =
			options?.iCloudEndpoint ??
			new iCloudEndpoint(
				iCloudConfig,
				this.logger.child({ name: 'iCloud' }),
			);
		this.iCloudEndpointUsername = iCloudConfig.username;
		this.iCloudEndpointPassword = iCloudConfig.password;

		this.stateStore =
			options?.stateStore ??
			new SyncStateStore(this.logger.child({ name: 'StateStore' }));

		this.refreshCurrentSettings();
	}

	public get frame(): FrameEndpoint {
		return this.frameEndpoint;
	}

	public get iCloud(): iCloudEndpoint {
		return this.iCloudEndpoint;
	}

	public isReady(): boolean {
		return this.ready;
	}

	public getLastError(): string | null {
		return this.initializationError?.message ?? null;
	}

	private getMissingConfigFields(): string[] {
		const missing: string[] = [];
		if (!this.config?.iCloud?.username || this.config.iCloud.username.trim().length === 0) {
			missing.push('ICLOUD_USERNAME');
		}
		if (!this.config?.iCloud?.password || this.config.iCloud.password.trim().length === 0) {
			missing.push('ICLOUD_PASSWORD');
		}
		if (!this.config?.frame?.host || this.config.frame.host.trim().length === 0) {
			missing.push('SAMSUNG_FRAME_HOST');
		}
		return missing;
	}

	private buildSettingsSnapshot(): SettingsConfigSnapshot {
		const missing = this.getMissingConfigFields();
		return {
			syncAlbumName: this.sourceAlbum,
			frameHost: this.config.frame?.host ?? '',
			syncIntervalSeconds: this.currentSettings?.syncIntervalSeconds ?? this.initialSyncIntervalSeconds,
			logLevel: this.currentSettings?.logLevel,
			corsOrigin: this.currentSettings?.corsOrigin,
			webPort: this.webPort,
			iCloudUsername: this.config.iCloud?.username,
			hasICloudPassword: Boolean(this.config.iCloud?.password),
			isConfigured: this.ready && missing.length === 0,
			missingFields: missing,
			lastError: this.initializationError?.message ?? null,
		};
	}

	private refreshCurrentSettings(): void {
		this.currentSettings = this.buildSettingsSnapshot();
	}

	private async rebuildEndpointsIfNeeded(): Promise<void> {
		if (!this.useFrameOverride) {
			const desiredHost = this.config.frame?.host ?? '';
			if (desiredHost !== this.frameEndpointHost) {
				// Close old endpoint before creating new one
				if (this.frameEndpoint) {
					try {
						await this.frameEndpoint.close();
					} catch (error) {
						this.logger.warn({ error }, 'Failed to close old frame endpoint');
					}
				}
				const frameConfig: FrameConfig = {
					...this.config.frame,
					services: (this.config.frame?.services || []).map(String),
				};
				this.frameEndpoint = new FrameEndpoint(
					frameConfig,
					this.logger.child({ name: 'Frame' }),
				);
				this.frameEndpointHost = frameConfig.host;
			}
		}

		if (!this.useICloudOverride) {
			const desiredUsername = this.config.iCloud?.username ?? '';
			const desiredPassword = this.config.iCloud?.password ?? '';
			if (desiredUsername !== this.iCloudEndpointUsername || desiredPassword !== this.iCloudEndpointPassword) {
				const iCloudConfig: iCloudConfig = {
					...this.config.iCloud,
					dataDirectory:
						this.config.iCloud?.dataDirectory ?? path.resolve('data'),
				};
				this.iCloudEndpoint = new iCloudEndpoint(
					iCloudConfig,
					this.logger.child({ name: 'iCloud' }),
				);
				this.iCloudEndpointUsername = iCloudConfig.username;
				this.iCloudEndpointPassword = iCloudConfig.password;
			}
		}
	}

	getCurrentSettings(): SettingsConfigSnapshot {
		this.refreshCurrentSettings();
		return this.currentSettings;
	}

	async initialize(): Promise<void> {
		this.logger.info('Initializing Photo Sync Service...');
		if (!this.stateStoreInitialized) {
			await this.stateStore.initialize();
			this.stateStoreInitialized = true;
		}

		await this.rebuildEndpointsIfNeeded();

		const missing = this.getMissingConfigFields();
		if (missing.length > 0) {
			this.ready = false;
			this.initializationError = new Error(`Missing configuration: ${missing.join(', ')}`);
			this.logger.warn(
				{ missing },
				'Configuration incomplete. Deferring endpoint initialization until setup is complete.',
			);
			this.refreshCurrentSettings();
			return;
		}

		try {
			await this.iCloudEndpoint.initialize();
		} catch (error) {
			this.ready = false;
			this.initializationError = error instanceof Error ? error : new Error(String(error));
			this.logger.error(
				{ error: this.initializationError?.message },
				'Failed to initialize Photo Sync Service. Continuing in setup mode.',
			);
			this.refreshCurrentSettings();
			return;
		}

		try {
			await this.frameEndpoint.initialize();
		} catch (error) {
			this.ready = false;
			this.initializationError = error instanceof Error ? error : new Error(String(error));
			this.logger.error(
				{ error: this.initializationError?.message },
				'Failed to initialize Photo Sync Service. Continuing in setup mode.',
			);
			this.refreshCurrentSettings();
			return;
		}

		this.ready = true;
		this.initializationError = null;
		this.logger.info('Photo Sync Service initialized');
		this.refreshCurrentSettings();
	}

	async close(): Promise<void> {
		this.logger.info('Closing Photo Sync Service...');
		await this.frameEndpoint.close();
		await this.iCloudEndpoint.close();
		this.logger.info('Photo Sync Service closed');
	}

	async syncPhotos(): Promise<SyncSummary> {
		if (!this.ready) {
			throw new SetupRequiredError(
				this.initializationError?.message ?? 'Sync service must be configured before running.',
			);
		}

		this.logger.info({ albumId: this.sourceAlbum }, 'Starting incremental photo sync...');

		const startTime = Date.now();
		let processed = 0;
		let succeeded = 0;
		let failed = 0;
		let skipped = 0;
		const processedPhotoIds: string[] = [];

		try {
			const lastSyncTimestamp = await this.stateStore.getAlbumLastSyncTimestamp(this.sourceAlbum);
			this.logger.debug(
				{ albumId: this.sourceAlbum, lastSyncTimestamp },
				'Fetching photos for incremental sync',
			);

			const photos = await this.iCloudEndpoint.listPhotos(
				this.sourceAlbum,
				lastSyncTimestamp ?? undefined,
			);

			this.logger.info(
				{ photoCount: photos.length, albumId: this.sourceAlbum },
				'Fetched photos from iCloud',
			);

			for (const photo of photos) {
				processed++;

				const existingState = await this.stateStore.getPhotoState(photo.id);
				const currentRetry = existingState?.retryCount ?? 0;

				if (existingState?.status === 'uploaded') {
					this.logger.debug({ photoId: photo.id, filename: photo.filename }, 'Photo already uploaded, skipping');
					skipped++;
					continue;
				}

				if (currentRetry >= this.maxRetries) {
					this.logger.warn(
						{ photoId: photo.id, retryCount: currentRetry, filename: photo.filename },
						`Photo exceeded max retries (${this.maxRetries}), skipping.`,
					);
					skipped++;
					continue;
				}

				processedPhotoIds.push(photo.id);
				let success = false;
				let lastError: string | undefined;

				for (let attempt = currentRetry; attempt < this.maxRetries; attempt++) {
					try {
						await this.stateStore.updatePhotoState(photo.id, {
							status: 'pending',
							albumId: this.sourceAlbum,
							sourceEndpoint: 'iCloud',
							lastModifiedAt: photo.lastModified.toISOString(),
							retryCount: attempt,
						});

						this.logger.debug({ photoId: photo.id, attempt }, 'Downloading photo');
						const photoData = await photo.download();

						const checksum = crypto.createHash('sha256').update(photoData).digest('hex');

						await this.stateStore.updatePhotoState(photo.id, {
							checksum,
							sizeBytes: photoData.length,
						});

						this.logger.info(
							{ photoId: photo.id, filename: photo.filename, size: photoData.length, attempt },
							'Uploading photo to Frame',
						);

						const frameArtId = await this.frameEndpoint.upload(photo);

						const nowIso = new Date().toISOString();
						await this.stateStore.updatePhotoState(photo.id, {
							status: 'uploaded',
							uploadedAt: nowIso,
							lastSyncedAt: nowIso,
							retryCount: attempt,
							errorMessage: null,
						});

						succeeded++;
						this.logger.info(
							{ photoId: photo.id, frameArtId, filename: photo.filename, attempt },
							'Photo uploaded successfully',
						);
						success = true;
						break;
					} catch (error) {
						lastError = error instanceof Error ? error.message : String(error);
						this.logger.error(
							{ photoId: photo.id, filename: photo.filename, error: lastError, attempt },
							'Failed to sync photo (will retry if attempts remain)',
						);

						await this.stateStore.updatePhotoState(photo.id, {
							status: 'failed',
							errorMessage: lastError,
							retryCount: attempt + 1,
						});

						failed++;
						const delayMs = this.baseDelayMs * Math.pow(2, attempt);
						await new Promise((resolve) => setTimeout(resolve, delayMs));
					}
				}

				if (!success) {
					this.logger.warn(
						{ photoId: photo.id, filename: photo.filename, lastError, maxRetries: this.maxRetries },
						'Photo failed all retry attempts, skipping.',
					);
				}
			}

			await this.stateStore.updateAlbumState(this.sourceAlbum, {
				lastSyncedAt: new Date().toISOString(),
				photoCount: photos.length,
				name: this.sourceAlbum,
				id: this.sourceAlbum,
			});

			const durationMs = Date.now() - startTime;
			this.logger.info(
				{ albumId: this.sourceAlbum, processed, succeeded, failed, skipped, durationMs },
				'Photo sync completed',
			);

			return { processed, succeeded, failed, skipped, photoIds: processedPhotoIds };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error({ albumId: this.sourceAlbum, error: errorMessage }, 'Photo sync failed');
			throw error;
		}
	}

	getStateStore(): SyncStateStore {
		return this.stateStore;
	}

	async listAlbums(): Promise<AlbumSummary[]> {
		const state = await this.stateStore.read();
		return Object.values(state.albums).map((album) => ({
			id: album.id,
			name: album.name,
			photoCount: album.photoCount,
			lastSyncedAt: album.lastSyncedAt,
		}));
	}

	async listPhotos(query: PhotoListQuery): Promise<PhotoPage> {
		const photos = await this.stateStore.getPhotosForAlbum(query.albumId);
		const sorted = [...photos].sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt));
		const total = sorted.length;
		const startIndex = Math.max(0, (query.page - 1) * query.pageSize);
		const paged = sorted.slice(startIndex, startIndex + query.pageSize);

		const items: PhotoSummary[] = paged.map((photo) => ({
			id: photo.id,
			albumId: photo.albumId,
			takenAt: photo.takenAt,
			sizeBytes: photo.sizeBytes,
			format: photo.format,
			status: photo.status,
		}));

		return {
			items,
			pagination: {
				page: query.page,
				pageSize: query.pageSize,
				total,
			},
		};
	}

	/**
	 * Fetch albums directly from iCloud (not from state store).
	 * This is used by the photo gallery to browse all available albums.
	 */
	async fetchAlbumsFromiCloud(): Promise<AlbumSummary[]> {
		if (!this.ready) {
			throw new SetupRequiredError('Cannot fetch albums until iCloud is configured.');
		}

		const albums = await this.iCloudEndpoint.albums;
		return albums.map((album) => ({
			id: album.id,
			name: album.name,
			photoCount: 0, // Will be populated when photos are fetched
			lastSyncedAt: null,
		}));
	}

	/**
	 * Fetch photos from a specific iCloud album (not from state store).
	 * This is used by the photo gallery to browse all available photos.
	 */
	async fetchPhotosFromiCloud(query: PhotoListQuery): Promise<PhotoPage> {
		if (!this.ready) {
			throw new SetupRequiredError('Cannot fetch photos until iCloud is configured.');
		}

		const photos = await this.iCloudEndpoint.listPhotos(query.albumId);
		const sorted = [...photos].sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
		const total = sorted.length;
		const startIndex = Math.max(0, (query.page - 1) * query.pageSize);
		const paged = sorted.slice(startIndex, startIndex + query.pageSize);

		const items: PhotoSummary[] = paged.map((photo) => ({
			id: photo.id,
			albumId: query.albumId,
			takenAt: photo.lastModified.toISOString(),
			sizeBytes: photo.size,
			format: path.extname(photo.filename).slice(1).toLowerCase() || 'unknown',
			status: 'pending' as const,
		}));

		return {
			items,
			pagination: {
				page: query.page,
				pageSize: query.pageSize,
				total,
			},
		};
	}

	async queueManualSync(request: ManualSyncRequest): Promise<SyncAccepted> {
		if (!this.ready) {
			throw new SetupRequiredError(
				this.initializationError?.message ?? 'Cannot trigger manual sync until setup completes.',
			);
		}

		const operationId = crypto.randomUUID();
		const startedAt = new Date().toISOString();
		const frameId = request.frameHost ?? this.currentSettings.frameHost ?? this.initialFrameHost;

		await this.stateStore.update((state) => {
			state.operations[operationId] = {
				id: operationId,
				startedAt,
				completedAt: null,
				status: 'running',
				photoIds: [],
				error: null,
				attempt: 1,
				frameId,
			};
			return state;
		});

		try {
			const summary = await this.syncPhotos();
			const completedAt = new Date().toISOString();

			await this.stateStore.update((state) => {
				const operation = state.operations[operationId];
				if (operation) {
					operation.completedAt = completedAt;
					operation.status = summary.failed > 0 ? 'failed' : 'succeeded';
					operation.photoIds = summary.photoIds;
					operation.error =
						summary.failed > 0 ? 'One or more photos failed to sync' : null;
				}
				return state;
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error({ error: message, operationId }, 'Manual sync failed');
			await this.stateStore.update((state) => {
				const operation = state.operations[operationId];
				if (operation) {
					operation.completedAt = new Date().toISOString();
					operation.status = 'failed';
					operation.error = message;
				}
				return state;
			});
		}

		return { operationId };
	}

	async updateConfiguration(
		settings: SettingsUpdateRequest,
	): Promise<SettingsConfigSnapshot> {
		this.sourceAlbum = settings.syncAlbumName;
		this.config.iCloud.sourceAlbum = settings.syncAlbumName;

		if (settings.frameHost && settings.frameHost.trim().length > 0) {
			this.config.frame.host = settings.frameHost.trim();
		}

		if (typeof settings.iCloudUsername === 'string') {
			this.config.iCloud.username = settings.iCloudUsername.trim();
		}

		if (typeof settings.iCloudPassword === 'string' && settings.iCloudPassword.trim().length > 0) {
			this.config.iCloud.password = settings.iCloudPassword;
		}

		this.currentSettings = {
			...this.currentSettings,
			syncAlbumName: this.sourceAlbum,
			frameHost: this.config.frame.host,
			syncIntervalSeconds: typeof settings.syncIntervalSeconds === 'number'
				? settings.syncIntervalSeconds
				: this.currentSettings?.syncIntervalSeconds,
			logLevel: settings.logLevel ?? this.currentSettings?.logLevel,
			corsOrigin: settings.corsOrigin ?? this.currentSettings?.corsOrigin,
			iCloudUsername: this.config.iCloud.username,
			hasICloudPassword: Boolean(this.config.iCloud.password),
			webPort: this.webPort,
		};

		await this.stateStore.updateAlbumState(this.sourceAlbum, {
			id: this.sourceAlbum,
			name: this.sourceAlbum,
		});

		this.refreshCurrentSettings();
		await this.initialize();
		return this.currentSettings;
	}
}
