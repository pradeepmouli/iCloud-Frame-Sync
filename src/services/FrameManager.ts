import { performance } from 'node:perf_hooks';
import type { Logger } from 'pino';
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
	clientFactory?: (config: SamsungFrameClientOptions<T>) => SamsungFrameClientType<T>;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5_000;

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
	private heartbeatTimer: NodeJS.Timeout | null = null;
	private heartbeatSnapshot: FrameHeartbeatSnapshot | null = null;
	private initialized = false;

	constructor (
		config: SamsungFrameClientOptions<T>,
		logger: Logger,
		options: FrameManagerOptions<T> = {},
	) {
		this.logger = logger;
		const clientFactory = options.clientFactory ?? ((factoryConfig: SamsungFrameClientOptions<T>) =>
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
				this.client.getArtModeInfo().catch(() => undefined as
					| Record<string, unknown>
					| undefined),
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
			this.logger.warn({ error, host: this.host }, 'Frame reachability probe failed');
			const snapshot: FrameHeartbeatSnapshot = {
				lastCheckedAt: Date.now(),
				isReachable: false,
				responseTimeMs,
				error: message,
			};
			this.heartbeatSnapshot = snapshot;
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
		await this.ensureReachable();
		if (!this.heartbeatSnapshot) {
			throw new Error('Heartbeat snapshot unavailable');
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

	async upload(buffer: Buffer, options: { fileType: string; }): Promise<string> {
		return await this.client.upload(buffer, options);
	}

	async close(): Promise<void> {
		this.stopHeartbeat();
		await this.client.close();
		this.initialized = false;
		this.heartbeatSnapshot = null;
	}

	getClient(): SamsungFrameClientType<T> {
		return this.client;
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			void this.heartbeat().catch((error) => {
				this.logger.warn({ error, host: this.host }, 'Heartbeat execution failed');
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
		if (error instanceof Error && typeof error.message === 'string') {
			return error.message;
		}
		if (typeof error === 'string' && error.trim().length > 0) {
			return error.trim();
		}
		return 'Unable to reach Samsung Frame device.';
	}
}
