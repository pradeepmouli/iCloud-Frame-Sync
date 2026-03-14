/**
 * Configuration Service
 *
 * Handles all configuration operations with database persistence and encryption.
 * Falls back to in-memory storage when the database is unavailable (e.g., in tests).
 *
 * @module services/ConfigurationService
 */

import { decrypt, encrypt, isEncrypted } from '../lib/encryption.js';
import { prisma } from '../lib/prisma.js';
import { createLogger } from '../observability/logger.js';

const logger = createLogger({ name: 'ConfigurationService' });

export interface ConfigurationData {
	// iCloud Configuration
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

/**
 * Flat configuration update accepted by POST /api/configuration
 */
export interface ConfigurationUpdateRequest {
	icloudUsername?: string;
	icloudPassword?: string;
	frameHost?: string;
	syncIntervalSeconds?: number;
	syncAlbumName?: string;
	logLevel?: string;
	corsOrigin?: string;
	webPort?: number;
}

/**
 * Flat configuration response returned by GET and POST /api/configuration
 */
export interface ConfigurationResponse {
	icloudUsername: string | null;
	frameHost: string | null;
	syncIntervalSeconds: number;
	syncAlbumName: string | null;
	logLevel: string | null;
	corsOrigin: string | null;
	webPort: number | null;
	hasPassword: boolean;
}

export interface ConnectionTestResult {
	success: boolean;
	message: string;
	details?: Record<string, unknown>;
}

/**
 * Interface for configuration service implementations.
 * Allows dependency injection of different backends (Prisma, in-memory, etc.)
 */
export interface IConfigurationService {
	getConfiguration(): Promise<ConfigurationResponse>;
	updateConfiguration(
		updates: ConfigurationUpdateRequest,
	): Promise<ConfigurationResponse>;
	testICloudConnection(
		username: string,
		password: string,
		sourceAlbum?: string,
	): Promise<ConnectionTestResult>;
	testFrameConnection(
		host: string,
		port?: number,
	): Promise<ConnectionTestResult>;
}

/**
 * In-memory configuration state
 */
interface InMemoryConfigState {
	icloudUsername: string | null;
	icloudPassword: string | null;
	icloudSourceAlbum: string | null;
	frameHost: string | null;
	syncInterval: number;
	logLevel: string | null;
	corsOrigin: string | null;
	webPort: number | null;
}

export class ConfigurationService implements IConfigurationService {
	private static readonly DEFAULT_SYNC_INTERVAL = 60;

	private static readonly DEFAULT_DB_CONFIG = {
		framePort: 8002,
		syncInterval: 60,
		syncEnabled: false,
		deleteAfterSync: true,
		maxRetries: 3,
	};

	// In-memory configuration state (always maintained, serves as fallback)
	private state: InMemoryConfigState = {
		icloudUsername: null,
		icloudPassword: null,
		icloudSourceAlbum: null,
		frameHost: null,
		syncInterval: ConfigurationService.DEFAULT_SYNC_INTERVAL,
		logLevel: null,
		corsOrigin: null,
		webPort: null,
	};

	// Whether to attempt Prisma operations
	private usePrisma: boolean;

	constructor(options?: { usePrisma?: boolean }) {
		this.usePrisma = options?.usePrisma !== false;
	}

	/**
	 * Build a ConfigurationResponse from current in-memory state
	 */
	private buildResponse(): ConfigurationResponse {
		return {
			icloudUsername: this.state.icloudUsername,
			frameHost: this.state.frameHost,
			syncIntervalSeconds: this.state.syncInterval,
			syncAlbumName: this.state.icloudSourceAlbum,
			logLevel: this.state.logLevel,
			corsOrigin: this.state.corsOrigin,
			webPort: this.state.webPort,
			hasPassword: Boolean(this.state.icloudPassword),
		};
	}

	/**
	 * Get current configuration (sanitized flat response)
	 */
	async getConfiguration(): Promise<ConfigurationResponse> {
		logger.debug('Fetching configuration');

		if (this.usePrisma) {
			try {
				let config = await prisma.configuration.findUnique({
					where: { id: 'default' },
				});

				if (!config) {
					logger.info('Initializing default configuration');
					config = await prisma.configuration.create({
						data: {
							id: 'default',
							...ConfigurationService.DEFAULT_DB_CONFIG,
						},
					});
				}

				return {
					icloudUsername: config.icloudUsername,
					frameHost: config.frameHost,
					syncIntervalSeconds: config.syncInterval,
					syncAlbumName: config.icloudSourceAlbum,
					logLevel: this.state.logLevel,
					corsOrigin: this.state.corsOrigin,
					webPort: this.state.webPort,
					hasPassword: Boolean(config.icloudPassword),
				};
			} catch (error) {
				logger.warn(
					{ error },
					'Failed to fetch configuration from database, falling back to in-memory',
				);
				// Fall through to in-memory
			}
		}

		return this.buildResponse();
	}

	/**
	 * Update configuration with flat field names
	 */
	async updateConfiguration(
		updates: ConfigurationUpdateRequest,
	): Promise<ConfigurationResponse> {
		logger.info(
			{
				updates: {
					...updates,
					icloudPassword: updates.icloudPassword ? '[REDACTED]' : undefined,
				},
			},
			'Updating configuration',
		);

		// Always apply updates to in-memory state
		if (updates.icloudUsername !== undefined) {
			this.state.icloudUsername = updates.icloudUsername;
		}
		if (updates.icloudPassword !== undefined) {
			this.state.icloudPassword = updates.icloudPassword || null;
		}
		if (updates.frameHost !== undefined) {
			this.state.frameHost = updates.frameHost;
		}
		if (updates.syncIntervalSeconds !== undefined) {
			this.state.syncInterval = updates.syncIntervalSeconds;
		}
		if (updates.syncAlbumName !== undefined) {
			this.state.icloudSourceAlbum = updates.syncAlbumName;
		}
		if (updates.logLevel !== undefined) {
			this.state.logLevel = updates.logLevel;
		}
		if (updates.corsOrigin !== undefined) {
			this.state.corsOrigin = updates.corsOrigin;
		}
		if (updates.webPort !== undefined) {
			this.state.webPort = updates.webPort;
		}

		if (this.usePrisma) {
			try {
				const updateData: Record<string, unknown> = {};

				if (updates.icloudUsername !== undefined) {
					updateData.icloudUsername = updates.icloudUsername;
				}
				if (updates.icloudPassword !== undefined) {
					updateData.icloudPassword = updates.icloudPassword
						? encrypt(updates.icloudPassword)
						: null;
				}
				if (updates.frameHost !== undefined) {
					updateData.frameHost = updates.frameHost;
				}
				if (updates.syncIntervalSeconds !== undefined) {
					updateData.syncInterval = updates.syncIntervalSeconds;
				}
				if (updates.syncAlbumName !== undefined) {
					updateData.icloudSourceAlbum = updates.syncAlbumName;
				}

				const config = await prisma.configuration.upsert({
					where: { id: 'default' },
					create: {
						id: 'default',
						...ConfigurationService.DEFAULT_DB_CONFIG,
						...updateData,
					},
					update: updateData,
				});

				logger.info('Configuration updated successfully (database)');

				return {
					icloudUsername: config.icloudUsername,
					frameHost: config.frameHost,
					syncIntervalSeconds: config.syncInterval,
					syncAlbumName: config.icloudSourceAlbum,
					logLevel: this.state.logLevel,
					corsOrigin: this.state.corsOrigin,
					webPort: this.state.webPort,
					hasPassword: Boolean(config.icloudPassword),
				};
			} catch (error) {
				logger.warn(
					{ error },
					'Failed to update configuration in database, using in-memory',
				);
				// Fall through to in-memory response
			}
		}

		logger.info('Configuration updated successfully (in-memory)');
		return this.buildResponse();
	}

	/**
	 * Test iCloud connection without saving
	 */
	async testICloudConnection(
		username: string,
		password: string,
		sourceAlbum?: string,
	): Promise<ConnectionTestResult> {
		logger.info({ username, sourceAlbum }, 'Testing iCloud connection');

		try {
			if (!username || !password) {
				return {
					success: false,
					message: 'Username and password are required',
				};
			}

			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(username)) {
				return {
					success: false,
					message: 'Invalid email format',
				};
			}

			logger.warn(
				'iCloud connection test not yet implemented - returning mock success',
			);
			return {
				success: true,
				message: 'Connection test not yet implemented',
				details: {
					username,
					sourceAlbum,
					note: 'This is a placeholder response. Actual iCloud API integration required.',
				},
			};
		} catch (error) {
			logger.error({ error }, 'iCloud connection test failed');
			return {
				success: false,
				message:
					error instanceof Error ? error.message : 'Connection test failed',
			};
		}
	}

	/**
	 * Test Frame TV connection without saving
	 */
	async testFrameConnection(
		host: string,
		port: number = 8002,
	): Promise<ConnectionTestResult> {
		logger.info({ host, port }, 'Testing Frame TV connection');

		try {
			if (!host) {
				return {
					success: false,
					message: 'Host is required',
				};
			}

			if (port < 1 || port > 65535) {
				return {
					success: false,
					message: 'Port must be between 1 and 65535',
				};
			}

			logger.warn(
				'Frame TV connection test not yet implemented - returning mock success',
			);
			return {
				success: true,
				message: 'Connection test not yet implemented',
				details: {
					host,
					port,
					note: 'This is a placeholder response. Actual Frame API integration required.',
				},
			};
		} catch (error) {
			logger.error({ error }, 'Frame TV connection test failed');
			return {
				success: false,
				message:
					error instanceof Error ? error.message : 'Connection test failed',
			};
		}
	}

	/**
	 * Get decrypted password for internal use only
	 * @private
	 */
	async getDecryptedPassword(): Promise<string | null> {
		if (!this.usePrisma) {
			return this.state.icloudPassword;
		}

		try {
			const config = await prisma.configuration.findUnique({
				where: { id: 'default' },
				select: { icloudPassword: true },
			});

			if (!config?.icloudPassword) {
				return null;
			}

			if (isEncrypted(config.icloudPassword)) {
				return decrypt(config.icloudPassword);
			}

			logger.warn('Found unencrypted password in database');
			return config.icloudPassword;
		} catch {
			return this.state.icloudPassword;
		}
	}
}

// Export singleton instance
export const configurationService = new ConfigurationService();
