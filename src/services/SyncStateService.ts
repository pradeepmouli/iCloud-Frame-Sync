/**
 * SyncStateService - Manages sync state and broadcasts real-time updates via EventEmitter
 *
 * This service provides:
 * - Centralized sync state management
 * - Real-time event broadcasting for SSE
 * - State persistence to Prisma database
 * - Progress tracking during sync operations
 *
 * @module services/SyncStateService
 */

import { EventEmitter } from 'events';
import type { Logger } from 'pino';

import { prisma } from '../lib/prisma.js';

/**
 * Sync operation status types
 */
export type SyncStatus = 'idle' | 'running' | 'paused' | 'error' | 'completed';

/**
 * Sync state snapshot for API responses
 */
export interface SyncState {
	status: SyncStatus;
	currentPhotoId?: string;
	progressPercent: number;
	estimatedTimeLeft?: number;
	photosProcessed: number;
	photosTotal: number;
	photosFailed: number;
	photosSkipped: number;
	lastError?: string;
	lastErrorAt?: Date;
	sessionStartedAt?: Date;
	sessionEndedAt?: Date;
}

/**
 * Event payload for state changes
 */
export interface SyncStateEvent {
	type: 'status' | 'progress' | 'error' | 'complete';
	state: SyncState;
	timestamp: Date;
}

/**
 * SyncStateService manages sync state and emits events for real-time updates
 */
export class SyncStateService extends EventEmitter {
	private currentState: SyncState;
	private logger: Logger;
	private syncStateId: string | null = null;
	private idleResetTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(logger: Logger) {
		super();
		this.logger = logger.child({ name: 'SyncStateService' });

		// Initialize with idle state
		this.currentState = {
			status: 'idle',
			progressPercent: 0,
			photosProcessed: 0,
			photosTotal: 0,
			photosFailed: 0,
			photosSkipped: 0,
		};
	}

	/**
	 * Initialize service - load state from database
	 */
	async initialize(): Promise<void> {
		try {
			const syncState = await prisma.syncState.findFirst();

			if (syncState) {
				this.syncStateId = syncState.id;
				this.currentState = {
					status: syncState.status as SyncStatus,
					currentPhotoId: syncState.currentPhotoId ?? undefined,
					progressPercent: syncState.progressPercent,
					estimatedTimeLeft: syncState.estimatedTimeLeft ?? undefined,
					photosProcessed: syncState.photosProcessed,
					photosTotal: syncState.photosTotal,
					photosFailed: syncState.photosFailed,
					photosSkipped: syncState.photosSkipped,
					lastError: syncState.lastError ?? undefined,
					lastErrorAt: syncState.lastErrorAt ?? undefined,
					sessionStartedAt: syncState.sessionStartedAt ?? undefined,
					sessionEndedAt: syncState.sessionEndedAt ?? undefined,
				};

				this.logger.info({ state: this.currentState }, 'Loaded sync state from database');
			} else {
				// Create initial state
				const created = await prisma.syncState.create({
					data: {
						status: 'idle',
						progressPercent: 0,
						photosProcessed: 0,
						photosTotal: 0,
						photosFailed: 0,
						photosSkipped: 0,
					},
				});
				this.syncStateId = created.id;
				this.logger.info('Initialized default sync state');
			}
		} catch (error) {
			this.logger.error({ error }, 'Failed to initialize sync state');
			throw error;
		}
	}

	/**
	 * Get current sync state
	 */
	getState(): SyncState {
		return { ...this.currentState };
	}

	/**
	 * Update sync state and broadcast change
	 */
	async updateState(updates: Partial<SyncState>): Promise<void> {
		const previousStatus = this.currentState.status;

		// Check if any values actually changed to avoid no-op updates
		const hasChanges = Object.keys(updates).some((key) => {
			const k = key as keyof SyncState;
			return this.currentState[k] !== updates[k];
		});

		if (!hasChanges) {
			return;
		}

		this.currentState = {
			...this.currentState,
			...updates,
		};

		// Persist to database
		await this.persistState();

		// Determine event type
		let eventType: SyncStateEvent['type'] = 'status';
		if (updates.status === 'error') {
			eventType = 'error';
		} else if (updates.status === 'completed') {
			eventType = 'complete';
		} else if (updates.photosProcessed !== undefined) {
			eventType = 'progress';
		}

		// Broadcast event
		const event: SyncStateEvent = {
			type: eventType,
			state: this.getState(),
			timestamp: new Date(),
		};

		this.emit('stateChange', event);

		this.logger.debug(
			{
				previousStatus,
				newStatus: this.currentState.status,
				eventType,
			},
			'Sync state updated'
		);
	}

	/**
	 * Start a sync operation
	 */
	async startSync(totalPhotos: number = 0): Promise<void> {
		await this.updateState({
			status: 'running',
			progressPercent: 0,
			photosProcessed: 0,
			photosTotal: totalPhotos,
			photosFailed: 0,
			photosSkipped: 0,
			sessionStartedAt: new Date(),
			sessionEndedAt: undefined,
			lastError: undefined,
			currentPhotoId: undefined,
		});
	}

	/**
	 * Update sync progress
	 */
	async updateProgress(
		photosProcessed: number,
		photosFailed: number = 0,
		photosSkipped: number = 0,
		currentPhotoId?: string
	): Promise<void> {
		const progressPercent = this.currentState.photosTotal > 0
			? Math.round((photosProcessed / this.currentState.photosTotal) * 100)
			: 0;

		await this.updateState({
			photosProcessed,
			photosFailed,
			photosSkipped,
			progressPercent,
			currentPhotoId,
		});
	}

	/**
	 * Complete a sync operation
	 */
	async completeSync(success: boolean, error?: string): Promise<void> {
		await this.updateState({
			status: success ? 'completed' : 'error',
			progressPercent: success ? 100 : this.currentState.progressPercent,
			sessionEndedAt: new Date(),
			lastError: error,
			lastErrorAt: error ? new Date() : undefined,
			currentPhotoId: undefined,
		});

		// Reset to idle after a brief delay, clearing any previous pending timer
		if (this.idleResetTimer) {
			clearTimeout(this.idleResetTimer);
		}
		this.idleResetTimer = setTimeout(async () => {
			this.idleResetTimer = null;
			if (this.currentState.status === 'completed' || this.currentState.status === 'error') {
				await this.updateState({ status: 'idle' });
			}
		}, 3000);
	}

	/**
	 * Pause sync operation
	 */
	async pauseSync(): Promise<void> {
		await this.updateState({
			status: 'paused',
		});
	}

	/**
	 * Resume sync operation
	 */
	async resumeSync(): Promise<void> {
		await this.updateState({
			status: 'running',
		});
	}

	/**
	 * Stop/reset sync operation
	 */
	async stopSync(): Promise<void> {
		await this.updateState({
			status: 'idle',
			currentPhotoId: undefined,
			progressPercent: 0,
			estimatedTimeLeft: undefined,
			photosProcessed: 0,
			photosTotal: 0,
			photosFailed: 0,
			photosSkipped: 0,
			sessionStartedAt: undefined,
			sessionEndedAt: undefined,
		});
	}

	/**
	 * Report an error during sync
	 */
	async reportError(error: string): Promise<void> {
		await this.updateState({
			status: 'error',
			lastError: error,
			lastErrorAt: new Date(),
		});
	}

	/**
	 * Persist current state to database
	 */
	private async persistState(): Promise<void> {
		if (!this.syncStateId) {
			this.logger.warn('Cannot persist state - no sync state ID available');
			return;
		}

		try {
			await prisma.syncState.update({
				where: { id: this.syncStateId },
				data: {
					status: this.currentState.status,
					currentPhotoId: this.currentState.currentPhotoId,
					progressPercent: this.currentState.progressPercent,
					estimatedTimeLeft: this.currentState.estimatedTimeLeft,
					photosProcessed: this.currentState.photosProcessed,
					photosTotal: this.currentState.photosTotal,
					photosFailed: this.currentState.photosFailed,
					photosSkipped: this.currentState.photosSkipped,
					lastError: this.currentState.lastError,
					lastErrorAt: this.currentState.lastErrorAt,
					sessionStartedAt: this.currentState.sessionStartedAt,
					sessionEndedAt: this.currentState.sessionEndedAt,
				},
			});
		} catch (error) {
			this.logger.error({ error }, 'Failed to persist sync state');
			// Don't throw - allow operation to continue even if persistence fails
		}
	}

	/**
	 * Check if sync is currently running
	 */
	isRunning(): boolean {
		return this.currentState.status === 'running';
	}

	/**
	 * Check if sync is paused
	 */
	isPaused(): boolean {
		return this.currentState.status === 'paused';
	}

	/**
	 * Check if sync is idle
	 */
	isIdle(): boolean {
		return this.currentState.status === 'idle';
	}
}
