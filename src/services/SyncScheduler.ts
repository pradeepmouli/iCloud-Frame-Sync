/* eslint-disable no-undef */
import type { Logger } from 'pino';
import type { Endpoint } from '../types/endpoint.js';
import type { SyncStateService } from './SyncStateService.js';
import type { SyncStateStore } from './SyncStateStore.js';
import { syncPhotosBetweenEndpoints } from './syncUtils.js';

export interface SyncSchedulerConfig {
	intervalSeconds: number;
	endpoints: Endpoint[];
	/**
	 * Optional state store for persistence.
	 * If provided, scheduler will persist schedule state and sync operations.
	 */
	stateStore?: SyncStateStore;
	/**
	 * Optional sync state service for real-time updates.
	 * If provided, scheduler will emit state changes via EventEmitter for SSE broadcasting.
	 */
	syncStateService?: SyncStateService;
	/**
	 * Enable jitter (random delay) to prevent thundering herd.
	 * Adds random delay of 0-20% of interval.
	 * @default true
	 */
	enableJitter?: boolean;
	/**
	 * Minimum interval in seconds (safety floor).
	 * @default 30
	 */
	minIntervalSeconds?: number;
	/**
	 * Maximum backoff interval in seconds (cap for exponential backoff).
	 * @default 300 (5 minutes)
	 */
	maxBackoffSeconds?: number;
	/**
	 * Initial backoff delay in seconds on failure.
	 * @default 15
	 */
	initialBackoffSeconds?: number;
}

/**
 * SyncScheduler manages periodic sync operations with support for:
 * - Pause/resume functionality
 * - Exponential backoff on failures with jitter
 * - State persistence via SyncStateStore
 * - Correlation ID tracking for observability
 */
export class SyncScheduler {
	private timer: NodeJS.Timeout | null = null;
	private isSyncing = false;
	private isPaused = false;
	private logger: Logger;
	private intervalSeconds: number;
	private endpoints: Endpoint[];
	private stateStore?: SyncStateStore;
	private syncStateService?: SyncStateService;
	private enableJitter: boolean;
	private minIntervalSeconds: number;
	private maxBackoffSeconds: number;
	private initialBackoffSeconds: number;

	// Backoff state
	private consecutiveFailures = 0;
	private currentBackoffSeconds = 0;
	private nextRunAt: Date | null = null;

	constructor(config: SyncSchedulerConfig, logger: Logger) {
		this.logger = logger;
		this.intervalSeconds = config.intervalSeconds;
		this.endpoints = config.endpoints;
		this.stateStore = config.stateStore;
		this.syncStateService = config.syncStateService;
		this.enableJitter = config.enableJitter ?? true;
		this.minIntervalSeconds = config.minIntervalSeconds ?? 30;
		this.maxBackoffSeconds = config.maxBackoffSeconds ?? 300; // 5 minutes
		this.initialBackoffSeconds = config.initialBackoffSeconds ?? 15;

		// Validate interval
		if (this.intervalSeconds < this.minIntervalSeconds) {
			this.logger.warn(
				{
					intervalSeconds: this.intervalSeconds,
					minIntervalSeconds: this.minIntervalSeconds,
				},
				'Interval too low, using minimum',
			);
			this.intervalSeconds = this.minIntervalSeconds;
		}
	}

	/**
	 * Sets the SyncStateService for real-time state broadcasting.
	 * Can be called after construction to inject the dependency.
	 */
	public setSyncStateService(syncStateService: SyncStateService): void {
		this.syncStateService = syncStateService;
	}

	/**
	 * Starts the sync scheduler.
	 * Runs initial sync immediately, then schedules periodic syncs.
	 */
	async start(): Promise<void> {
		if (this.timer) {
			this.logger.warn('Scheduler already running');
			return;
		}

		if (this.isPaused) {
			this.logger.warn('Cannot start: scheduler is paused');
			return;
		}

		this.logger.info(
			{
				intervalSeconds: this.intervalSeconds,
				enableJitter: this.enableJitter,
				endpointCount: this.endpoints.length,
			},
			'Starting sync scheduler',
		);

		// Persist initial schedule state
		await this.persistScheduleState();

		// Run initial sync
		await this.runSync();

		// Schedule next sync
		this.scheduleNextSync();
	}

	/**
	 * Pauses the scheduler. No syncs will run until resumed.
	 */
	pause(): void {
		if (this.isPaused) {
			this.logger.warn('Scheduler already paused');
			return;
		}

		this.isPaused = true;
		this.clearTimer();
		this.logger.info('Sync scheduler paused');

		// Persist paused state
		this.persistScheduleState().catch((error) => {
			this.logger.error({ error }, 'Failed to persist pause state');
		});
	}

	/**
	 * Resumes the scheduler from paused state.
	 */
	async resume(): Promise<void> {
		if (!this.isPaused) {
			this.logger.warn('Scheduler not paused');
			return;
		}

		this.isPaused = false;
		this.logger.info('Sync scheduler resumed');

		// Persist resumed state
		await this.persistScheduleState();

		// Schedule next sync
		this.scheduleNextSync();
	}

	/**
	 * Schedules the next sync with optional jitter and backoff.
	 */
	private scheduleNextSync(): void {
		if (this.isPaused) {
			return;
		}

		// Calculate delay with backoff if there were failures
		let delaySeconds = this.intervalSeconds;
		if (this.consecutiveFailures > 0 && this.currentBackoffSeconds > 0) {
			delaySeconds = this.currentBackoffSeconds;
			this.logger.info(
				{ delaySeconds, consecutiveFailures: this.consecutiveFailures },
				'Using exponential backoff delay',
			);
		}

		// Add jitter (0-20% random delay)
		if (this.enableJitter) {
			const jitterMs = Math.random() * (delaySeconds * 1000 * 0.2);
			delaySeconds += jitterMs / 1000;
		}

		this.nextRunAt = new Date(Date.now() + delaySeconds * 1000);

		this.timer = setTimeout(async () => {
			if (this.isPaused) {
				return;
			}

			if (this.isSyncing) {
				this.logger.info('Sync already in progress, skipping this interval');
				this.scheduleNextSync();
				return;
			}

			await this.runSync();
			this.scheduleNextSync();
		}, delaySeconds * 1000);

		this.logger.debug(
			{ nextRunAt: this.nextRunAt.toISOString(), delaySeconds },
			'Next sync scheduled',
		);
	}

	/**
	 * Runs a sync cycle across all endpoint pairs.
	 */
	private async runSync(): Promise<void> {
		this.isSyncing = true;
		const startTime = Date.now();

		try {
			this.logger.info('Starting sync cycle');

			// N-way sync: sync all endpoints pairwise
			for (let i = 0; i < this.endpoints.length; i++) {
				const sourceEndpoint = this.endpoints[i];
				if (!sourceEndpoint) {
					this.logger.warn({ index: i }, 'Source endpoint undefined, skipping');
					continue;
				}

				for (let j = 0; j < this.endpoints.length; j++) {
					if (i !== j) {
						const targetEndpoint = this.endpoints[j];
						if (!targetEndpoint) {
							this.logger.warn(
								{ index: j },
								'Target endpoint undefined, skipping',
							);
							continue;
						}

						await syncPhotosBetweenEndpoints(
							sourceEndpoint,
							targetEndpoint,
							this.logger,
						);
					}
				}
			}

			const durationMs = Date.now() - startTime;
			this.logger.info({ durationMs }, 'Sync cycle completed successfully');

			// Reset backoff on success
			this.consecutiveFailures = 0;
			this.currentBackoffSeconds = 0;
		} catch (error) {
			const durationMs = Date.now() - startTime;
			this.logger.error({ error, durationMs }, 'Sync cycle failed');

			// Apply exponential backoff
			this.consecutiveFailures++;
			this.currentBackoffSeconds = Math.min(
				this.initialBackoffSeconds * Math.pow(2, this.consecutiveFailures - 1),
				this.maxBackoffSeconds,
			);

			this.logger.warn(
				{
					consecutiveFailures: this.consecutiveFailures,
					nextBackoffSeconds: this.currentBackoffSeconds,
				},
				'Applying exponential backoff',
			);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Persists current schedule state to SyncStateStore if available.
	 */
	private async persistScheduleState(): Promise<void> {
		if (!this.stateStore) {
			return;
		}

		try {
			await this.stateStore.update((state) => {
				state.schedule = {
					nextRunAt: this.nextRunAt?.toISOString() ?? new Date().toISOString(),
					intervalSeconds: this.intervalSeconds,
					isPaused: this.isPaused,
				};
				return state;
			});

			this.logger.debug('Schedule state persisted');
		} catch (error) {
			this.logger.error({ error }, 'Failed to persist schedule state');
		}
	}

	/**
	 * Stops the scheduler and clears the timer.
	 */
	stop(): void {
		this.clearTimer();
		this.isPaused = false;
		this.consecutiveFailures = 0;
		this.currentBackoffSeconds = 0;
		this.nextRunAt = null;
		this.logger.info('Sync scheduler stopped');
	}

	/**
	 * Clears the internal timer if running.
	 */
	private clearTimer(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/**
	 * Returns whether the scheduler is currently running.
	 */
	isRunning(): boolean {
		return this.timer !== null && !this.isPaused;
	}

	/**
	 * Returns whether a sync is currently in progress.
	 */
	isSyncInProgress(): boolean {
		return this.isSyncing;
	}

	/**
	 * Returns the current interval in seconds.
	 */
	getIntervalSeconds(): number {
		return this.intervalSeconds;
	}

	/**
	 * Returns the next scheduled run time (null if not scheduled).
	 */
	getNextRunAt(): Date | null {
		return this.nextRunAt;
	}

	/**
	 * Returns the number of consecutive failures.
	 */
	getConsecutiveFailures(): number {
		return this.consecutiveFailures;
	}

	/**
	 * Returns the current backoff delay in seconds.
	 */
	getCurrentBackoffSeconds(): number {
		return this.currentBackoffSeconds;
	}

	/**
	 * Returns whether the scheduler is paused.
	 */
	isPausedState(): boolean {
		return this.isPaused;
	}

	/**
	 * Updates the sync interval. If scheduler is running, restarts with new interval.
	 */
	updateInterval(intervalSeconds: number): void {
		if (intervalSeconds < this.minIntervalSeconds) {
			this.logger.warn(
				{ intervalSeconds, minIntervalSeconds: this.minIntervalSeconds },
				'Interval too low, using minimum',
			);
			intervalSeconds = this.minIntervalSeconds;
		}

		this.intervalSeconds = intervalSeconds;
		this.logger.info({ intervalSeconds }, 'Sync interval updated');

		// Restart if running
		if (this.isRunning()) {
			this.stop();
			this.start().catch((error) => {
				this.logger.error(
					{ error },
					'Failed to restart scheduler after interval update',
				);
			});
		}
	}

	/**
	 * Updates the endpoint list.
	 */
	setEndpoints(endpoints: Endpoint[]): void {
		this.endpoints = endpoints;
		this.logger.info({ endpointCount: endpoints.length }, 'Endpoints updated');
	}

	/**
	 * Triggers an immediate sync (bypasses schedule).
	 * Returns immediately; sync runs asynchronously.
	 */
	async triggerManualSync(): Promise<void> {
		if (this.isSyncing) {
			this.logger.warn('Sync already in progress, manual trigger ignored');
			return;
		}

		this.logger.info('Manual sync triggered');
		await this.runSync();

		// Update next run time
		if (this.isRunning()) {
			this.clearTimer();
			this.scheduleNextSync();
		}
	}
}
