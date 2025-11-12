/**
 * Configuration Service
 *
 * Handles all configuration operations with database persistence and encryption
 *
 * @module services/ConfigurationService
 */

import pino from 'pino';
import { decrypt, encrypt, isEncrypted } from '../lib/encryption.js';
import { prisma } from '../lib/prisma.js';

const logger = pino({ name: 'ConfigurationService' });

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

export interface ConfigurationResponse extends Omit<ConfigurationData, 'icloudPassword'> {
	hasPassword: boolean;
}

export interface ConnectionTestResult {
	success: boolean;
	message: string;
	details?: Record<string, unknown>;
}

export class ConfigurationService {
	private static readonly DEFAULT_CONFIG: Required<Omit<ConfigurationData, 'icloudUsername' | 'icloudPassword' | 'icloudSourceAlbum' | 'frameHost'>> = {
		framePort: 8002,
		syncInterval: 60,
		syncEnabled: false,
		deleteAfterSync: true,
		maxRetries: 3,
	};

	/**
	 * Get current configuration (sanitized response)
	 */
	async getConfiguration(): Promise<ConfigurationResponse> {
		logger.debug('Fetching configuration');

		try {
			let config = await prisma.configuration.findUnique({
				where: { id: 'default' },
			});

			// Initialize if not exists
			if (!config) {
				logger.info('Initializing default configuration');
				config = await prisma.configuration.create({
					data: {
						id: 'default',
						...ConfigurationService.DEFAULT_CONFIG,
					},
				});
			}

			// Sanitize response (never return password)
			const response: ConfigurationResponse = {
				icloudUsername: config.icloudUsername,
				icloudSourceAlbum: config.icloudSourceAlbum,
				frameHost: config.frameHost,
				framePort: config.framePort,
				syncInterval: config.syncInterval,
				syncEnabled: config.syncEnabled,
				deleteAfterSync: config.deleteAfterSync,
				maxRetries: config.maxRetries,
				hasPassword: Boolean(config.icloudPassword),
			};

			logger.debug('Configuration fetched successfully');
			return response;
		} catch (error) {
			logger.error({ error }, 'Failed to fetch configuration');
			throw new Error('Failed to retrieve configuration');
		}
	}

	/**
	 * Update configuration with partial data
	 */
	async updateConfiguration(updates: ConfigurationData): Promise<ConfigurationResponse> {
		logger.info({ updates: { ...updates, icloudPassword: updates.icloudPassword ? '[REDACTED]' : undefined } }, 'Updating configuration');

		try {
			// Prepare update data (using Record<string, any> for dynamic updates)
			const updateData: Record<string, unknown> = {};

			// iCloud configuration
			if (updates.icloudUsername !== undefined) {
				updateData.icloudUsername = updates.icloudUsername;
			}
			if (updates.icloudPassword !== undefined) {
				// Encrypt password if provided
				updateData.icloudPassword = updates.icloudPassword ? encrypt(updates.icloudPassword) : null;
			}
			if (updates.icloudSourceAlbum !== undefined) {
				updateData.icloudSourceAlbum = updates.icloudSourceAlbum;
			}

			// Frame configuration
			if (updates.frameHost !== undefined) {
				updateData.frameHost = updates.frameHost;
			}
			if (updates.framePort !== undefined) {
				updateData.framePort = updates.framePort;
			}

			// Sync configuration
			if (updates.syncInterval !== undefined) {
				updateData.syncInterval = updates.syncInterval;
			}
			if (updates.syncEnabled !== undefined) {
				updateData.syncEnabled = updates.syncEnabled;
			}
			if (updates.deleteAfterSync !== undefined) {
				updateData.deleteAfterSync = updates.deleteAfterSync;
			}
			if (updates.maxRetries !== undefined) {
				updateData.maxRetries = updates.maxRetries;
			}

			// Upsert configuration
			const config = await prisma.configuration.upsert({
				where: { id: 'default' },
				create: {
					id: 'default',
					...ConfigurationService.DEFAULT_CONFIG,
					...updateData,
				},
				update: updateData,
			});

			logger.info('Configuration updated successfully');

			// Return sanitized response
			return {
				icloudUsername: config.icloudUsername,
				icloudSourceAlbum: config.icloudSourceAlbum,
				frameHost: config.frameHost,
				framePort: config.framePort,
				syncInterval: config.syncInterval,
				syncEnabled: config.syncEnabled,
				deleteAfterSync: config.deleteAfterSync,
				maxRetries: config.maxRetries,
				hasPassword: Boolean(config.icloudPassword),
			};
		} catch (error) {
			logger.error({ error }, 'Failed to update configuration');
			throw new Error('Failed to update configuration');
		}
	}

	/**
	 * Test iCloud connection without saving
	 */
	async testICloudConnection(username: string, password: string, sourceAlbum?: string): Promise<ConnectionTestResult> {
		logger.info({ username, sourceAlbum }, 'Testing iCloud connection');

		try {
			// TODO: Implement actual iCloud connection test
			// For now, basic validation
			if (!username || !password) {
				return {
					success: false,
					message: 'Username and password are required',
				};
			}

			// Email validation
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(username)) {
				return {
					success: false,
					message: 'Invalid email format',
				};
			}

			// Placeholder for actual connection test
			logger.warn('iCloud connection test not yet implemented - returning mock success');
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
				message: error instanceof Error ? error.message : 'Connection test failed',
			};
		}
	}

	/**
	 * Test Frame TV connection without saving
	 */
	async testFrameConnection(host: string, port: number = 8002): Promise<ConnectionTestResult> {
		logger.info({ host, port }, 'Testing Frame TV connection');

		try {
			// TODO: Implement actual Frame TV connection test
			// For now, basic validation
			if (!host) {
				return {
					success: false,
					message: 'Host is required',
				};
			}

			// Port validation
			if (port < 1 || port > 65535) {
				return {
					success: false,
					message: 'Port must be between 1 and 65535',
				};
			}

			// Placeholder for actual connection test
			logger.warn('Frame TV connection test not yet implemented - returning mock success');
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
				message: error instanceof Error ? error.message : 'Connection test failed',
			};
		}
	}

	/**
	 * Get decrypted password for internal use only
	 * @private
	 */
	async getDecryptedPassword(): Promise<string | null> {
		const config = await prisma.configuration.findUnique({
			where: { id: 'default' },
			select: { icloudPassword: true },
		});

		if (!config?.icloudPassword) {
			return null;
		}

		// Check if password is encrypted
		if (isEncrypted(config.icloudPassword)) {
			return decrypt(config.icloudPassword);
		}

		// If not encrypted, return as-is (shouldn't happen in normal operation)
		logger.warn('Found unencrypted password in database');
		return config.icloudPassword;
	}
}

// Export singleton instance
export const configurationService = new ConfigurationService();
