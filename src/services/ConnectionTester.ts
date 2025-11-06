import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Logger } from 'pino';

import type { FrameConfig, iCloudConfig } from '../types/endpoint.js';
import type {
	ConnectionTestResult,
	ConnectionTester,
	FrameConnectionTestRequest,
	ICloudConnectionTestRequest,
} from './connectionTypes.js';
import { FrameEndpoint } from './FrameEndpoint.js';
import { iCloudEndpoint } from './iCloudEndpoint.js';

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ICLOUD_ALBUM = 'Frame Sync';

interface PendingICloudSession {
	endpoint: iCloudEndpoint;
	username: string;
	createdAt: number;
}

export interface ConnectionTesterOptions {
	logger: Logger;
	createICloudEndpoint?: (_config: iCloudConfig, _logger: Logger) => iCloudEndpoint;
	createFrameEndpoint?: (_config: FrameConfig, _logger: Logger) => FrameEndpoint;
	defaultAlbum?: string;
	dataDirectory?: string;
	sessionTtlMs?: number;
}

class MfaRequiredError extends Error {
	public readonly sessionId: string;

	constructor (sessionId: string) {
		super('MFA_REQUIRED');
		this.sessionId = sessionId;
	}
}

function resolveErrorMessage(_error: unknown): string {
	if (_error instanceof Error && typeof _error.message === 'string') {
		return _error.message;
	}
	if (typeof _error === 'string' && _error.trim().length > 0) {
		return _error.trim();
	}
	return 'An unexpected error occurred while testing the connection.';
}

async function safeClose(endpoint: { close: () => Promise<void>; }): Promise<void> {
	try {
		await endpoint.close();
	} catch (error) {
		// Swallow close errors to avoid masking original issues.
	}
}

export class ConnectionTesterService implements ConnectionTester {
	private readonly logger: Logger;
	private readonly createICloudEndpoint: (config: iCloudConfig, logger: Logger) => iCloudEndpoint;
	private readonly createFrameEndpoint: (config: FrameConfig, logger: Logger) => FrameEndpoint;
	private readonly defaultAlbum: string;
	private readonly dataDirectory: string;
	private readonly sessionTtlMs: number;
	private readonly sessions = new Map<string, PendingICloudSession>();

	constructor (options: ConnectionTesterOptions) {
		this.logger = options.logger;
		this.createICloudEndpoint =
			options.createICloudEndpoint ??
			((_config: iCloudConfig, _logger: Logger) => new iCloudEndpoint(_config, _logger));
		this.createFrameEndpoint =
			options.createFrameEndpoint ??
			((_config: FrameConfig, _logger: Logger) => new FrameEndpoint(_config, _logger));
		this.defaultAlbum = options.defaultAlbum ?? DEFAULT_ICLOUD_ALBUM;
		this.dataDirectory = options.dataDirectory ?? path.resolve('data', 'connection-tests');
		this.sessionTtlMs = Math.max(1000, options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS);
	}

	async testICloudConnection(request: ICloudConnectionTestRequest): Promise<ConnectionTestResult> {
		const username = request.username?.trim();
		if (!username) {
			return {
				success: false,
				error: 'Username is required to test the iCloud connection.',
			};
		}

		this.pruneExpiredSessions();

		if (request.sessionId && request.mfaCode) {
			return this.verifyICloudMfa(request.sessionId, request.mfaCode);
		}

		if (request.sessionId && !request.mfaCode) {
			return {
				success: false,
				requiresMfa: true,
				sessionId: request.sessionId,
				error: 'Verification code is required to complete MFA.',
			};
		}

		const password = request.password?.trim();
		if (!password) {
			return {
				success: false,
				error: 'Password is required to authenticate with iCloud.',
			};
		}

		if (request.forceRefresh) {
			this.clearSessionsForUser(username);
		}

		const sessionId = randomUUID();
		const endpointLogger = this.createChildLogger('iCloudConnectionTest', { username });
		const endpointConfig: iCloudConfig = {
			username,
			password,
			sourceAlbum: this.defaultAlbum,
			dataDirectory: this.dataDirectory,
		};
		const endpoint = this.createICloudEndpoint(endpointConfig, endpointLogger);

		try {
			await endpoint.authenticate(username, password, async () => {
				this.sessions.set(sessionId, {
					endpoint,
					username,
					createdAt: Date.now(),
				});
				throw new MfaRequiredError(sessionId);
			});

			const result: ConnectionTestResult = {
				success: true,
				status: endpoint.status,
				userInfo: this.mapAccountInfo(endpoint, username),
			};
			await safeClose(endpoint);
			return result;
		} catch (error) {
			if (error instanceof MfaRequiredError) {
				return {
					success: false,
					requiresMfa: true,
					sessionId: error.sessionId,
					status: endpoint.status,
					message: 'Two-factor authentication required. Enter the verification code sent to your Apple devices.',
				};
			}

			this.sessions.delete(sessionId);
			await safeClose(endpoint);
			endpointLogger.error({ error }, 'iCloud connection test failed');
			return {
				success: false,
				error: resolveErrorMessage(error),
				status: endpoint.status,
			};
		}
	}

	async testFrameConnection(request: FrameConnectionTestRequest): Promise<ConnectionTestResult> {
		const host = request.host?.trim();
		if (!host) {
			return {
				success: false,
				error: 'Frame host is required to test the connection.',
			};
		}

		const frameLogger = this.createChildLogger('FrameConnectionTest', { host });
		const frameConfig: FrameConfig = {
			host,
			name: request.name ?? 'Frame Connection Test',
			services: request.services,
			verbosity: request.verbosity,
		};
		const endpoint = this.createFrameEndpoint(frameConfig, frameLogger);
		const startedAt = performance.now();

		try {
			const [deviceInfo, isOn, inArtMode] = await Promise.all([
				endpoint.getDeviceInfo(),
				endpoint.isOn().catch(() => false),
				endpoint.inArtMode().catch(() => false),
			]);
			const responseTimeMs = Math.round(performance.now() - startedAt);
			await safeClose(endpoint);
			return {
				success: true,
				host,
				isReachable: true,
				isOn,
				inArtMode,
				deviceInfo,
				responseTimeMs,
			};
		} catch (error) {
			await safeClose(endpoint);
			frameLogger.error({ error }, 'Frame connection test failed');
			return {
				success: false,
				error: resolveErrorMessage(error),
				host,
			};
		}
	}

	private async verifyICloudMfa(sessionId: string, code: string): Promise<ConnectionTestResult> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return {
				success: false,
				error: 'MFA session expired. Please restart the connection test.',
			};
		}

		try {
			await session.endpoint.provideMfaCode(code);
			this.sessions.delete(sessionId);
			await safeClose(session.endpoint);
			return {
				success: true,
				status: session.endpoint.status,
				userInfo: this.mapAccountInfo(session.endpoint, session.username),
			};
		} catch (error) {
			const message = resolveErrorMessage(error);
			const shouldRetain = /(invalid|incorrect|code)/i.test(message);
			if (!shouldRetain) {
				this.sessions.delete(sessionId);
				await safeClose(session.endpoint);
			}
			return {
				success: false,
				requiresMfa: true,
				sessionId,
				error: message,
				status: session.endpoint.status,
			};
		}
	}

	private pruneExpiredSessions(): void {
		const cutoff = Date.now() - this.sessionTtlMs;
		for (const [sessionId, session] of this.sessions.entries()) {
			if (session.createdAt < cutoff) {
				this.sessions.delete(sessionId);
				void safeClose(session.endpoint);
			}
		}
	}

	private clearSessionsForUser(username: string): void {
		for (const [sessionId, session] of this.sessions.entries()) {
			if (session.username === username) {
				this.sessions.delete(sessionId);
				void safeClose(session.endpoint);
			}
		}
	}

	private mapAccountInfo(endpoint: iCloudEndpoint, username: string): Record<string, unknown> | undefined {
		const fullName = endpoint.accountInfo?.dsInfo?.fullName ?? undefined;
		if (!fullName && !username) {
			return undefined;
		}
		return {
			fullName: fullName ?? 'Unknown User',
			appleId: username,
		};
	}

	private createChildLogger(name: string, bindings: Record<string, unknown>): Logger {
		if (typeof this.logger.child === 'function') {
			return this.logger.child({ component: name, ...bindings });
		}
		return this.logger;
	}
}
