/**
 * Zod Validation Schemas for Configuration
 *
 * Defines validation rules for all configuration data including
 * iCloud credentials, Frame TV connection, and sync settings.
 *
 * @module schemas/configuration
 */

import { z } from 'zod';

/**
 * iCloud Connection Configuration Schema
 */
export const ICloudConfigSchema = z.object({
	username: z.string().email('Must be a valid email address').optional(),
	password: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.optional(),
	sourceAlbum: z.string().optional(),
});

/**
 * Frame TV Connection Configuration Schema
 */
export const FrameConfigSchema = z.object({
	host: z
		.string()
		.regex(
			/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9\-.]+$/i,
			'Must be a valid IP address or hostname',
		)
		.optional(),
	port: z.number().int().min(1).max(65535).default(8002),
});

/**
 * Sync Configuration Schema
 */
export const SyncConfigSchema = z.object({
	interval: z
		.number()
		.int()
		.min(30)
		.max(3600, 'Interval must be between 30 and 3600 seconds')
		.default(60),
	enabled: z.boolean().default(false),
	deleteAfterSync: z.boolean().default(true),
	maxRetries: z
		.number()
		.int()
		.min(0)
		.max(10, 'Max retries must be between 0 and 10')
		.default(3),
});

/**
 * Complete Configuration Update Schema (flat structure)
 * Accepts flat field names for partial updates via POST /api/configuration
 */
export const ConfigurationUpdateSchema = z
	.object({
		icloudUsername: z.string().optional(),
		icloudPassword: z.string().optional(),
		frameHost: z.string().optional(),
		syncIntervalSeconds: z
			.number()
			.int()
			.min(1, 'syncIntervalSeconds must be a positive integer')
			.optional(),
		syncAlbumName: z.string().optional(),
		logLevel: z.string().optional(),
		corsOrigin: z.string().optional(),
		webPort: z.number().int().optional(),
	})
	.strict();

/**
 * Configuration Response Schema
 * Used for GET /api/configuration
 */
export const ConfigurationResponseSchema = z.object({
	icloudUsername: z.string().nullable(),
	frameHost: z.string().nullable(),
	syncIntervalSeconds: z.number(),
	syncAlbumName: z.string().nullable(),
	logLevel: z.string().nullable(),
	corsOrigin: z.string().nullable(),
	webPort: z.number().nullable(),
	hasPassword: z.boolean(),
});

/**
 * Test iCloud Connection Request Schema
 */
export const TestICloudRequestSchema = z.object({
	username: z
		.string()
		.min(1, 'Username is required')
		.email('Must be a valid email address'),
	password: z.string().min(1, 'Password is required'),
	sourceAlbum: z.string().optional(),
});

/**
 * Test Frame Connection Request Schema
 */
export const TestFrameRequestSchema = z.object({
	host: z
		.string()
		.min(1, 'Host is required')
		.regex(
			/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9\-.]+$/i,
			'Must be a valid IP address or hostname',
		),
	port: z
		.number()
		.int()
		.min(1, 'Port must be at least 1')
		.max(65535, 'Port must be at most 65535'),
});

// TypeScript types inferred from schemas
export type ICloudConfig = z.infer<typeof ICloudConfigSchema>;
export type FrameConfig = z.infer<typeof FrameConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type ConfigurationUpdate = z.infer<typeof ConfigurationUpdateSchema>;
export type ConfigurationResponse = z.infer<typeof ConfigurationResponseSchema>;
export type TestICloudRequest = z.infer<typeof TestICloudRequestSchema>;
export type TestFrameRequest = z.infer<typeof TestFrameRequestSchema>;
