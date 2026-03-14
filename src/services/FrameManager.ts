/* eslint-disable no-unused-vars */
import { performance } from 'node:perf_hooks';
import type { Logger } from 'pino';

import { resolveErrorMessage } from '../lib/errors.js';
import {
	SamsungFrameClient,
	type SamsungFrameClientOptions,
	type SamsungFrameClientType,
	type ServicesSchema,
} from 'samsung-frame-connect';

export interface FrameConnectionProbeResult {
	success: boolean;
	responseTimeMs: number;
	isOn: boolean;
	inArtMode: boolean;
	deviceInfo?: Record<string, unknown>;
	artModeInfo?: Record<string, unknown>;
	error?: string;
}

export interface FrameHeartbeatSnapshot {
	lastCheckedAt: number;
	isReachable: boolean;
	isOn?: boolean;
	inArtMode?: boolean;
	responseTimeMs?: number;
	error?: string;
}

export interface FrameManagerOptions<T extends ServicesSchema> {
	heartbeatIntervalMs?: number;
	heartbeatTimeoutMs?: number;
	autoStartHeartbeat?: boolean;
	maxReconnectAttempts?: number;
	reconnectDelayMs?: number;
	clientFactory?: (
		_factoryConfig: SamsungFrameClientOptions<T>,
	) => SamsungFrameClientType<T>;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_DELAY_MS = 3_000;

export class FrameManager<
	T extends ServicesSchema = {
		'art-mode': true;
		device: true;
		'remote-control': true;
	},
> {
	private readonly client: SamsungFrameClientType<T>;
	private readonly logger: Logger;
	private readonly host: string;
	private readonly heartbeatIntervalMs: number;
	private readonly heartbeatTimeoutMs: number;
	private readonly autoStartHeartbeat: boolean;
	private readonly maxReconnectAttempts: number;
	private readonly reconnectDelayMs: number;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private heartbeatSnapshot: FrameHeartbeatSnapshot | null = null;
	private initialized = false;
	private consecutiveFailures = 0;
	private reconnectAttempts = 0;
	private isReconnecting = false;

	constructor(
		config: SamsungFrameClientOptions<T>,
		logger: Logger,
		options: FrameManagerOptions<T> = {},
	) {
		this.logger = logger;
		const clientFactory =
			options.clientFactory ??
			((factoryConfig: SamsungFrameClientOptions<T>) =>
				new SamsungFrameClient({
					host: factoryConfig.host,
					name: factoryConfig.name ?? 'SamsungTv',
					services: factoryConfig.services,
					verbosity: factoryConfig.verbosity ?? 0,
				}) as SamsungFrameClientType<T>);
		this.client = clientFactory(config);
		this.host = config.host;
		this.heartbeatIntervalMs = Math.max(
			1_000,
			options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
		);
		this.heartbeatTimeoutMs = Math.max(
			1_000,
			options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS,
		);
		this.autoStartHeartbeat = options.autoStartHeartbeat !== false;
		this.maxReconnectAttempts = Math.max(
			1,
			options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
		);
		this.reconnectDelayMs = Math.max(
			1_000,
			options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
		);
	}

	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		this.logger.info({ host: this.host }, 'Initializing frame manager');
		await this.ensureReachable();
		await this.client.connect();
		this.initialized = true;
		if (this.autoStartHeartbeat) {
			this.startHeartbeat();
		}
	}

	async ensureReachable(): Promise<FrameConnectionProbeResult> {
		const startedAt = performance.now();
		try {
			const [deviceInfo, isOn, inArtMode, artModeInfo] = await Promise.all([
				this.client.getDeviceInfo(),
				this.client.isOn().catch(() => false),
				this.client.inArtMode().catch(() => false),
				this.client
					.getArtModeInfo()
					.catch(() => undefined as Record<string, unknown> | undefined),
			]);
			const responseTimeMs = Math.round(performance.now() - startedAt);
			const snapshot: FrameHeartbeatSnapshot = {
				lastCheckedAt: Date.now(),
				isReachable: true,
				isOn,
				inArtMode,
				responseTimeMs,
			};
			this.heartbeatSnapshot = snapshot;
			// Reset failure counters on success
			this.consecutiveFailures = 0;
			this.reconnectAttempts = 0;
			return {
				success: true,
				responseTimeMs,
				isOn,
				inArtMode,
				deviceInfo,
				artModeInfo,
			};
		} catch (error: unknown) {
			const responseTimeMs = Math.round(performance.now() - startedAt);
			const message = this.normalizeError(error);
			this.logger.warn(
				{ error, host: this.host },
				'Frame reachability probe failed',
			);
			const snapshot: FrameHeartbeatSnapshot = {
				lastCheckedAt: Date.now(),
				isReachable: false,
				responseTimeMs,
				error: message,
			};
			this.heartbeatSnapshot = snapshot;
			// Track consecutive failures
			this.consecutiveFailures++;
			return {
				success: false,
				responseTimeMs,
				isOn: false,
				inArtMode: false,
				error: message,
			};
		}
	}

	async heartbeat(): Promise<FrameHeartbeatSnapshot> {
		const result = await this.ensureReachable();
		if (!this.heartbeatSnapshot) {
			throw new Error('Heartbeat snapshot unavailable');
		}
		// Trigger reconnection if frame is unreachable
		if (!result.success && this.consecutiveFailures > 0) {
			void this.attemptReconnection();
		}
		return this.heartbeatSnapshot;
	}

	getHeartbeatSnapshot(): FrameHeartbeatSnapshot | null {
		return this.heartbeatSnapshot;
	}

	async isOn(): Promise<boolean> {
		return await this.client.isOn();
	}

	async togglePower(): Promise<void> {
		await this.client.togglePower();
	}

	async inArtMode(): Promise<boolean> {
		return await this.client.inArtMode();
	}

	async getDeviceInfo(): Promise<Record<string, unknown>> {
		return await this.client.getDeviceInfo();
	}

	async getArtModeInfo(): Promise<Record<string, unknown>> {
		return await this.client.getArtModeInfo();
	}

	async upload(buffer: Buffer, options: { fileType: string }): Promise<string> {
		return await this.client.upload(buffer, options);
	}

	async close(): Promise<void> {
		this.stopHeartbeat();
		await this.client.close();
		this.initialized = false;
		this.heartbeatSnapshot = null;
		this.consecutiveFailures = 0;
		this.reconnectAttempts = 0;
		this.isReconnecting = false;
	}

	getClient(): SamsungFrameClientType<T> {
		return this.client;
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			void this.heartbeat().catch((error) => {
				this.logger.warn(
					{ error, host: this.host },
					'Heartbeat execution failed',
				);
				// Attempt reconnection if we have consecutive failures
				void this.attemptReconnection();
			});
		}, this.heartbeatIntervalMs);
		if (typeof this.heartbeatTimer.unref === 'function') {
			this.heartbeatTimer.unref();
		}
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private normalizeError(error: unknown): string {
		return resolveErrorMessage(error, 'Unable to reach Samsung Frame device.');
	}

	private async attemptReconnection(): Promise<void> {
		// Only attempt reconnection if:
		// 1. We have consecutive failures
		// 2. We haven't exceeded max attempts
		// 3. We're not already reconnecting
		if (
			this.consecutiveFailures === 0 ||
			this.reconnectAttempts >= this.maxReconnectAttempts ||
			this.isReconnecting
		) {
			return;
		}

		this.isReconnecting = true;
		this.reconnectAttempts++;

		this.logger.info(
			{
				host: this.host,
				attempt: this.reconnectAttempts,
				maxAttempts: this.maxReconnectAttempts,
				consecutiveFailures: this.consecutiveFailures,
			},
			'Attempting to reconnect to Frame',
		);

		try {
			// Wait before attempting reconnection
			await new Promise((resolve) =>
				setTimeout(resolve, this.reconnectDelayMs),
			);

			// Close existing connection
			await this.client.close().catch(() => {
				// Ignore close errors
			});

			// Attempt to reconnect
			await this.client.connect();

			// Verify connection with a probe
			const result = await this.ensureReachable();

			if (result.success) {
				this.logger.info(
					{
						host: this.host,
						attempt: this.reconnectAttempts,
					},
					'Successfully reconnected to Frame',
				);
				// Reset counters on successful reconnection
				this.consecutiveFailures = 0;
				this.reconnectAttempts = 0;
			} else {
				this.logger.warn(
					{
						host: this.host,
						attempt: this.reconnectAttempts,
						error: result.error,
					},
					'Reconnection attempt failed',
				);
			}
		} catch (error: unknown) {
			this.logger.warn(
				{
					error,
					host: this.host,
					attempt: this.reconnectAttempts,
				},
				'Reconnection attempt threw error',
			);
		} finally {
			this.isReconnecting = false;
		}
	}
}
