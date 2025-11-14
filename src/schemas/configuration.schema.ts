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
	password: z.string().min(8, 'Password must be at least 8 characters').optional(),
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
			'Must be a valid IP address or hostname'
		)
		.optional(),
	port: z.number().int().min(1).max(65535).default(8002),
});

/**
 * Sync Configuration Schema
 */
export const SyncConfigSchema = z.object({
	interval: z.number().int().min(30).max(3600, 'Interval must be between 30 and 3600 seconds').default(60),
	enabled: z.boolean().default(false),
	deleteAfterSync: z.boolean().default(true),
	maxRetries: z.number().int().min(0).max(10, 'Max retries must be between 0 and 10').default(3),
});

/**
 * Complete Configuration Update Schema
 * All fields are optional for partial updates
 */
export const ConfigurationUpdateSchema = z.object({
	icloud: ICloudConfigSchema.optional(),
	frame: FrameConfigSchema.optional(),
	sync: SyncConfigSchema.optional(),
});

/**
 * Configuration Response Schema
 * Used for GET /api/configuration
 */
export const ConfigurationResponseSchema = z.object({
	icloud: z.object({
		username: z.string().nullable(),
		hasPassword: z.boolean(),
		sourceAlbum: z.string().nullable(),
		hasActiveSession: z.boolean(),
		connectionStatus: z.enum(['unknown', 'connected', 'disconnected', 'error']),
	}),
	frame: z.object({
		host: z.string().nullable(),
		port: z.number(),
		connectionStatus: z.enum(['unknown', 'connected', 'disconnected', 'error']),
	}),
	sync: z.object({
		interval: z.number(),
		enabled: z.boolean(),
		deleteAfterSync: z.boolean(),
		maxRetries: z.number(),
	}),
});

/**
 * Test iCloud Connection Request Schema
 */
export const TestICloudRequestSchema = z.object({
	username: z.string().email('Must be a valid email address'),
	password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Test Frame Connection Request Schema
 */
export const TestFrameRequestSchema = z.object({
	host: z
		.string()
		.regex(
			/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9\-.]+$/i,
			'Must be a valid IP address or hostname'
		),
	port: z.number().int().min(1).max(65535),
});

// TypeScript types inferred from schemas
export type ICloudConfig = z.infer<typeof ICloudConfigSchema>;
export type FrameConfig = z.infer<typeof FrameConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type ConfigurationUpdate = z.infer<typeof ConfigurationUpdateSchema>;
export type ConfigurationResponse = z.infer<typeof ConfigurationResponseSchema>;
export type TestICloudRequest = z.infer<typeof TestICloudRequestSchema>;
export type TestFrameRequest = z.infer<typeof TestFrameRequestSchema>;
