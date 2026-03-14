import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import type { Logger } from 'pino';

import { MfaRequiredError, resolveErrorMessage } from './lib/errors.js';
import { validateBody } from './lib/validation.js';
import { createComponentLogger, createLogger } from './observability/logger.js';
import {
	ConfigurationUpdateSchema,
	TestFrameRequestSchema,
	TestICloudRequestSchema,
} from './schemas/configuration.schema.js';
import { configurationService } from './services/ConfigurationService.js';
import type { ConnectionTester, ConnectionTestResult, FrameConnectionTestRequest, ICloudConnectionTestRequest } from './services/connectionTypes.js';
import type {
	AlbumSummary,
	DashboardSyncService,
	FrameArtListQuery,
	FrameArtPage,
	FrameDashboardService,
	FramePowerAction,
	FramePowerStateResponse,
	FrameStatusSnapshot,
	ManualSyncRequest,
	PhotoListQuery,
	PhotoPage,
	SettingsConfigSnapshot,
	SettingsUpdateRequest,
	StatusResponse,
	SyncAccepted,
} from './services/dashboardTypes.js';
import { iCloudEndpoint } from './services/iCloudEndpoint.js';
import { SetupRequiredError } from './services/PhotoSyncService.js';
import type { SyncScheduler } from './services/SyncScheduler.js';
import { SyncStateService } from './services/SyncStateService.js';
import type {
	SyncOperationState,
	SyncScheduleState,
	SyncStateStore,
} from './services/SyncStateStore.js';
import type { iCloudConfig } from './types/endpoint.js';

export interface WebServerConfig {
	port: number;
	corsOrigin?: string;
	logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

type SchedulerView = Pick<
	SyncScheduler,
	| 'triggerManualSync'
	| 'updateInterval'
	| 'getIntervalSeconds'
	| 'getNextRunAt'
	| 'isPausedState'
	| 'isRunning'
	| 'start'
	| 'stop'
>;

export interface CreateWebServerOptions {
	config: WebServerConfig;
	stateStore: SyncStateStore;
	photoSyncService: DashboardSyncService;
	frameDashboardService: FrameDashboardService;
	syncScheduler: SchedulerView;
	syncStateService?: SyncStateService; // optional real-time sync state broadcaster
	logger?: Logger;
	createICloudEndpoint?: (config: iCloudConfig, logger: Logger) => iCloudEndpoint;
	connectionTester?: ConnectionTester | null;
}

export interface WebServerDependencies extends Omit<CreateWebServerOptions, 'config'> {}

function resolveLogger(config: WebServerConfig, logger?: Logger): Logger {
	if (logger) {
		return logger;
	}
	return createComponentLogger(
		createLogger({ level: config.logLevel ?? 'info' }),
		'WebServer',
	);
}

function resolveLatestOperation(
	operations: Record<string, SyncOperationState> | undefined,
): SyncOperationState | null {
	if (!operations) {
		return null;
	}
	const values = Object.values(operations);
	if (values.length === 0) {
		return null;
	}
	return values.reduce((latest, candidate) => {
		const latestTimestamp = Date.parse(
			latest.completedAt ?? latest.startedAt,
		);
		const candidateTimestamp = Date.parse(
			candidate.completedAt ?? candidate.startedAt,
		);
		return candidateTimestamp > latestTimestamp ? candidate : latest;
	});
}

function buildScheduleFallback(
	scheduler: SchedulerView,
): SyncScheduleState {
	const nextRun = scheduler.getNextRunAt();
	return {
		nextRunAt: nextRun ? nextRun.toISOString() : new Date().toISOString(),
		intervalSeconds: scheduler.getIntervalSeconds(),
		isPaused: scheduler.isPausedState(),
	};
}

function parsePositiveInteger(
	value: unknown,
	fallback: number,
): number {
	const numericValue = Number.parseInt(String(value), 10);
	if (Number.isNaN(numericValue) || numericValue < 1) {
		return fallback;
	}
	return numericValue;
}

function extractManualSyncRequest(body: unknown): ManualSyncRequest {
	if (typeof body !== 'object' || body === null) {
		return {};
	}
	const payload = body as Record<string, unknown>;
	const request: ManualSyncRequest = {};
	if (typeof payload.albumName === 'string') {
		request.albumName = payload.albumName;
	}
	if (typeof payload.frameHost === 'string') {
		request.frameHost = payload.frameHost;
	}
	return request;
}

function extractSettingsUpdate(
	body: unknown,
	logger: Logger,
): SettingsUpdateRequest | null {
	if (typeof body !== 'object' || body === null) {
		return null;
	}
	const payload = body as Record<string, unknown>;
	const syncAlbumName =
		typeof payload.syncAlbumName === 'string'
			? payload.syncAlbumName.trim()
			: '';
	const frameHost =
		typeof payload.frameHost === 'string'
			? payload.frameHost.trim()
			: '';

	if (syncAlbumName.length === 0 || frameHost.length === 0) {
		logger.warn(
			{ payload },
			'Received invalid settings update payload (missing required fields)',
		);
		return null;
	}

	const update: SettingsUpdateRequest = {
		syncAlbumName,
		frameHost,
	};

	if (typeof payload.syncIntervalSeconds === 'number') {
		update.syncIntervalSeconds = payload.syncIntervalSeconds;
	}
	if (
		typeof payload.logLevel === 'string' &&
		['info', 'warn', 'debug'].includes(payload.logLevel)
	) {
		update.logLevel = payload.logLevel as SettingsUpdateRequest['logLevel'];
	}
	if (typeof payload.corsOrigin === 'string') {
		update.corsOrigin = payload.corsOrigin;
	}

	// Pass through iCloud credentials when present (password optional to allow "leave blank to keep existing")
	if (typeof payload.iCloudUsername === 'string') {
		const candidate = payload.iCloudUsername.trim();
		if (candidate.length > 0) {
			update.iCloudUsername = candidate;
		}
	}
	if (typeof payload.iCloudPassword === 'string') {
		const candidate = payload.iCloudPassword;
		if (candidate.trim().length > 0) {
			update.iCloudPassword = candidate;
		}
	}

	return update;
}

function redactSensitiveFields(value: unknown): unknown {
	if (!value || typeof value !== 'object') return value;
	const src = value as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(src)) {
		const key = k.toLowerCase();
		if (key === 'password' || key === 'icloudpassword' || key === 'code' || key === 'mfacode') {
			out[k] = '[REDACTED]';
		} else if (key === 'data' && typeof v === 'string') {
			out[k] = `[base64 ${Math.min(v.length, 16)} chars…]`;
		} else if (typeof v === 'object' && v !== null) {
			out[k] = redactSensitiveFields(v);
		} else {
			out[k] = v;
		}
	}
	return out;
}

interface PendingAuthSession {
	endpoint: iCloudEndpoint;
	username: string;
	createdAt: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isICloudConnectionRequest(
	value: unknown,
): value is ICloudConnectionTestRequest {
	if (!isPlainObject(value)) {
		return false;
	}
	const request = value as Record<string, unknown>;
	const username = request.username;
	if (typeof username !== 'string' || username.trim().length === 0) {
		return false;
	}
	if (typeof request.sessionId === 'string' && request.sessionId.trim().length > 0) {
		return typeof request.mfaCode === 'string' && request.mfaCode.trim().length > 0;
	}
	return typeof request.password === 'string' && request.password.length > 0;
}

function isFrameConnectionRequest(
	value: unknown,
): value is FrameConnectionTestRequest {
	if (!isPlainObject(value)) {
		return false;
	}
	const host = (value as Record<string, unknown>).host;
	return typeof host === 'string' && host.trim().length > 0;
}


function normalizeICloudRequest(
	request: ICloudConnectionTestRequest,
): ICloudConnectionTestRequest {
	request.username = request.username.trim();
	if (typeof request.sessionId === 'string') {
		request.sessionId = request.sessionId.trim();
	}
	if (typeof request.mfaCode === 'string') {
		request.mfaCode = request.mfaCode.trim();
	}
	return request;
}

function normalizeFrameRequest(
	request: FrameConnectionTestRequest,
): FrameConnectionTestRequest {
	request.host = request.host.trim();
	return request;
}

export async function createWebServer(
	options: CreateWebServerOptions,
): Promise<Express> {
	const {
		config,
		stateStore,
		photoSyncService,
		frameDashboardService,
		syncScheduler,
		syncStateService: providedSyncStateService,
	} = options;
	const logger = resolveLogger(config, options.logger);
	const createEndpoint =
		options.createICloudEndpoint ??
		((endpointConfig: iCloudConfig, endpointLogger: Logger) =>
			new iCloudEndpoint(endpointConfig, endpointLogger));
	const connectionTester = options.connectionTester ?? null;
	const app = express();

	// Initialize SyncStateService (real-time sync status broadcasting)
	const syncStateService = providedSyncStateService ?? new SyncStateService(logger);
	try {
		await syncStateService.initialize();
	} catch (error) {
		logger.error({ error }, 'Failed to initialize SyncStateService');
	}

	app.disable('x-powered-by');

	if (config.corsOrigin) {
		app.use(cors({ origin: config.corsOrigin }));
	} else {
		app.use(cors());
	}

	app.use(express.json({ limit: '15mb' }));

	// Lightweight HTTP request/response logging with redaction
	app.use((req, res, next) => {
		const start = Date.now();
		const requestId = crypto.randomUUID();
		const safeBody = redactSensitiveFields(req.body);
		logger.info({ requestId, method: req.method, url: req.originalUrl, body: safeBody }, 'HTTP request');

		res.on('finish', () => {
			const durationMs = Date.now() - start;
			logger.info({ requestId, statusCode: res.statusCode, durationMs }, 'HTTP response');
		});

		next();
	});

	const pendingAuthSessions = new Map<string, PendingAuthSession>();
	const SESSION_TTL_MS = 5 * 60 * 1000;

	const pruneExpiredSessions = (): void => {
		const cutoff = Date.now() - SESSION_TTL_MS;
		for (const [sessionId, session] of pendingAuthSessions.entries()) {
			if (session.createdAt < cutoff) {
				pendingAuthSessions.delete(sessionId);
			}
		}
	};

	// ========== Configuration Endpoints ==========

	/**
	 * GET /api/configuration
	 * Retrieve current configuration (sanitized)
	 */
	app.get('/api/configuration', async (_req: Request, res: Response) => {
		try {
			const configuration = await configurationService.getConfiguration();
			res.json(configuration);
		} catch (error) {
			logger.error({ error }, 'Failed to fetch configuration');
			res.status(500).json({
				error: 'Failed to retrieve configuration',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	});

	/**
	 * POST /api/configuration
	 * Update configuration with validation
	 */
	app.post(
		'/api/configuration',
		validateBody(ConfigurationUpdateSchema),
		async (req: Request, res: Response) => {
			try {
				const updates = req.body;
				const configuration = await configurationService.updateConfiguration(updates);
				res.json(configuration);
			} catch (error) {
				logger.error({ error }, 'Failed to update configuration');
				res.status(500).json({
					error: 'Failed to update configuration',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		},
	);

	/**
	 * POST /api/configuration/test-icloud
	 * Test iCloud connection without saving
	 */
	app.post(
		'/api/configuration/test-icloud',
		validateBody(TestICloudRequestSchema),
		async (req: Request, res: Response) => {
			try {
				const { username, password, sourceAlbum } = req.body;
				const result = await configurationService.testICloudConnection(
					username,
					password,
					sourceAlbum,
				);
				res.json(result);
			} catch (error) {
				logger.error({ error }, 'iCloud connection test failed');
				res.status(500).json({
					success: false,
					message: error instanceof Error ? error.message : 'Connection test failed',
				});
			}
		},
	);

	/**
	 * POST /api/configuration/test-frame
	 * Test Frame TV connection without saving
	 */
	app.post(
		'/api/configuration/test-frame',
		validateBody(TestFrameRequestSchema),
		async (req: Request, res: Response) => {
			try {
				const { host, port } = req.body;
				const result = await configurationService.testFrameConnection(host, port);
				res.json(result);
			} catch (error) {
				logger.error({ error }, 'Frame TV connection test failed');
				res.status(500).json({
					success: false,
					message: error instanceof Error ? error.message : 'Connection test failed',
				});
			}
		},
	);

	// ========== Authentication Endpoints ==========


	app.post('/api/auth/icloud', async (req: Request, res: Response) => {
		pruneExpiredSessions();
		const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
		const password = typeof req.body?.password === 'string' ? req.body.password : '';
		if (username.length === 0 || password.length === 0) {
			res.status(400).json({ success: false, error: 'Username and password are required' });
			return;
		}

		const sessionId = crypto.randomUUID();
		const loggerChild = logger.child({ component: 'Auth', username });
		const snapshot = photoSyncService.getCurrentSettings();
		const endpointConfig: iCloudConfig = {
			username,
			password,
			sourceAlbum: snapshot?.syncAlbumName ?? 'Frame Sync',
			dataDirectory: path.resolve('data'),
		};
		const endpoint = createEndpoint(
			endpointConfig,
			loggerChild.child({ name: 'iCloudAuth' }),
		);

		try {
			await endpoint.authenticate(endpointConfig.username, endpointConfig.password, async () => {
				pendingAuthSessions.set(sessionId, {
					endpoint,
					username,
					createdAt: Date.now(),
				});
				throw new MfaRequiredError(sessionId);
			});

			pendingAuthSessions.delete(sessionId);
			res.json({
				success: true,
				status: endpoint.status,
				userInfo: {
					fullName: endpoint.accountInfo?.dsInfo?.fullName ?? 'Unknown User',
					appleId: username,
				},
			});
		} catch (error) {
			if (error instanceof MfaRequiredError) {
				res.json({ success: false, requiresMfa: true, sessionId: error.sessionId, status: endpoint.status });
				return;
			}

			pendingAuthSessions.delete(sessionId);
			const message = error instanceof Error ? error.message : 'Authentication failed';
			logger.error({ error: message, username }, 'iCloud authentication failed');
			res.status(500).json({ success: false, error: message });
		}
	});

	app.post('/api/auth/mfa', async (req: Request, res: Response) => {
		pruneExpiredSessions();
		const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
		const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
		if (sessionId.length === 0 || code.length === 0) {
			res.status(400).json({ success: false, error: 'sessionId and code are required' });
			return;
		}

		const session = pendingAuthSessions.get(sessionId);
		if (!session) {
			res.status(404).json({ success: false, error: 'MFA session expired. Please try again.' });
			return;
		}

		try {
			await session.endpoint.provideMfaCode(code);
			pendingAuthSessions.delete(sessionId);
			res.json({
				success: true,
				status: session.endpoint.status,
				userInfo: {
					fullName: session.endpoint.accountInfo?.dsInfo?.fullName ?? 'Unknown User',
					appleId: session.username,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to verify MFA code';
			logger.error({ error: message, sessionId }, 'MFA verification failed');
			res.status(400).json({ success: false, error: message });
		}
	});

	app.get('/api/status', async (_req: Request, res: Response) => {
		try {
			const state = await stateStore.read();
			const latestOperation = resolveLatestOperation(state.operations);
			const schedule = state.schedule ?? buildScheduleFallback(syncScheduler);
			const status: StatusResponse = {
				sync: latestOperation,
				schedule,
				config: photoSyncService.getCurrentSettings(),
			};
			res.json(status);
		} catch (error) {
			logger.error({ error }, 'Failed to read status from state store');
			res.status(500).json({ error: 'Failed to fetch status' });
		}
	});

	// --- New Sync Status (User Story 2) ---
	app.get('/api/sync/status', (_req: Request, res: Response) => {
		res.json(syncStateService.getState());
	});

	app.get('/api/sync/status/stream', (req: Request, res: Response) => {
		// SSE headers
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.flushHeaders?.();

		// Send initial state
		const initial = syncStateService.getState();
		res.write(`event: status\n`);
		res.write(`data: ${JSON.stringify(initial)}\n\n`);

		const onChange = (event: any) => {
			res.write(`event: ${event.type}\n`);
			res.write(`data: ${JSON.stringify(event.state)}\n\n`);
		};

		syncStateService.on('stateChange', onChange);

		req.on('close', () => {
			syncStateService.off('stateChange', onChange);
		});
	});

	app.post('/api/sync/start', async (_req: Request, res: Response) => {
		try {
			if (syncStateService.isRunning()) {
				res.status(409).json({ error: 'Sync already running' });
				return;
			}
			const snapshot = photoSyncService.getCurrentSettings();
			if (!snapshot.isConfigured) {
				res.status(503).json({ error: 'Configuration incomplete', missingFields: snapshot.missingFields });
				return;
			}
			await syncStateService.startSync(0); // totalPhotos unknown until PhotoSyncService runs
			await syncScheduler.triggerManualSync();
			res.status(202).json({ accepted: true, status: 'started' });
		} catch (error) {
			logger.error({ error }, 'Failed to start sync');
			res.status(500).json({ error: 'Failed to start sync' });
		}
	});

	app.post('/api/sync/stop', async (_req: Request, res: Response) => {
		try {
			if (!syncStateService.isRunning()) {
				res.json({ status: 'idle' });
				return;
			}
			// Attempt to stop scheduler if running
			if (syncScheduler.isRunning()) {
				try { await syncScheduler.stop(); } catch (schedulerError) {
					logger.warn({ error: schedulerError }, 'Failed to stop scheduler gracefully');
				}
			}
			await syncStateService.stopSync();
			res.json({ status: 'stopped' });
		} catch (error) {
			logger.error({ error }, 'Failed to stop sync');
			res.status(500).json({ error: 'Failed to stop sync' });
		}
	});

	app.post('/api/sync', async (req: Request, res: Response) => {
		try {
			const manualRequest = extractManualSyncRequest(req.body);
			const accepted = await photoSyncService.queueManualSync(manualRequest);
			await syncScheduler.triggerManualSync();
			res.status(202).json(accepted satisfies SyncAccepted);
		} catch (error) {
			if (error instanceof SetupRequiredError) {
				const snapshot = photoSyncService.getCurrentSettings();
				res.status(503).json({
					error: error.message,
					missingFields: snapshot.missingFields,
					lastError: snapshot.lastError,
				});
				return;
			}
			logger.error({ error }, 'Manual sync request failed');
			res.status(500).json({ error: 'Failed to trigger manual sync' });
		}
	});

	app.get('/api/albums', async (req: Request, res: Response) => {
		const refresh = req.query.refresh === 'true';
		try {
			const albums = refresh
				? await photoSyncService.fetchAlbumsFromiCloud()
				: await photoSyncService.listAlbums();
			res.json({ albums: albums satisfies AlbumSummary[] });
		} catch (error) {
			logger.error({ error, refresh }, 'Failed to list albums');
			if (error instanceof SetupRequiredError) {
				res.status(503).json({ error: error.message });
			} else {
				res.status(500).json({ error: 'Failed to list albums' });
			}
		}
	});

	app.get('/api/photos', async (req: Request, res: Response) => {
		const albumId = typeof req.query.albumId === 'string' ? req.query.albumId : '';
		if (albumId.length === 0) {
			res.status(400).json({ error: 'albumId query parameter is required' });
			return;
		}

		const page = parsePositiveInteger(req.query.page, 1);
		const pageSize = parsePositiveInteger(req.query.pageSize, 24);
		const refresh = req.query.refresh === 'true';

		try {
			const photoPage = refresh
				? await photoSyncService.fetchPhotosFromiCloud({
						albumId,
						page,
						pageSize,
				  } satisfies PhotoListQuery)
				: await photoSyncService.listPhotos({
						albumId,
						page,
						pageSize,
				  } satisfies PhotoListQuery);
			res.json(photoPage satisfies PhotoPage);
		} catch (error) {
			logger.error({ error, albumId, page, pageSize, refresh }, 'Failed to list photos');
			if (error instanceof SetupRequiredError) {
				res.status(503).json({ error: error.message });
			} else {
				res.status(500).json({ error: 'Failed to list photos' });
			}
		}
	});

	app.post('/api/settings', async (req: Request, res: Response) => {
		const updateRequest = extractSettingsUpdate(req.body, logger);
		if (!updateRequest) {
			res.status(400).json({ error: 'syncAlbumName and frameHost are required' });
			return;
		}

		try {
			const snapshot = await photoSyncService.updateConfiguration(updateRequest);
			if (typeof updateRequest.syncIntervalSeconds === 'number') {
				syncScheduler.updateInterval(updateRequest.syncIntervalSeconds);
			}
			if (photoSyncService.isReady() && !syncScheduler.isRunning()) {
				try {
					await syncScheduler.start();
				} catch (startError) {
					logger.error({ error: startError }, 'Failed to start scheduler after configuration update');
				}
			}
			res.json({ success: true, config: snapshot satisfies SettingsConfigSnapshot });
		} catch (error) {
			logger.error({ error }, 'Failed to update configuration');
			res.status(500).json({ error: 'Failed to update settings' });
		}
	});

	app.get('/api/frame/status', async (_req: Request, res: Response) => {
		try {
			const snapshot = await frameDashboardService.getStatusSnapshot();
			res.json(snapshot satisfies FrameStatusSnapshot);
		} catch (error) {
			logger.error({ error }, 'Failed to fetch frame status');
			res.status(500).json({ error: 'Failed to fetch frame status' });
		}
	});

	app.post('/api/frame/power', async (req: Request, res: Response) => {
		const action =
			typeof req.body?.action === 'string'
				? (req.body.action as FramePowerAction)
				: null;

		if (!action || !['on', 'off', 'toggle'].includes(action)) {
			res.status(400).json({ error: 'action must be one of on, off, or toggle' });
			return;
		}

		try {
			const responsePayload = await frameDashboardService.setPowerState(action);
			res.json(responsePayload satisfies FramePowerStateResponse);
		} catch (error) {
			logger.error({ error }, 'Failed to update frame power state');
			res.status(500).json({ error: 'Failed to update frame power state' });
		}
	});

	app.get('/api/frame/art', async (req: Request, res: Response) => {
		const page = parsePositiveInteger(req.query.page, 1);
		const pageSize = parsePositiveInteger(req.query.pageSize, 24);
		const categoryId =
			typeof req.query.categoryId === 'string'
				? req.query.categoryId
				: undefined;

		try {
			const artPage = await frameDashboardService.listArt({
				page,
				pageSize,
				categoryId,
			} satisfies FrameArtListQuery);
			res.json(artPage satisfies FrameArtPage);
		} catch (error) {
			logger.error({ error, page, pageSize, categoryId }, 'Failed to list frame art');
			res.status(500).json({ error: 'Failed to list frame art' });
		}
	});

	app.post('/api/frame/art', async (req: Request, res: Response) => {
		const payload = req.body as Record<string, unknown> | undefined;
		const data = typeof payload?.data === 'string' ? payload.data : '';
		if (data.trim().length === 0) {
			res.status(400).json({ error: 'data (base64) is required' });
			return;
		}

		const filename = typeof payload?.filename === 'string' ? payload.filename : undefined;
		const contentType = typeof payload?.contentType === 'string' ? payload.contentType : undefined;
		const setAsCurrent = Boolean(payload?.setAsCurrent);

		try {
			const result = await frameDashboardService.uploadArt({
				filename,
				contentType,
				data,
				setAsCurrent,
			});
			res.status(201).json(result);
		} catch (error) {
			logger.error({ error, filename }, 'Failed to upload frame art');
			res.status(500).json({ error: 'Failed to upload frame art' });
		}
	});

	app.delete('/api/frame/art/:artId', async (req: Request, res: Response) => {
		const artId = req.params.artId?.trim();
		if (!artId) {
			res.status(400).json({ error: 'artId parameter is required' });
			return;
		}

		try {
			const success = await frameDashboardService.deleteArt(artId);
			if (success) {
				res.sendStatus(204);
			} else {
				res.status(404).json({ error: 'Art not found or could not be deleted' });
			}
		} catch (error) {
			logger.error({ error, artId }, 'Failed to delete frame art');
			res.status(500).json({ error: 'Failed to delete frame art' });
		}
	});

	app.get('/api/frame/art/:artId/thumbnail', async (req: Request, res: Response) => {
		const artId = req.params.artId?.trim();
		if (!artId) {
			res.status(400).json({ error: 'artId parameter is required' });
			return;
		}

		try {
			// Avoid caching thumbnails (especially empty/failed responses)
			res.setHeader('Cache-Control', 'no-store');
			const thumbnail = await frameDashboardService.getThumbnail(artId);
			res.setHeader('Content-Type', 'image/jpeg');
			res.status(200).send(thumbnail);
		} catch (error) {
			logger.error({ error, artId }, 'Failed to fetch art thumbnail');
			res.status(500).json({ error: 'Failed to fetch art thumbnail' });
		}
	});

	app.post('/api/connections/test', async (req: Request, res: Response) => {
		if (!connectionTester) {
			res.status(503).json({ error: 'Connection testing service is not configured.' });
			return;
		}

		if (!isPlainObject(req.body)) {
			res.status(400).json({ error: 'Payload must include icloud and frame configuration.' });
			return;
		}
		const { icloud, frame } = req.body as {
			iCloud?: unknown;
			icloud?: unknown;
			frame?: unknown;
		};
		const icloudPayload = (icloud ?? (req.body as Record<string, unknown>).iCloud) ?? null;
		const framePayload = frame ?? null;

		if (!isICloudConnectionRequest(icloudPayload) || !isFrameConnectionRequest(framePayload)) {
			res.status(400).json({ error: 'Payload must include icloud and frame configuration.' });
			return;
		}

		const icloudRequest = normalizeICloudRequest(icloudPayload);
		let icloudResult: ConnectionTestResult;
		try {
			icloudResult = await connectionTester.testICloudConnection(icloudRequest);
		} catch (error) {
			icloudResult = {
				success: false,
				error: resolveErrorMessage(error),
				username: icloudRequest.username,
			};
		}

		const frameRequest = normalizeFrameRequest(framePayload);
		let frameResult: ConnectionTestResult;
		try {
			frameResult = await connectionTester.testFrameConnection(frameRequest);
		} catch (error) {
			frameResult = {
				success: false,
				error: resolveErrorMessage(error),
				host: frameRequest.host,
			};
		}

		const overall = icloudResult.success === true && frameResult.success === true ? 'ready' : 'attention';

		res.json({
			overall,
			icloud: icloudResult,
			frame: frameResult,
		});
	});

	return app;
}
