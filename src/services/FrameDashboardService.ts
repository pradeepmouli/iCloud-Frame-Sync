import { Buffer } from 'node:buffer';
import type { Logger } from 'pino';
import type { ArtContentItem } from 'samsung-frame-connect';

import type {
	FrameArtListQuery,
	FrameArtPage,
	FrameArtSummary,
	FrameArtUploadRequest,
	FrameArtUploadResult,
	FramePowerAction,
	FramePowerStateResponse,
	FrameStatusSnapshot,
} from './dashboardTypes.js';
import { FrameEndpoint } from './FrameEndpoint.js';
import { SyncStateStore } from './SyncStateStore.js';

export interface FrameDashboardServiceOptions {
	frameId?: string;
}

export class FrameDashboardService {
	private readonly frameEndpoint: FrameEndpoint;
	private readonly stateStore: SyncStateStore;
	private readonly logger: Logger;
	private readonly frameId: string;

	constructor (
		frameEndpoint: FrameEndpoint,
		stateStore: SyncStateStore,
		logger: Logger,
		options: FrameDashboardServiceOptions = {},
	) {
		this.frameEndpoint = frameEndpoint;
		this.stateStore = stateStore;
		this.logger = typeof logger.child === 'function'
			? logger.child({ component: 'FrameDashboardService' })
			: logger;
		this.frameId = options.frameId ?? `frame-${this.frameEndpoint.getHost()}`;
	}

	async getStatusSnapshot(): Promise<FrameStatusSnapshot> {
		const host = this.frameEndpoint.getHost();
		const timestamp = new Date().toISOString();

		const [
			deviceInfoResult,
			isOnResult,
			artModeResult,
			brightnessResult,
			currentArtResult,
		] = await Promise.allSettled([
			this.frameEndpoint.getDeviceInfo(),
			this.frameEndpoint.isOn(),
			this.frameEndpoint.inArtMode(),
			this.frameEndpoint.getBrightness(),
			this.frameEndpoint.getCurrentArt(),
		]);

		const snapshot: FrameStatusSnapshot = {
			host,
			isReachable: deviceInfoResult.status === 'fulfilled' || isOnResult.status === 'fulfilled',
			isOn: isOnResult.status === 'fulfilled' ? isOnResult.value : false,
			inArtMode: artModeResult.status === 'fulfilled' ? artModeResult.value : false,
			brightness: brightnessResult.status === 'fulfilled' ? brightnessResult.value : null,
			currentArt:
				currentArtResult.status === 'fulfilled' && currentArtResult.value
					? this.mapArtSummary(currentArtResult.value)
					: null,
			device:
				deviceInfoResult.status === 'fulfilled'
					? this.mapDeviceInfo(deviceInfoResult.value)
					: null,
			lastCheckedAt: timestamp,
		};

		await this.persistDeviceState(snapshot);

		return snapshot;
	}

	async setPowerState(action: FramePowerAction): Promise<FramePowerStateResponse> {
		const before = await this.frameEndpoint.isOn();
		let wasToggled = false;

		if (action === 'toggle') {
			await this.frameEndpoint.togglePower();
			wasToggled = true;
		} else if (action === 'on' && !before) {
			await this.frameEndpoint.powerOn();
			wasToggled = true;
		} else if (action === 'off' && before) {
			await this.frameEndpoint.powerOff();
			wasToggled = true;
		}

		const isOn = await this.frameEndpoint.isOn();

		return { isOn, wasToggled, action };
	}

	async listArt(query: FrameArtListQuery): Promise<FrameArtPage> {
		const page = Math.max(1, query.page ?? 1);
		const pageSize = Math.max(1, Math.min(query.pageSize ?? 24, 100));
		const rawItems = await this.frameEndpoint.getAvailableArt();
		const normalized = rawItems
			.map((item) => this.mapArtSummary(item))
			.filter((item): item is FrameArtSummary => Boolean(item));

		const filtered = query.categoryId
			? normalized.filter((item) => item.categoryId === query.categoryId)
			: normalized;

		const total = filtered.length;
		const startIndex = (page - 1) * pageSize;
		const items = filtered.slice(startIndex, startIndex + pageSize);

		return {
			items,
			pagination: { page, pageSize, total },
		};
	}

	async uploadArt(request: FrameArtUploadRequest): Promise<FrameArtUploadResult> {
		if (!request.data) {
			throw new Error('Upload payload missing base64 data');
		}

		const buffer = Buffer.from(request.data, 'base64');
		if (buffer.byteLength === 0) {
			throw new Error('Upload payload contained no data');
		}

		const artId = await this.frameEndpoint.uploadBuffer(buffer, {
			filename: request.filename,
			contentType: request.contentType,
		});

		if (request.setAsCurrent) {
			await this.frameEndpoint.setCurrentArt(artId);
		}

		return {
			artId,
			setAsCurrent: Boolean(request.setAsCurrent),
		};
	}

	async deleteArt(artId: string): Promise<boolean> {
		return this.frameEndpoint.deleteArt(artId);
	}

	async getThumbnail(artId: string): Promise<Buffer> {
		return this.frameEndpoint.getThumbnail(artId);
	}

	private async persistDeviceState(snapshot: FrameStatusSnapshot): Promise<void> {
		try {
			await this.stateStore.update((state) => {
				const existing = state.frames[this.frameId];
				state.frames[this.frameId] = {
					id: this.frameId,
					host: snapshot.host,
					connectedAt: snapshot.isReachable
						? snapshot.lastCheckedAt
						: existing?.connectedAt ?? null,
					status: snapshot.isReachable ? 'connected' : 'disconnected',
					firmwareVersion:
						snapshot.device?.firmwareVersion ?? existing?.firmwareVersion ?? null,
				};
				return state;
			});
		} catch (error) {
			this.logger.warn({ error }, 'Failed to persist frame device snapshot');
		}
	}

	private mapDeviceInfo(deviceInfo: unknown): FrameStatusSnapshot['device'] {
		if (!deviceInfo || typeof deviceInfo !== 'object') {
			return null;
		}

		const record = deviceInfo as Record<string, unknown>;
		return {
			name: this.pickString(record, ['device_name', 'deviceName', 'name']),
			model: this.pickString(record, ['model', 'modelName', 'ModelName']),
			serialNumber: this.pickString(record, ['serial', 'serialNumber', 'SerialNumber']),
			firmwareVersion: this.pickString(record, ['firmwareVersion', 'FirmwareVersion', 'version']),
		};
	}

	private mapArtSummary(item: ArtContentItem | null | undefined): FrameArtSummary | null {
		if (!item) {
			return null;
		}

		const record = item as unknown as Record<string, unknown>;
		return {
			id: String(item.id),
			name: this.pickString(record, ['title', 'name']) ?? 'Unnamed Art',
			categoryId: this.pickString(record, ['category_id', 'categoryId']) ?? undefined,
			width: typeof item.width === 'number' ? item.width : undefined,
			height: typeof item.height === 'number' ? item.height : undefined,
			isFavorite: this.pickBoolean(record, ['favorite', 'isFavorite']),
			matte: this.extractMatte(record),
			addedAt: this.pickString(record, ['date', 'dateAdded']) ?? null,
		};
	}

	private extractMatte(item: Record<string, unknown>): FrameArtSummary['matte'] {
		const matte = item['matte'] ?? item['matte_info'];
		if (!matte || typeof matte !== 'object') {
			return null;
		}
		const matteRecord = matte as Record<string, unknown>;
		return {
			type: this.pickString(matteRecord, ['type']) ?? undefined,
			color: this.pickString(matteRecord, ['color']) ?? undefined,
		};
	}

	private pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
		for (const key of keys) {
			const value = source[key];
			if (typeof value === 'string' && value.trim().length > 0) {
				return value;
			}
		}
		return undefined;
	}

	private pickBoolean(source: Record<string, unknown>, keys: string[]): boolean | undefined {
		for (const key of keys) {
			const value = source[key];
			if (typeof value === 'boolean') {
				return value;
			}
			if (typeof value === 'string') {
				const normalized = value.toLowerCase();
				if (normalized === 'true') {
					return true;
				}
				if (normalized === 'false') {
					return false;
				}
			}
			if (typeof value === 'number') {
				if (value === 1) {
					return true;
				}
				if (value === 0) {
					return false;
				}
			}
		}
		return undefined;
	}
}
