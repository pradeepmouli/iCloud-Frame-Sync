import type {
	AlbumSummary,
	AppStatus,
	AuthenticateICloudResponse,
	ConfigurationResponse,
	ConfigurationUpdate,
	ConnectionTestRequestPayload,
	ConnectionTestResponsePayload,
	ConnectionTestResult,
	ConnectionTestResultPayload,
	FrameArt,
	FrameArtListQuery,
	FrameArtPage,
	FrameArtUploadRequest,
	FrameArtUploadResult,
	FramePowerAction,
	FramePowerStateResponse,
	FrameStatusSnapshot,
	ManualSyncRequest,
	PhotoListQuery,
	PhotoPage,
	PhotoSummary,
	SettingsConfigSnapshot,
	SettingsUpdateRequest,
	StatusResponse,
	SyncAccepted,
	SyncControlResponse,
	SyncOperation,
	SyncScheduleState,
	SyncStateResponse,
	SyncStatus,
	TestFrameRequest,
	TestICloudRequest,
} from '../types/index';

const API_BASE = '/api';


type JsonRecord = Record<string, unknown>;

interface RequestOptions extends RequestInit {
	parseJson?: boolean;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
	const text = await response.text();
	if (!text) {
		return {} as T;
	}

	try {
		return JSON.parse(text) as T;
	} catch (error) {
		throw new Error('Failed to parse response JSON');
	}
}

class ApiService {
	private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
		const { parseJson = true, headers, body, method = 'GET', ...rest } = options;

		const redact = (value: unknown): unknown => {
			if (!value || typeof value !== 'object') return value;
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
				const key = k.toLowerCase();
				if (key === 'password' || key === 'icloudpassword' || key === 'code' || key === 'mfacode') {
					out[k] = '[REDACTED]';
				} else if (key === 'data' && typeof v === 'string') {
					out[k] = `[base64 ${Math.min(v.length, 16)} chars…]`;
				} else if (typeof v === 'object' && v !== null) {
					out[k] = redact(v);
				} else {
					out[k] = v;
				}
			}
			return out;
		};

		try {
			const safe = typeof body === 'string' ? JSON.parse(body) : body;
			// eslint-disable-next-line no-console
			console.debug('[api] request', { method, endpoint, body: redact(safe as unknown) });
		} catch {
			// ignore
		}

		const response = await fetch(`${API_BASE}${endpoint}`, {
			method,
			body,
			headers: {
				'Content-Type': 'application/json',
				...headers,
			},
			...rest,
		});

		if (!response.ok) {
			const errorPayload: { error?: string; } = parseJson
				? await parseJsonResponse<{ error?: string; }>(response).catch(() => ({}))
				: {};
			const errorMessage = errorPayload.error ?? `Request to ${endpoint} failed with status ${response.status}`;
			// eslint-disable-next-line no-console
			console.debug('[api] response', { endpoint, status: response.status, error: errorPayload.error });
			throw new Error(errorMessage);
		}

		if (!parseJson || response.status === 204) {
			// eslint-disable-next-line no-console
			console.debug('[api] response', { endpoint, status: response.status, body: null });
			return {} as T;
		}

		const parsed = await parseJsonResponse<T>(response);
		// eslint-disable-next-line no-console
		console.debug('[api] response', { endpoint, status: response.status, body: redact(parsed as unknown) });
		return parsed;
	}

	private buildQuery(params: Record<string, string | number | undefined>): string {
		const search = new URLSearchParams();
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null && value !== '') {
				search.append(key, String(value));
			}
		});
		const query = search.toString();
		return query ? `?${query}` : '';
	}

	async authenticateICloud(payload: { username: string; password: string; }): Promise<AuthenticateICloudResponse> {
		return this.request<AuthenticateICloudResponse>('/auth/icloud', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
	}

	async submitMfaCode(payload: { sessionId: string; code: string; }): Promise<AuthenticateICloudResponse> {
		return this.request<AuthenticateICloudResponse>('/auth/mfa', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
	}

	// --- REST dashboard endpoints ---

	async getStatus(): Promise<StatusResponse> {
		const response = await this.request<unknown>('/status');
		return normalizeStatusResponse(response);
	}

	async queueManualSync(request: ManualSyncRequest = {}): Promise<SyncAccepted> {
		const response = await this.request<unknown>('/sync', {
			method: 'POST',
			body: JSON.stringify(request),
		});
		return normalizeSyncAccepted(response);
	}

	async listAlbums(refresh?: boolean): Promise<AlbumSummary[]> {
		const queryString = refresh ? this.buildQuery({ refresh: 'true' }) : '';
		const response = await this.request<unknown>(`/albums${queryString}`);
		return normalizeAlbumCollection(response);
	}

	async listPhotos(query: PhotoListQuery & { refresh?: boolean }): Promise<PhotoPage> {
		const queryString = this.buildQuery({
			albumId: query.albumId,
			page: query.page,
			pageSize: query.pageSize,
			...(query.refresh ? { refresh: 'true' } : {}),
		});
		const response = await this.request<unknown>(`/photos${queryString}`);
		return normalizePhotoPage(response);
	}

	async updateSettings(payload: SettingsUpdateRequest): Promise<SettingsConfigSnapshot> {
		const response = await this.request<unknown>('/settings', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
		return normalizeSettingsResponse(response);
	}

	// --- Frame management endpoints ---

	async getFrameStatus(): Promise<FrameStatusSnapshot> {
		const response = await this.request<unknown>('/frame/status');
		return normalizeFrameStatus(response);
	}

	async setFramePower(action: FramePowerAction): Promise<FramePowerStateResponse> {
		const response = await this.request<unknown>('/frame/power', {
			method: 'POST',
			body: JSON.stringify({ action }),
		});
		return normalizeFramePowerState(response);
	}

	async listFrameArt(query: FrameArtListQuery = {}): Promise<FrameArtPage> {
		const queryString = this.buildQuery({
			page: query.page,
			pageSize: query.pageSize,
			categoryId: query.categoryId ?? undefined,
		});
		const response = await this.request<unknown>(`/frame/art${queryString}`);
		return normalizeFrameArtPage(response);
	}

	async uploadFrameArt(payload: FrameArtUploadRequest): Promise<FrameArtUploadResult> {
		const response = await this.request<unknown>('/frame/art', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
		return normalizeFrameArtUploadResult(response);
	}

	async deleteFrameArt(artId: string): Promise<void> {
		await this.request<unknown>(`/frame/art/${encodeURIComponent(artId)}`, {
			method: 'DELETE',
			parseJson: false,
		});
	}

	async getFrameArtThumbnail(artId: string): Promise<Blob> {
		const response = await fetch(`${API_BASE}/frame/art/${encodeURIComponent(artId)}/thumbnail`, {
			method: 'GET',
		});
		if (!response.ok) {
			throw new Error(`Failed to fetch thumbnail for art ${artId}`);
		}
		return response.blob();
	}

	async testConnections(payload: ConnectionTestRequestPayload): Promise<ConnectionTestResponsePayload> {
		const response = await this.request<unknown>('/connections/test', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
		return normalizeConnectionTestResponse(response);
	}

	// --- Legacy compatibility helpers (to be removed once UI is updated) ---

	async getAppStatus(): Promise<AppStatus> {
		const status = await this.getStatus();
		const isRunning = status.schedule ? !status.schedule.isPaused : false;
		const inProgress = status.sync ? status.sync.status === 'running' && status.sync.completedAt === null : false;

		return {
			isRunning,
			syncStatus: status.sync ? status.sync.status === 'running' : false,
			syncInProgress: inProgress,
			syncInterval: status.schedule?.intervalSeconds ?? 0,
		};
	}

	async getSyncStatus(): Promise<SyncStatus> {
		const status = await this.getStatus();
		const isRunning = status.schedule ? !status.schedule.isPaused : false;
		const inProgress = status.sync ? status.sync.status === 'running' && status.sync.completedAt === null : false;

		return {
			isRunning,
			inProgress,
			intervalSeconds: status.schedule?.intervalSeconds ?? 0,
		};
	}

	async runSyncOnce(): Promise<{ success: boolean; message: string; }> {
		const accepted = await this.queueManualSync();
		return {
			success: true,
			message: `Manual sync accepted (operation ${accepted.operationId})`,
		};
	}

	async startSync(): Promise<never> {
		throw new Error('startSync is no longer supported. Use queueManualSync or update settings instead.');
	}

	async stopSync(): Promise<never> {
		throw new Error('stopSync is no longer supported via API.');
	}

	async startApp(): Promise<never> {
		throw new Error('startApp is no longer supported via REST API.');
	}

	async stopApp(): Promise<never> {
		throw new Error('stopApp is no longer supported via REST API.');
	}

	async getConfig(): Promise<SettingsConfigSnapshot> {
		const status = await this.getStatus();
		if (status.config) {
			return status.config;
		}
		throw new Error('Configuration snapshot is not available yet.');
	}

	// ========== Configuration API (Database-backed) ==========

	/**
	 * Get current configuration
	 */
	async getConfiguration(): Promise<ConfigurationResponse> {
		return this.request<ConfigurationResponse>('/configuration', {
			method: 'GET',
		});
	}

	/**
	 * Update configuration (partial update)
	 */
	async updateConfiguration(updates: ConfigurationUpdate): Promise<ConfigurationResponse> {
		return this.request<ConfigurationResponse>('/configuration', {
			method: 'POST',
			body: JSON.stringify(updates),
		});
	}

	/**
	 * Test iCloud connection without saving
	 */
	async testICloudConnection(request: TestICloudRequest): Promise<ConnectionTestResult> {
		return this.request<ConnectionTestResult>('/configuration/test-icloud', {
			method: 'POST',
			body: JSON.stringify(request),
		});
	}

	/**
	 * Test Frame TV connection without saving
	 */
	async testFrameConnection(request: TestFrameRequest): Promise<ConnectionTestResult> {
		return this.request<ConnectionTestResult>('/configuration/test-frame', {
			method: 'POST',
			body: JSON.stringify(request),
		});
	}

	// ========== Sync Control API (Real-time sync state management) ==========

	/**
	 * Get current sync state
	 */
	async getSyncStatus(): Promise<SyncStateResponse> {
		return this.request<SyncStateResponse>('/sync/status', {
			method: 'GET',
		});
	}

	/**
	 * Start a sync operation
	 */
	async startSyncOperation(): Promise<SyncControlResponse> {
		return this.request<SyncControlResponse>('/sync/start', {
			method: 'POST',
		});
	}

	/**
	 * Stop a running sync operation
	 */
	async stopSyncOperation(): Promise<SyncControlResponse> {
		return this.request<SyncControlResponse>('/sync/stop', {
			method: 'POST',
		});
	}

	/**
	 * Create EventSource for real-time sync status updates via SSE
	 */
	createSyncStatusStream(): EventSource {
		return new EventSource(`${API_BASE}/sync/status/stream`);
	}
}

export const api = new ApiService();

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown, fallback = ''): string {
	return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function toNullableString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function toNumberValue(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value === null) {
		return undefined;
	}
	const parsed = toNumberValue(value, Number.NaN);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function toBooleanValue(value: unknown, fallback = false): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === 'string');
}

function normalizeSyncAccepted(payload: unknown): SyncAccepted {
	if (!isRecord(payload)) {
		throw new Error('Invalid response payload while triggering sync');
	}
	const operationId = toStringValue(payload.operationId);
	if (!operationId) {
		throw new Error('Invalid response payload while triggering sync');
	}
	return { operationId };
}

function normalizeAlbumSummary(payload: unknown): AlbumSummary | null {
	if (!isRecord(payload)) {
		return null;
	}
	const id = toStringValue(payload.id);
	const name = toStringValue(payload.name);
	if (!id || !name) {
		return null;
	}
	return {
		id,
		name,
		photoCount: Math.max(0, toNumberValue(payload.photoCount, 0)),
		lastSyncedAt:
			typeof payload.lastSyncedAt === 'string'
				? payload.lastSyncedAt
				: null,
	};
}

function normalizeAlbumCollection(payload: unknown): AlbumSummary[] {
	const record = isRecord(payload) ? payload : {};
	const albums = Array.isArray(record.albums) ? record.albums : [];
	return albums
		.map((album) => normalizeAlbumSummary(album))
		.filter((album): album is AlbumSummary => album !== null);
}

function normalizePhotoSummary(payload: unknown): PhotoSummary | null {
	if (!isRecord(payload)) {
		return null;
	}
	const id = toStringValue(payload.id);
	const albumId = toStringValue(payload.albumId);
	const takenAt = toStringValue(payload.takenAt);
	if (!id || !albumId || !takenAt) {
		return null;
	}
	const validStatuses = new Set(['pending', 'uploading', 'uploaded', 'failed']);
	const statusCandidate = toStringValue(payload.status, 'pending');
	const status = validStatuses.has(statusCandidate)
		? (statusCandidate as PhotoSummary['status'])
		: 'pending';

	return {
		id,
		albumId,
		takenAt,
		sizeBytes: Math.max(0, toNumberValue(payload.sizeBytes, 0)),
		format: toStringValue(payload.format, 'jpeg'),
		status,
	};
}

function normalizePagination(payload: unknown): { page: number; pageSize: number; total: number; } {
	if (!isRecord(payload)) {
		return { page: 1, pageSize: 0, total: 0 };
	}
	const page = Math.max(1, toNumberValue(payload.page, 1));
	const pageSize = Math.max(0, toNumberValue(payload.pageSize, 0));
	const total = Math.max(0, toNumberValue(payload.total, 0));
	return { page, pageSize, total };
}

function normalizePhotoPage(payload: unknown): PhotoPage {
	const record = isRecord(payload) ? payload : {};
	const items = Array.isArray(record.items) ? record.items : [];
	return {
		items: items
			.map((item) => normalizePhotoSummary(item))
			.filter((item): item is PhotoSummary => item !== null),
		pagination: normalizePagination(record.pagination),
	};
}

function normalizeLogLevel(value: unknown): 'info' | 'warn' | 'debug' {
	if (value === 'warn' || value === 'debug') {
		return value;
	}
	return 'info';
}

function normalizeSettingsSnapshot(payload: unknown): SettingsConfigSnapshot {
	if (!isRecord(payload)) {
		throw new Error('Invalid configuration snapshot received from API');
	}
	const snapshot: SettingsConfigSnapshot = {
		syncAlbumName: toStringValue(payload.syncAlbumName),
		frameHost: toStringValue(payload.frameHost),
		logLevel: normalizeLogLevel(payload.logLevel),
		webPort: Math.max(0, toNumberValue(payload.webPort, 0)),
		hasICloudPassword: toBooleanValue(payload.hasICloudPassword, false),
		isConfigured: toBooleanValue(payload.isConfigured, false),
		missingFields: toStringArray(payload.missingFields),
	};
	const interval = toOptionalNumber(payload.syncIntervalSeconds);
	if (interval !== undefined) {
		snapshot.syncIntervalSeconds = interval;
	}
	if (typeof payload.corsOrigin === 'string') {
		snapshot.corsOrigin = payload.corsOrigin;
	}
	if (typeof payload.iCloudUsername === 'string') {
		snapshot.iCloudUsername = payload.iCloudUsername;
	}
	if (payload.lastError === null || typeof payload.lastError === 'string') {
		snapshot.lastError = payload.lastError;
	}
	return snapshot;
}

function normalizeConnectionTestResult(payload: unknown): ConnectionTestResultPayload {
	const record = isRecord(payload) ? payload : {};
	const success = typeof record.success === 'boolean' ? record.success : false;
	const normalized: ConnectionTestResultPayload = { success };

	if (typeof record.status === 'string') {
		normalized.status = record.status;
	}
	if (typeof record.requiresMfa === 'boolean') {
		normalized.requiresMfa = record.requiresMfa;
	}
	if (typeof record.sessionId === 'string' && record.sessionId.trim().length > 0) {
		normalized.sessionId = record.sessionId;
	}
	if (typeof record.message === 'string') {
		normalized.message = record.message;
	}
	if (typeof record.error === 'string') {
		normalized.error = record.error;
	}

	for (const [key, value] of Object.entries(record)) {
		if (!(key in normalized)) {
			(normalized as Record<string, unknown>)[key] = value;
		}
	}

	return normalized;
}

function normalizeConnectionTestResponse(payload: unknown): ConnectionTestResponsePayload {
	if (!isRecord(payload)) {
		throw new Error('Invalid response payload from connection test endpoint');
	}
	const overallCandidate = typeof payload.overall === 'string' ? payload.overall : 'attention';
	const overall: ConnectionTestResponsePayload['overall'] = overallCandidate === 'ready' ? 'ready' : 'attention';
	return {
		overall,
		icloud: normalizeConnectionTestResult(payload.icloud),
		frame: normalizeConnectionTestResult(payload.frame),
	};
}

function normalizeSettingsResponse(payload: unknown): SettingsConfigSnapshot {
	if (!isRecord(payload)) {
		throw new Error('Unexpected response while updating settings');
	}
	if ('success' in payload && payload.success === false) {
		const message = typeof payload.error === 'string'
			? payload.error
			: 'Failed to update settings';
		throw new Error(message);
	}
	return normalizeSettingsSnapshot(payload.config);
}

function normalizeSyncOperation(payload: unknown): SyncOperation | null {
	if (!isRecord(payload)) {
		return null;
	}
	const id = toStringValue(payload.id);
	const startedAt = toStringValue(payload.startedAt);
	if (!id || !startedAt) {
		return null;
	}
	const statusCandidate = toStringValue(payload.status, 'running');
	const validStatuses: SyncOperation['status'][] = ['running', 'succeeded', 'failed'];
	const status = (validStatuses.includes(statusCandidate as SyncOperation['status'])
		? statusCandidate
		: 'running') as SyncOperation['status'];
	return {
		id,
		startedAt,
		completedAt: typeof payload.completedAt === 'string' ? payload.completedAt : null,
		status,
		photoIds: toStringArray(payload.photoIds),
		error: payload.error === null || typeof payload.error === 'string' ? payload.error ?? null : null,
		attempt: Math.max(0, toNumberValue(payload.attempt, 0)),
		frameId: toStringValue(payload.frameId),
	};
}

function normalizeSchedule(payload: unknown): SyncScheduleState | null {
	if (!isRecord(payload)) {
		return null;
	}
	return {
		nextRunAt: toStringValue(payload.nextRunAt, new Date().toISOString()),
		intervalSeconds: Math.max(0, toNumberValue(payload.intervalSeconds, 0)),
		isPaused: toBooleanValue(payload.isPaused, false),
	};
}

function normalizeStatusResponse(payload: unknown): StatusResponse {
	const record = isRecord(payload) ? payload : {};
	const sync = normalizeSyncOperation(record.sync);
	const schedule = normalizeSchedule(record.schedule);
	const config = record.config !== undefined ? normalizeSettingsSnapshot(record.config) : undefined;
	return {
		sync,
		schedule,
		...(config ? { config } : {}),
	};
}

function normalizeFrameDevice(value: unknown): FrameStatusSnapshot['device'] {
	if (!isRecord(value)) {
		return null;
	}
	const device = {
		name: typeof value.name === 'string' ? value.name : undefined,
		model: typeof value.model === 'string' ? value.model : undefined,
		serialNumber: typeof value.serialNumber === 'string' ? value.serialNumber : undefined,
		firmwareVersion: typeof value.firmwareVersion === 'string' ? value.firmwareVersion : undefined,
	};
	return Object.values(device).some((entry) => entry !== undefined) ? device : null;
}

function normalizeMatte(value: unknown): FrameArt['matte'] {
	if (!isRecord(value)) {
		return null;
	}
	const matte = {
		type: typeof value.type === 'string' ? value.type : undefined,
		color: typeof value.color === 'string' ? value.color : undefined,
	};
	return Object.values(matte).some((entry) => entry !== undefined) ? matte : null;
}

function normalizeFrameArtSummary(value: unknown): FrameArt | null {
	if (!isRecord(value)) {
		return null;
	}
	const id = toStringValue(value.id);
	const name = toStringValue(value.name);
	if (!id || !name) {
		return null;
	}
	const art: FrameArt = {
		id,
		name,
	};
	if (typeof value.categoryId === 'string') {
		art.categoryId = value.categoryId;
	}
	const width = toOptionalNumber(value.width);
	if (width !== undefined) {
		art.width = width;
	}
	const height = toOptionalNumber(value.height);
	if (height !== undefined) {
		art.height = height;
	}
	if (typeof value.isFavorite === 'boolean') {
		art.isFavorite = value.isFavorite;
	}
	const matte = normalizeMatte(value.matte);
	if (matte) {
		art.matte = matte;
	}
	if (value.addedAt === null || typeof value.addedAt === 'string') {
		art.addedAt = value.addedAt ?? null;
	}
	return art;
}

function normalizeFrameArtPage(payload: unknown): FrameArtPage {
	const record = isRecord(payload) ? payload : {};
	const items = Array.isArray(record.items) ? record.items : [];
	return {
		items: items
			.map((item) => normalizeFrameArtSummary(item))
			.filter((item): item is FrameArt => item !== null),
		pagination: normalizePagination(record.pagination),
	};
}

function normalizeFrameArtUploadResult(payload: unknown): FrameArtUploadResult {
	if (!isRecord(payload)) {
		throw new Error('Invalid response payload while uploading art');
	}
	const artId = toStringValue(payload.artId);
	if (!artId) {
		throw new Error('Invalid response payload while uploading art');
	}
	return {
		artId,
		setAsCurrent: toBooleanValue(payload.setAsCurrent, false),
	};
}

function normalizeFramePowerState(payload: unknown): FramePowerStateResponse {
	if (!isRecord(payload)) {
		throw new Error('Invalid response payload while updating frame power state');
	}
	const actionCandidate = toStringValue(payload.action, 'toggle');
	const validActions: FramePowerAction[] = ['on', 'off', 'toggle'];
	const action = validActions.includes(actionCandidate as FramePowerAction)
		? (actionCandidate as FramePowerAction)
		: 'toggle';
	return {
		isOn: toBooleanValue(payload.isOn, false),
		wasToggled: toBooleanValue(payload.wasToggled, false),
		action,
	};
}

function normalizeFrameStatus(payload: unknown): FrameStatusSnapshot {
	const record = isRecord(payload) ? payload : {};
	const currentArt = normalizeFrameArtSummary(record.currentArt);
	return {
		host: toStringValue(record.host),
		isReachable: toBooleanValue(record.isReachable, false),
		isOn: toBooleanValue(record.isOn, false),
		inArtMode: toBooleanValue(record.inArtMode, false),
		brightness:
			record.brightness === null
				? null
				: toOptionalNumber(record.brightness),
		currentArt: currentArt ?? null,
		device: normalizeFrameDevice(record.device),
		lastCheckedAt: toStringValue(record.lastCheckedAt, new Date().toISOString()),
	};
}

export type {
	AlbumSummary,
	AppStatus, AuthenticateICloudResponse, Config, FrameArt, FrameArtListQuery,
	FrameArtPage,
	FrameArtUploadRequest,
	FrameArtUploadResult,
	FramePowerAction,
	FramePowerStateResponse, FrameStatus,
	FrameStatusSnapshot, ManualSyncRequest, Photo, PhotoListQuery,
	PhotoPage, PhotoSummary, SettingsConfigSnapshot,
	SettingsUpdateRequest,
	StatusResponse,
	SyncAccepted, SyncControlResponse, SyncOperation,
	SyncScheduleState, SyncStateResponse, SyncStateStatus, SyncStatus
} from '../types/index';
