/**
 * Zod Validation Middleware for Express
 *
 * Provides middleware to validate request bodies, query parameters,
 * and route parameters using Zod schemas.
 *
 * @module lib/validation
 */

import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';

import { createLogger } from '../observability/logger.js';

const logger = createLogger({ name: 'validation' });

/**
 * Validation target (which part of request to validate)
 */
export type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Validation options
 */
export interface ValidationOptions {
	/** Zod schema to validate against */
	schema: ZodSchema;
	/** Which part of request to validate */
	target?: ValidationTarget;
	/** Whether to strip unknown keys (default: false) */
	strip?: boolean;
}

/**
 * Create validation middleware for Express
 *
 * @param options - Validation configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * const schema = z.object({ name: z.string() });
 * router.post('/users', validate({ schema, target: 'body' }), handler);
 * ```
 */
export function validate(options: ValidationOptions | ZodSchema) {
	// Handle both old and new API
	const config: ValidationOptions =
		'shape' in options || '_def' in options
			? { schema: options as ZodSchema, target: 'body' }
			: (options as ValidationOptions);

	const { schema, target = 'body' } = config;

	return (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = req[target];

			// Parse and validate data (Zod v4 doesn't need passthrough for preserving keys)
			const result = schema.parse(data);

			// Replace request data with validated/parsed data
			(req as any)[target] = result;

			next();
		} catch (error) {
			if (error instanceof ZodError) {
				const zodError = error as ZodError<any>;
				logger.warn({ errors: zodError.issues, target }, 'Validation failed');

				return res.status(400).json({
					error: {
						code: 'VALIDATION_ERROR',
						message: 'Invalid request data',
						details: zodError.issues.map((err) => ({
							path: err.path.join('.'),
							message: err.message,
							code: err.code,
						})),
						timestamp: new Date().toISOString(),
					},
				});
			}

			// Unexpected error
			logger.error({ error }, 'Unexpected validation error');
			return res.status(500).json({
				error: {
					code: 'INTERNAL_ERROR',
					message: 'An unexpected error occurred during validation',
					timestamp: new Date().toISOString(),
				},
			});
		}
	};
}

/**
 * Validate request body
 *
 * @param schema - Zod schema for body validation
 * @returns Express middleware
 */
export function validateBody(schema: ZodSchema) {
	return validate({ schema, target: 'body' });
}

/**
 * Validate query parameters
 *
 * @param schema - Zod schema for query validation
 * @returns Express middleware
 */
export function validateQuery(schema: ZodSchema) {
	return validate({ schema, target: 'query' });
}

/**
 * Validate route parameters
 *
 * @param schema - Zod schema for params validation
 * @returns Express middleware
 */
export function validateParams(schema: ZodSchema) {
	return validate({ schema, target: 'params' });
}
