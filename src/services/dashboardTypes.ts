import type {
	SyncOperationState,
	SyncScheduleState,
} from './SyncStateStore.js';

export type PhotoStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface ManualSyncRequest {
	albumName?: string;
	frameHost?: string;
}

export interface SyncAccepted {
	operationId: string;
}

export interface AlbumSummary {
	id: string;
	name: string;
	photoCount: number;
	lastSyncedAt: string | null;
}

export interface PhotoSummary {
	id: string;
	albumId: string;
	takenAt: string;
	sizeBytes: number;
	format: string;
	status: PhotoStatus;
}

export interface PhotoListQuery {
	albumId: string;
	page: number;
	pageSize: number;
}

export interface PhotoPage {
	items: PhotoSummary[];
	pagination: {
		page: number;
		pageSize: number;
		total: number;
	};
}

export interface SettingsUpdateRequest {
	syncAlbumName: string;
	frameHost: string;
	syncIntervalSeconds?: number;
	logLevel?: 'info' | 'warn' | 'debug';
	corsOrigin?: string;
	iCloudUsername?: string;
	iCloudPassword?: string;
}

export interface SettingsConfigSnapshot {
	syncAlbumName: string;
	frameHost: string;
	syncIntervalSeconds?: number;
	logLevel?: 'info' | 'warn' | 'debug';
	corsOrigin?: string;
	webPort: number;
	iCloudUsername?: string;
	hasICloudPassword: boolean;
	isConfigured: boolean;
	missingFields: string[];
	lastError?: string | null;
}

export interface StatusResponse {
	sync: SyncOperationState | null;
	schedule: SyncScheduleState | null;
	config?: SettingsConfigSnapshot;
}

export type FramePowerAction = 'on' | 'off' | 'toggle';

export interface FrameStatusSnapshot {
	host: string;
	isReachable: boolean;
	isOn: boolean;
	inArtMode: boolean;
	brightness?: number | null;
	currentArt?: FrameArtSummary | null;
	device?: {
		name?: string;
		model?: string;
		serialNumber?: string;
		firmwareVersion?: string;
	} | null;
	lastCheckedAt: string;
}

export interface FrameArtSummary {
	id: string;
	name: string;
	categoryId?: string;
	width?: number;
	height?: number;
	isFavorite?: boolean;
	matte?: {
		type?: string;
		color?: string;
	} | null;
	addedAt?: string | null;
	thumbnail?: string | null;
}

export interface FrameArtListQuery {
	page?: number;
	pageSize?: number;
	categoryId?: string | null;
}

export interface FrameArtPage {
	items: FrameArtSummary[];
	pagination: {
		page: number;
		pageSize: number;
		total: number;
	};
}

export interface FrameArtUploadRequest {
	filename?: string;
	data: string;
	contentType?: string;
	setAsCurrent?: boolean;
}

export interface FrameArtUploadResult {
	artId: string;
	setAsCurrent: boolean;
}

export interface FramePowerStateResponse {
	isOn: boolean;
	wasToggled: boolean;
	action: FramePowerAction;
}

export interface DashboardSyncService {
	queueManualSync(_request: ManualSyncRequest): Promise<SyncAccepted>;
	listAlbums(): Promise<AlbumSummary[]>;
	listPhotos(_query: PhotoListQuery): Promise<PhotoPage>;
	fetchAlbumsFromiCloud(): Promise<AlbumSummary[]>;
	fetchPhotosFromiCloud(_query: PhotoListQuery): Promise<PhotoPage>;
	updateConfiguration(
		_settings: SettingsUpdateRequest,
	): Promise<SettingsConfigSnapshot>;
	getCurrentSettings(): SettingsConfigSnapshot;
	isReady(): boolean;
	getLastError(): string | null;
}

export interface FrameDashboardService {
	getStatusSnapshot(): Promise<FrameStatusSnapshot>;
	setPowerState(_action: FramePowerAction): Promise<FramePowerStateResponse>;
	listArt(_query: FrameArtListQuery): Promise<FrameArtPage>;
	deleteArt(_artId: string): Promise<boolean>;
	uploadArt(_request: FrameArtUploadRequest): Promise<FrameArtUploadResult>;
	getThumbnail(_artId: string): Promise<Buffer>;
}

export type SchedulerSnapshot = SyncScheduleState;
