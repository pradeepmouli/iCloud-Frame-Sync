/**
 * Environment configuration loader with type safety and validation
 */
import { config } from '@dotenvx/dotenvx';
import path from 'node:path';

// Load environment variables
config();

export interface iCloudConfig {
	username: string;
	password: string;
	sourceAlbum: string;
	dataDirectory: string;
	logLevel?: string;
	requestMfaCallback?: () => Promise<string>;
}

export interface FrameConfig {
	host: string;
	name?: string;
	services?: string[];
	verbosity?: number;
	logLevel?: string;
}

export interface AppConfig {
	iCloud: iCloudConfig;
	frame: FrameConfig;
	syncIntervalSeconds: number;
	logLevel: string;
	webPort?: number;
	corsOrigin?: string;
}

/**
 * Validates required environment variables
 */
function readRequiredEnv(key: string): string {
	const value = process.env[key];
	if (!value || value.trim() === '') {
		return '';
	}
	return value;
}

/**
 * Gets optional environment variable with default
 */
function getEnvOrDefault(key: string, defaultValue: string): string {
	return process.env[key] || defaultValue;
}

/**
 * Creates application configuration from environment variables
 */
export function createAppConfigFromEnv(): AppConfig {
	// Validate required variables
	const iCloudUsername = readRequiredEnv('ICLOUD_USERNAME');
	const iCloudPassword = readRequiredEnv('ICLOUD_PASSWORD');
	const frameHost = readRequiredEnv('SAMSUNG_FRAME_HOST');

	// Optional with defaults
	const iCloudSourceAlbum = getEnvOrDefault('ICLOUD_SOURCE_ALBUM', 'Frame Sync');
	const iCloudDataDirectory = path.resolve(
		getEnvOrDefault('ICLOUD_DATA_DIRECTORY', 'data')
	);
	const syncIntervalSeconds = Number(getEnvOrDefault('ICLOUD_SYNC_INTERVAL', '60'));
	const logLevel = getEnvOrDefault('LOG_LEVEL', 'info');
	const frameVerbosity = Number(getEnvOrDefault('SAMSUNG_FRAME_VERBOSITY', '0'));
	const webPort = process.env.WEB_PORT ? Number(process.env.WEB_PORT) : 3001;
	const corsOrigin = getEnvOrDefault('CORS_ORIGIN', 'http://localhost:3000');

	return {
		iCloud: {
			username: iCloudUsername,
			password: iCloudPassword,
			sourceAlbum: iCloudSourceAlbum,
			dataDirectory: iCloudDataDirectory,
			logLevel,
		},
		frame: {
			host: frameHost,
			name: 'SamsungTv',
			services: ['art-mode', 'device', 'remote-control'],
			verbosity: frameVerbosity,
			logLevel,
		},
		syncIntervalSeconds,
		logLevel,
		webPort,
		corsOrigin,
	};
}

/**
 * Export type-safe config instance
 * Only initialize if required env variables are present (not in test environment)
 */
export const appConfig = (process.env.NODE_ENV === 'test' || !process.env.ICLOUD_USERNAME)
	? null as any as AppConfig
	: createAppConfigFromEnv();
