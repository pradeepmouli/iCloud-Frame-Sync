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
