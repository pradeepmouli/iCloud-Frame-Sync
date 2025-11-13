/**
 * Prisma Client Singleton
 *
 * Provides a single instance of PrismaClient across the application
 * with proper logging and graceful shutdown handling.
 *
 * @module lib/prisma
 */

import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const logger = pino({ name: 'prisma' });

// Global augmentation for PrismaClient instance
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

/**
 * Singleton Prisma Client instance
 *
 * In development, uses the global object to prevent multiple instances
 * during hot reloads. In production, creates a new instance.
 */
export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		log:
			process.env.NODE_ENV === 'development'
				? [
						{ level: 'query', emit: 'event' },
						{ level: 'error', emit: 'stdout' },
						{ level: 'warn', emit: 'stdout' },
					]
				: [{ level: 'error', emit: 'stdout' }],
		datasources: {
			db: {
				url: process.env.DATABASE_URL || 'file:./data/sync.db',
			},
		},
	});

// Log queries in development
if (process.env.NODE_ENV === 'development') {
	prisma.$on('query' as never, (e: unknown) => {
		const event = e as { query: string; duration: number };
		logger.debug({ query: event.query, duration: event.duration }, 'Prisma query');
	});
}

// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}

// Graceful shutdown handler
const shutdown = async () => {
	logger.info('Disconnecting Prisma client...');
	await prisma.$disconnect();
	logger.info('Prisma client disconnected');
};

process.on('beforeExit', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * Test database connection
 *
 * @returns Promise that resolves when connection is successful
 * @throws Error if connection fails
 */
export async function testConnection(): Promise<void> {
	try {
		await prisma.$connect();
		logger.info('Prisma database connection successful');
	} catch (error) {
		logger.error({ error }, 'Failed to connect to database');
		throw error;
	}
}

/**
 * Execute a function within a Prisma transaction
 *
 * @param fn Function to execute within transaction
 * @returns Promise resolving to function result
 */
export async function withTransaction<T>(
	fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>) => Promise<T>
): Promise<T> {
	return prisma.$transaction(fn);
}

/**
 * Execute a function within a Prisma transaction with retry logic
 *
 * Automatically retries the transaction up to maxRetries times if it fails
 * due to transient errors (e.g., database locks, temporary unavailability).
 *
 * @param fn Function to execute within transaction
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @param retryDelay Delay in milliseconds between retries (default: 100ms)
 * @returns Promise resolving to function result
 * @throws Error if all retry attempts fail
 */
export async function withTransactionRetry<T>(
	fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>) => Promise<T>,
	maxRetries: number = 3,
	retryDelay: number = 100
): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await prisma.$transaction(fn);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			
			// Don't retry on the last attempt
			if (attempt === maxRetries) {
				break;
			}

			// Check if error is retryable (database locks, deadlocks, etc.)
			const errorMessage = lastError.message.toLowerCase();
			const isRetryable = 
				errorMessage.includes('lock') ||
				errorMessage.includes('deadlock') ||
				errorMessage.includes('busy') ||
				errorMessage.includes('timeout');

			if (!isRetryable) {
				// Not a transient error, don't retry
				throw lastError;
			}

			logger.warn(
				{ attempt: attempt + 1, maxRetries, error: lastError.message },
				'Transaction failed, retrying...'
			);

			// Wait before retrying (exponential backoff)
			await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
		}
	}

	logger.error({ attempts: maxRetries + 1, error: lastError }, 'Transaction failed after all retries');
	throw lastError;
}

/**
 * Execute multiple operations atomically within a single transaction
 *
 * @param operations Array of functions to execute within the same transaction
 * @returns Promise resolving to array of results
 */
export async function withAtomicOperations<T extends unknown[]>(
	...operations: Array<(tx: any) => Promise<unknown>>
): Promise<T> {
	return prisma.$transaction(async (tx) => {
		const results: unknown[] = [];
		for (const operation of operations) {
			const result = await operation(tx);
			results.push(result);
		}
		return results as T;
	});
}

/**
 * Execute a function with optimistic locking
 *
 * Reads a record, executes the update function, and writes back only if
 * the record hasn't been modified since it was read (version-based optimistic locking).
 *
 * @param model Prisma model name
 * @param id Record ID
 * @param updateFn Function to update the record
 * @param maxRetries Maximum number of retry attempts on version conflicts
 * @returns Promise resolving to updated record
 * @throws Error if version conflict persists after all retries
 */
export async function withOptimisticLock<T extends { id: string; version?: number }>(
	model: keyof PrismaClient,
	id: string,
	updateFn: (record: T) => Partial<T>,
	maxRetries: number = 3
): Promise<T> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		// Read current version
		const current = await (prisma[model] as any).findUnique({
			where: { id },
		}) as T | null;

		if (!current) {
			throw new Error(`Record not found: ${String(model)} with id ${id}`);
		}

		const currentVersion = current.version ?? 0;
		const updates = updateFn(current);

		try {
			// Attempt update with version check
			const updated = await (prisma[model] as any).update({
				where: {
					id,
					...(currentVersion !== undefined ? { version: currentVersion } : {}),
				},
				data: {
					...updates,
					version: currentVersion + 1,
				},
			}) as T;

			return updated;
		} catch (err) {
			if (attempt === maxRetries) {
				const error = err instanceof Error ? err : new Error(String(err));
				throw new Error(
					`Optimistic lock conflict after ${maxRetries + 1} attempts for ${String(model)} ${id}: ${error.message}`
				);
			}

			logger.warn(
				{ attempt: attempt + 1, maxRetries, model, id },
				'Optimistic lock conflict, retrying...'
			);

			// Brief delay before retry
			await new Promise(resolve => setTimeout(resolve, 50));
		}
	}

	throw new Error('Unreachable');
}
