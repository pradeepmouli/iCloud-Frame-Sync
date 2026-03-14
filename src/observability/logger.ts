import { randomUUID } from 'node:crypto';
import { pino, type Logger, type LoggerOptions } from 'pino';

/**
 * Standard structured log fields for consistency across the application.
 * These types ensure proper typing and discoverability of common log fields.
 */
export interface LogContext {
	/** Correlation ID for tracing operations across async boundaries */
	correlationId?: string;
	/** Component/service name generating the log */
	component?: string;
	/** User ID or identifier (if applicable) */
	userId?: string;
	/** Request ID for HTTP requests */
	requestId?: string;
	/** Session ID for user sessions */
	sessionId?: string;
	/** Operation name or identifier */
	operation?: string;
	/** Duration of operation in milliseconds */
	durationMs?: number;
	/** Error object or message */
	error?: Error | string | unknown;
	/** Additional metadata specific to the operation */
	metadata?: Record<string, unknown>;
}

/**
 * Service-specific log contexts for common operations.
 */
export interface PhotoSyncLogContext extends LogContext {
	photoId?: string;
	albumId?: string;
	filename?: string;
	sizeBytes?: number;
	checksum?: string;
	retryCount?: number;
	maxRetries?: number;
}

export interface FrameLogContext extends LogContext {
	host?: string;
	isReachable?: boolean;
	isOn?: boolean;
	inArtMode?: boolean;
	responseTimeMs?: number;
	artId?: string;
	deviceModel?: string;
}

export interface iCloudLogContext extends LogContext {
	username?: string;
	albumName?: string;
	photoCount?: number;
	requiresMfa?: boolean;
	sessionExpiry?: number;
}

export interface SchedulerLogContext extends LogContext {
	intervalMs?: number;
	isPaused?: boolean;
	consecutiveFailures?: number;
	nextRunAt?: Date;
}

/**
 * Log severity levels and their recommended usage
 */
export const LogLevels = {
	/** Fatal errors that require immediate attention and may crash the application */
	FATAL: 'fatal',
	/** Errors that prevent an operation from completing but don't crash the application */
	ERROR: 'error',
	/** Warning conditions that should be reviewed but don't prevent operation */
	WARN: 'warn',
	/** Informational messages about normal application flow */
	INFO: 'info',
	/** Detailed information useful for debugging */
	DEBUG: 'debug',
	/** Very detailed diagnostic information */
	TRACE: 'trace',
} as const;

/**
 * Default Pino logger options with sensible defaults.
 * Can be overridden when creating loggers.
 */
const DEFAULT_LOGGER_OPTIONS: LoggerOptions = {
	level: 'info',
	transport:
		process.env['NODE_ENV'] !== 'production' &&
		process.env['NODE_ENV'] !== 'test'
			? {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'HH:MM:ss',
						ignore: 'pid,hostname',
					},
				}
			: undefined,
};

/**
 * Creates a root Pino logger instance with optional configuration.
 *
 * @param options - Optional Pino logger configuration (merged with defaults)
 * @returns Configured Pino logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger({ level: 'debug' });
 * logger.info('Application started');
 * ```
 */
export function createLogger(options?: LoggerOptions): Logger {
	const isTestEnv = process.env['NODE_ENV'] === 'test';
	const exitSnapshot = isTestEnv
		? new Set(process.listeners('exit'))
		: undefined;
	const beforeExitSnapshot = isTestEnv
		? new Set(process.listeners('beforeExit'))
		: undefined;

	const logger = pino({
		...DEFAULT_LOGGER_OPTIONS,
		...options,
	});

	if (isTestEnv) {
		for (const listener of process.listeners('exit')) {
			if (!exitSnapshot?.has(listener)) {
				process.removeListener('exit', listener);
			}
		}
		for (const listener of process.listeners('beforeExit')) {
			if (!beforeExitSnapshot?.has(listener)) {
				process.removeListener('beforeExit', listener);
			}
		}
	}

	return logger;
}

/**
 * Creates a child logger with a correlation ID for request/operation tracking.
 * Correlation IDs help trace logs across async operations and service boundaries.
 *
 * @param parentLogger - The parent logger to create a child from
 * @param correlationId - Optional correlation ID (generates UUID if not provided)
 * @param additionalBindings - Optional additional context to bind to the logger
 * @returns Child logger with correlation ID attached
 *
 * @example
 * ```typescript
 * const rootLogger = createLogger();
 * const requestLogger = createLoggerWithCorrelationId(rootLogger, 'req-123');
 * requestLogger.info('Processing request'); // Logs include correlationId: 'req-123'
 * ```
 */
export function createLoggerWithCorrelationId(
	parentLogger: Logger,
	correlationId?: string,
	additionalBindings?: Record<string, unknown>,
): Logger {
	const id = correlationId ?? randomUUID();
	return parentLogger.child({
		correlationId: id,
		...additionalBindings,
	});
}

/**
 * Creates a child logger with a specific component name for better log filtering.
 *
 * @param parentLogger - The parent logger to create a child from
 * @param componentName - Name of the component/service (e.g., 'PhotoSync', 'FrameClient')
 * @param additionalBindings - Optional additional context to bind to the logger
 * @returns Child logger with component name attached
 *
 * @example
 * ```typescript
 * const rootLogger = createLogger();
 * const syncLogger = createComponentLogger(rootLogger, 'PhotoSyncService');
 * syncLogger.info('Starting sync'); // Logs include component: 'PhotoSyncService'
 * ```
 */
export function createComponentLogger(
	parentLogger: Logger,
	componentName: string,
	additionalBindings?: Record<string, unknown>,
): Logger {
	return parentLogger.child({
		component: componentName,
		...additionalBindings,
	});
}

/**
 * Generates a new correlation ID (UUID v4).
 * Useful for creating correlation IDs before logger creation or for external tracking.
 *
 * @returns A new UUID v4 string
 *
 * @example
 * ```typescript
 * const correlationId = generateCorrelationId();
 * const logger = createLoggerWithCorrelationId(rootLogger, correlationId);
 * // Pass correlationId to external services or store in request context
 * ```
 */
export function generateCorrelationId(): string {
	return randomUUID();
}

/**
 * Extracts the correlation ID from a logger if present.
 * Returns undefined if no correlation ID is attached.
 *
 * @param logger - The logger to extract correlation ID from
 * @returns The correlation ID or undefined
 *
 * @example
 * ```typescript
 * const logger = createLoggerWithCorrelationId(rootLogger);
 * const id = getCorrelationId(logger);
 * console.log(id); // UUID string
 * ```
 */
export function getCorrelationId(logger: Logger): string | undefined {
	// Access bindings through logger's internal structure
	// Pino stores bindings in the logger instance
	const bindings = (
		logger as unknown as { bindings?: () => Record<string, unknown> }
	).bindings?.();
	return bindings?.['correlationId'] as string | undefined;
}

/**
 * Creates a performance-tracking logger that measures operation duration.
 * Returns a function to call when the operation completes, which will log the duration.
 *
 * @param logger - The logger to use for recording metrics
 * @param operation - Name of the operation being measured
 * @param context - Additional context to include in logs
 * @returns Completion function to call when operation finishes
 *
 * @example
 * ```typescript
 * const complete = logPerformance(logger, 'uploadPhoto', { photoId: '123' });
 * await doExpensiveOperation();
 * complete(); // Logs: "Operation completed" with durationMs
 * ```
 */
export function logPerformance(
	logger: Logger,
	operation: string,
	context?: LogContext,
	// eslint-disable-next-line no-unused-vars
): (additionalContext?: LogContext) => void {
	const startTime = Date.now();
	logger.debug({ operation, ...context }, `Starting operation: ${operation}`);

	return (additionalContext?: LogContext) => {
		const durationMs = Date.now() - startTime;
		logger.info(
			{ operation, durationMs, ...context, ...additionalContext },
			`Operation completed: ${operation}`,
		);
	};
}

/**
 * Creates a scoped logger for tracking a specific operation with automatic correlation ID.
 * Useful for tracing operations across async boundaries.
 *
 * @param parentLogger - The parent logger to create a child from
 * @param operation - Name of the operation
 * @param context - Additional context to bind to the logger
 * @returns Scoped logger with operation context
 *
 * @example
 * ```typescript
 * const opLogger = createOperationLogger(rootLogger, 'syncPhotos', { albumId: 'abc' });
 * opLogger.info('Starting sync');
 * // Logs include: operation: 'syncPhotos', albumId: 'abc', correlationId: <uuid>
 * ```
 */
export function createOperationLogger(
	parentLogger: Logger,
	operation: string,
	context?: LogContext,
): Logger {
	const correlationId = context?.correlationId ?? generateCorrelationId();
	return parentLogger.child({
		operation,
		correlationId,
		...context,
	});
}

/**
 * Wraps an async function with automatic error logging and performance tracking.
 * Returns a new function that logs start/completion/errors automatically.
 *
 * @param logger - The logger to use for tracking
 * @param operation - Name of the operation
 * @param fn - The async function to wrap
 * @returns Wrapped function with automatic logging
 *
 * @example
 * ```typescript
 * const syncWithLogging = withLogging(logger, 'syncPhotos', async (albumId) => {
 *   // Your sync logic here
 * });
 * await syncWithLogging('album-123'); // Automatically logs start, completion, and errors
 * ```
 */
export function withLogging<T extends unknown[], R>(
	logger: Logger,
	operation: string,
	// eslint-disable-next-line no-unused-vars
	fn: (...args: T) => Promise<R>,
	// eslint-disable-next-line no-unused-vars
): (...args: T) => Promise<R> {
	return async (...args: T): Promise<R> => {
		const complete = logPerformance(logger, operation);
		try {
			const result = await fn(...args);
			complete();
			return result;
		} catch (error: unknown) {
			logger.error({ operation, error }, `Operation failed: ${operation}`);
			throw error;
		}
	};
}
