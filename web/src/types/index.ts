export interface Photo {
	id: string;
	filename: string;
	dimensions: { width: number; height: number; };
	size: number;
	dateCreated: string;
	thumbnailUrl?: string;
}

// Configuration types (new database-backed configuration)
export interface ConfigurationResponse {
	// iCloud Configuration
	icloudUsername?: string | null;
	icloudSourceAlbum?: string | null;
	hasPassword: boolean;

	// Frame Configuration
	frameHost?: string | null;
	framePort?: number;

	// Sync Configuration
	syncInterval?: number;
	syncEnabled?: boolean;
	deleteAfterSync?: boolean;
	maxRetries?: number;
}

export interface ConfigurationUpdate {
	// iCloud Configuration (all optional for partial updates)
	icloudUsername?: string | null;
	icloudPassword?: string | null;
	icloudSourceAlbum?: string | null;

	// Frame Configuration
	frameHost?: string | null;
	framePort?: number;

	// Sync Configuration
	syncInterval?: number;
	syncEnabled?: boolean;
	deleteAfterSync?: boolean;
	maxRetries?: number;
}

export interface TestICloudRequest {
	username: string;
	password: string;
	sourceAlbum?: string;
}

export interface TestFrameRequest {
	host: string;
	port?: number;
}

export interface ConnectionTestResult {
	success: boolean;
	message: string;
	details?: Record<string, unknown>;
}

export interface AppStatus {
	isRunning: boolean;
	syncStatus: boolean;
	syncInProgress: boolean;
	syncInterval: number;
}

export interface SyncStatus {
	isRunning: boolean;
	inProgress: boolean;
	intervalSeconds: number;
}

export interface FrameStatus {
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
	host: string;
}

export type FrameStatusSnapshot = FrameStatus;

export interface Config {
	iCloud: {
		username: string;
		sourceAlbum: string;
	};
	frame: {
		host: string;
	};
	syncIntervalSeconds: number;
	logLevel: string;
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

export type FrameArt = FrameArtSummary;

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

export type FramePowerAction = 'on' | 'off' | 'toggle';

export interface FramePowerStateResponse {
	isOn: boolean;
	wasToggled: boolean;
	action: FramePowerAction;
}

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
	page?: number;
	pageSize?: number;
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

export interface SyncScheduleState {
	nextRunAt: string;
	intervalSeconds: number;
	isPaused: boolean;
}

export interface SyncOperation {
	id: string;
	startedAt: string;
	completedAt: string | null;
	status: 'running' | 'succeeded' | 'failed';
	photoIds: string[];
	error: string | null;
	attempt: number;
	frameId: string;
}

export interface StatusResponse {
	sync: SyncOperation | null;
	schedule: SyncScheduleState | null;
	config?: SettingsConfigSnapshot;
}

export interface ICloudConnectionTestPayload {
	username: string;
	password?: string;
	sessionId?: string;
	mfaCode?: string;
	forceRefresh?: boolean;
}

export interface FrameConnectionTestPayload {
	host: string;
	name?: string;
	services?: string[];
	verbosity?: number;
}

export interface ConnectionTestRequestPayload {
	icloud: ICloudConnectionTestPayload;
	frame: FrameConnectionTestPayload;
}

export interface ConnectionTestResultPayload {
	success: boolean;
	status?: string;
	requiresMfa?: boolean;
	sessionId?: string;
	message?: string;
	error?: string;
	[key: string]: unknown;
}

export interface ConnectionTestResponsePayload {
	overall: 'ready' | 'attention';
	icloud: ConnectionTestResultPayload;
	frame: ConnectionTestResultPayload;
}

export interface AuthenticateICloudResponse {
	success: boolean;
	requiresMfa?: boolean;
	sessionId?: string;
	status?: string;
	userInfo?: {
		fullName: string;
		appleId: string;
	};
	error?: string;
}
