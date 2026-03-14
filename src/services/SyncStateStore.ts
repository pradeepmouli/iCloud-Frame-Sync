import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'pino';

/**
 * Photo sync state as stored in persistence layer.
 * Tracks upload status, retry count, and timestamps.
 */
export interface PhotoState {
	id: string;
	albumId: string;
	takenAt: string; // ISO timestamp
	uploadedAt: string | null; // ISO timestamp
	sizeBytes: number;
	format: 'jpeg' | 'heic' | 'png';
	status: 'pending' | 'uploading' | 'uploaded' | 'failed';
	retryCount: number;

	// Incremental sync tracking (T008)
	checksum: string | null; // SHA-256 hash for deduplication and change detection
	lastModifiedAt: string; // ISO timestamp from source (iCloud)
	sourceEndpoint: string; // Endpoint ID where photo originated
	lastSyncedAt: string | null; // ISO timestamp of last successful sync
	errorMessage: string | null; // Last error message if status is 'failed'
}

/**
 * Album sync metadata.
 * Tracks last sync time and photo count.
 */
export interface AlbumState {
	id: string;
	name: string;
	lastSyncedAt: string | null; // ISO timestamp
	photoCount: number;
}

/**
 * Frame device connection state.
 */
export interface FrameDeviceState {
	id: string;
	host: string;
	connectedAt: string | null; // ISO timestamp
	status: 'connected' | 'disconnected' | 'authPending';
	firmwareVersion: string | null;
}

/**
 * Sync operation record.
 * Tracks individual sync cycles and their outcomes.
 */
export interface SyncOperationState {
	id: string; // UUID
	startedAt: string; // ISO timestamp
	completedAt: string | null; // ISO timestamp
	status: 'running' | 'succeeded' | 'failed';
	photoIds: string[];
	error: string | null;
	attempt: number;
	frameId: string;
}

/**
 * Sync schedule state.
 * Controls timing and pause/resume of automatic syncs.
 */
export interface SyncScheduleState {
	nextRunAt: string; // ISO timestamp
	intervalSeconds: number;
	isPaused: boolean;
}

/**
 * Root state schema stored in ~/.icloud-frame-sync/state.json
 */
export interface SyncState {
	photos: Record<string, PhotoState>;
	albums: Record<string, AlbumState>;
	frames: Record<string, FrameDeviceState>;
	operations: Record<string, SyncOperationState>;
	schedule: SyncScheduleState | null;
	version: string; // Schema version for migrations
}

/**
 * Default empty state structure.
 */
const DEFAULT_STATE: SyncState = {
	photos: {},
	albums: {},
	frames: {},
	operations: {},
	schedule: null,
	version: '1.0.0',
};

/**
 * SyncStateStore provides atomic read/write access to sync state persisted
 * as JSON under ~/.icloud-frame-sync/state.json.
 *
 * Uses atomic write pattern (write to temp file + rename) to prevent corruption
 * on crashes or concurrent writes.
 *
 * @example
 * ```typescript
 * const store = new SyncStateStore(logger);
 * await store.initialize();
 *
 * const state = await store.read();
 * state.photos['photo-123'] = { id: 'photo-123', status: 'uploaded', ... };
 * await store.write(state);
 * ```
 */
export class SyncStateStore {
	private readonly stateDir: string;
	private readonly statePath: string;
	private readonly logger: Logger;

	/**
	 * Creates a new SyncStateStore instance.
	 *
	 * @param logger - Pino logger instance for diagnostics
	 * @param stateDir - Optional custom state directory (defaults to ~/.icloud-frame-sync)
	 */
	constructor(logger: Logger, stateDir?: string) {
		this.logger = logger;
		this.stateDir = stateDir ?? join(homedir(), '.icloud-frame-sync');
		this.statePath = join(this.stateDir, 'state.json');
	}

	/**
	 * Initializes the state directory and creates default state file if missing.
	 * Should be called once at application startup.
	 *
	 * @throws {Error} If directory creation or file initialization fails
	 */
	async initialize(): Promise<void> {
		try {
			// Ensure state directory exists
			await mkdir(this.stateDir, { recursive: true });
			this.logger.debug({ stateDir: this.stateDir }, 'State directory ensured');

			// Create default state file if it doesn't exist
			try {
				await readFile(this.statePath, 'utf8');
				this.logger.info(
					{ statePath: this.statePath },
					'Existing state file found',
				);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
					await this.write(DEFAULT_STATE);
					this.logger.info(
						{ statePath: this.statePath },
						'Created default state file',
					);
				} else {
					throw error;
				}
			}
		} catch (error) {
			this.logger.error(
				{ error, stateDir: this.stateDir },
				'Failed to initialize state store',
			);
			throw new Error(
				`Failed to initialize SyncStateStore: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Reads the current sync state from disk.
	 *
	 * @returns The complete sync state object
	 * @throws {Error} If file read or JSON parse fails
	 */
	async read(): Promise<SyncState> {
		try {
			const content = await readFile(this.statePath, 'utf8');
			const state = JSON.parse(content) as SyncState;
			this.logger.debug('State read successfully');
			return state;
		} catch (error) {
			this.logger.error(
				{ error, statePath: this.statePath },
				'Failed to read state',
			);
			throw new Error(
				`Failed to read sync state: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Writes sync state to disk atomically.
	 * Uses write-to-temp + rename pattern to prevent corruption.
	 *
	 * @param state - The complete state object to persist
	 * @throws {Error} If write or rename operation fails
	 */
	async write(state: SyncState): Promise<void> {
		const tempPath = `${this.statePath}.tmp`;

		try {
			// Write to temporary file
			const content = JSON.stringify(state, null, 2);
			await writeFile(tempPath, content, 'utf8');

			// Atomic rename (replaces existing file)
			await rename(tempPath, this.statePath);

			this.logger.debug('State written successfully');
		} catch (error) {
			this.logger.error(
				{ error, statePath: this.statePath },
				'Failed to write state',
			);
			throw new Error(
				`Failed to write sync state: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Updates state using a transactional pattern: read → modify → write.
	 * Reduces boilerplate for common update operations.
	 *
	 * @param updater - Function that receives current state and returns modified state
	 * @throws {Error} If read or write fails
	 *
	 * @example
	 * ```typescript
	 * await store.update((state) => {
	 *   state.photos['photo-123'].status = 'uploaded';
	 *   return state;
	 * });
	 * ```
	 */
	async update(updater: (_state: SyncState) => SyncState): Promise<void> {
		const currentState = await this.read();
		const updatedState = updater(currentState);
		await this.write(updatedState);
	}

	/**
	 * Clears all sync state, resetting to default empty structure.
	 * Useful for testing or manual reset operations.
	 *
	 * @throws {Error} If write fails
	 */
	async clear(): Promise<void> {
		this.logger.info('Clearing all sync state');
		await this.write(DEFAULT_STATE);
	}

	/**
	 * Returns the path to the state file for debugging/monitoring.
	 */
	getStatePath(): string {
		return this.statePath;
	}

	// ========================================
	// Photo State Helper Methods (T008)
	// ========================================

	/**
	 * Gets the state of a specific photo by ID.
	 *
	 * @param photoId - The photo ID to look up
	 * @returns The photo state if found, null otherwise
	 */
	async getPhotoState(photoId: string): Promise<PhotoState | null> {
		const state = await this.read();
		return state.photos[photoId] ?? null;
	}

	/**
	 * Updates or creates a photo state entry.
	 *
	 * @param photoId - The photo ID to update
	 * @param updates - Partial photo state to merge with existing state
	 */
	async updatePhotoState(
		photoId: string,
		updates: Partial<PhotoState>,
	): Promise<void> {
		await this.update((state) => {
			const existing = state.photos[photoId];
			state.photos[photoId] = {
				...(existing ?? {
					id: photoId,
					albumId: updates.albumId ?? '',
					takenAt: updates.takenAt ?? new Date().toISOString(),
					uploadedAt: null,
					sizeBytes: updates.sizeBytes ?? 0,
					format: updates.format ?? 'jpeg',
					status: 'pending',
					retryCount: 0,
					checksum: null,
					lastModifiedAt: updates.lastModifiedAt ?? new Date().toISOString(),
					sourceEndpoint: updates.sourceEndpoint ?? '',
					lastSyncedAt: null,
					errorMessage: null,
				}),
				...updates,
			};
			return state;
		});
	}

	/**
	 * Gets all photos for a specific album.
	 *
	 * @param albumId - The album ID to filter by
	 * @returns Array of photo states in the album
	 */
	async getPhotosForAlbum(albumId: string): Promise<PhotoState[]> {
		const state = await this.read();
		return Object.values(state.photos).filter((p) => p.albumId === albumId);
	}

	/**
	 * Gets all photos with a specific status.
	 *
	 * @param status - The status to filter by
	 * @returns Array of photo states with matching status
	 */
	async getPhotosByStatus(status: PhotoState['status']): Promise<PhotoState[]> {
		const state = await this.read();
		return Object.values(state.photos).filter((p) => p.status === status);
	}

	/**
	 * Gets photos that need syncing (pending or failed with retry count below max).
	 *
	 * @param maxRetries - Maximum retry count to consider (default: 3)
	 * @returns Array of photo states that need syncing
	 */
	async getPhotosNeedingSync(maxRetries = 3): Promise<PhotoState[]> {
		const state = await this.read();
		return Object.values(state.photos).filter(
			(p) =>
				p.status === 'pending' ||
				(p.status === 'failed' && p.retryCount < maxRetries),
		);
	}

	/**
	 * Updates album state with last sync timestamp.
	 *
	 * @param albumId - The album ID to update
	 * @param updates - Partial album state to merge
	 */
	async updateAlbumState(
		albumId: string,
		updates: Partial<AlbumState>,
	): Promise<void> {
		await this.update((state) => {
			const existing = state.albums[albumId];
			state.albums[albumId] = {
				...(existing ?? {
					id: albumId,
					name: updates.name ?? '',
					lastSyncedAt: null,
					photoCount: 0,
				}),
				...updates,
			};
			return state;
		});
	}

	/**
	 * Gets the last sync timestamp for an album.
	 * Used for incremental sync to fetch only new/modified photos.
	 *
	 * @param albumId - The album ID to check
	 * @returns ISO timestamp of last sync, or null if never synced
	 */
	async getAlbumLastSyncTimestamp(albumId: string): Promise<string | null> {
		const state = await this.read();
		return state.albums[albumId]?.lastSyncedAt ?? null;
	}
}
