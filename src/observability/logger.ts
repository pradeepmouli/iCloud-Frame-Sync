import { randomUUID } from 'node:crypto';
import { pino, type Logger, type LoggerOptions } from 'pino';

/**
 * Default Pino logger options with sensible defaults.
 * Can be overridden when creating loggers.
 */
const DEFAULT_LOGGER_OPTIONS: LoggerOptions = {
	level: 'info',
	transport:
		process.env['NODE_ENV'] !== 'production'
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
	return pino({
		...DEFAULT_LOGGER_OPTIONS,
		...options,
	});
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
	const bindings = (logger as unknown as { bindings?: () => Record<string, unknown>; }).bindings?.();
	return bindings?.['correlationId'] as string | undefined;
}
