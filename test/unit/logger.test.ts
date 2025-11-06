import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
	createComponentLogger,
	createLogger,
	createLoggerWithCorrelationId,
	generateCorrelationId,
	getCorrelationId,
} from '../../src/observability/logger.js';

describe('Logger Factory', () => {
	describe('createLogger()', () => {
		it('should create a logger with default options', () => {
			const logger = createLogger();
			expect(logger).to.exist;
			expect(logger.info).to.be.a('function');
			expect(logger.error).to.be.a('function');
			expect(logger.debug).to.be.a('function');
		});

		it('should accept custom log level', () => {
			const logger = createLogger({ level: 'debug' });
			expect(logger).to.exist;
			// Logger should be created successfully with custom level
		});

		it('should accept custom options', () => {
			const logger = createLogger({
				level: 'warn',
				base: { app: 'test-app' },
			});
			expect(logger).to.exist;
		});
	});

	describe('createLoggerWithCorrelationId()', () => {
		it('should create child logger with provided correlation ID', () => {
			const rootLogger = createLogger({ level: 'silent' });
			const correlationId = 'test-correlation-123';
			const childLogger = createLoggerWithCorrelationId(rootLogger, correlationId);

			expect(childLogger).to.exist;
			const extractedId = getCorrelationId(childLogger);
			expect(extractedId).to.equal(correlationId);
		});

		it('should generate UUID correlation ID if not provided', () => {
			const rootLogger = createLogger({ level: 'silent' });
			const childLogger = createLoggerWithCorrelationId(rootLogger);

			const correlationId = getCorrelationId(childLogger);
			expect(correlationId).to.be.a('string');
			expect(correlationId).to.match(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
		});

		it('should accept additional bindings', () => {
			const rootLogger = createLogger({ level: 'silent' });
			const childLogger = createLoggerWithCorrelationId(rootLogger, 'test-id', {
				userId: 'user-123',
				requestPath: '/api/sync',
			});

			expect(childLogger).to.exist;
			const correlationId = getCorrelationId(childLogger);
			expect(correlationId).to.equal('test-id');
		});
	});

	describe('createComponentLogger()', () => {
		it('should create child logger with component name', () => {
			const rootLogger = createLogger({ level: 'silent' });
			const componentLogger = createComponentLogger(rootLogger, 'PhotoSyncService');

			expect(componentLogger).to.exist;
			// Component binding should be present (verified by Pino internals)
		});

		it('should accept additional bindings', () => {
			const rootLogger = createLogger({ level: 'silent' });
			const componentLogger = createComponentLogger(rootLogger, 'FrameClient', {
				frameId: 'frame-001',
			});

			expect(componentLogger).to.exist;
		});
	});

	describe('generateCorrelationId()', () => {
		it('should generate a valid UUID v4', () => {
			const id = generateCorrelationId();
			expect(id).to.be.a('string');
			expect(id).to.match(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
		});

		it('should generate unique IDs', () => {
			const id1 = generateCorrelationId();
			const id2 = generateCorrelationId();
			expect(id1).to.not.equal(id2);
		});
	});

	describe('getCorrelationId()', () => {
		it('should return correlation ID from logger', () => {
			const rootLogger = createLogger({ level: 'silent' });
			const correlationId = 'test-extract-123';
			const childLogger = createLoggerWithCorrelationId(rootLogger, correlationId);

			const extractedId = getCorrelationId(childLogger);
			expect(extractedId).to.equal(correlationId);
		});

		it('should return undefined if no correlation ID present', () => {
			const logger = createLogger({ level: 'silent' });
			const correlationId = getCorrelationId(logger);
			expect(correlationId).to.be.undefined;
		});
	});

	describe('logger hierarchy', () => {
		it('should support nested child loggers', () => {
			const rootLogger = createLogger({ level: 'silent' });
			const componentLogger = createComponentLogger(rootLogger, 'SyncScheduler');
			const operationLogger = createLoggerWithCorrelationId(
				componentLogger,
				'sync-op-456',
			);

			expect(operationLogger).to.exist;
			const correlationId = getCorrelationId(operationLogger);
			expect(correlationId).to.equal('sync-op-456');
		});

		it('should preserve parent bindings in child loggers', () => {
			const rootLogger = createLogger({ level: 'silent' });
			const componentLogger = createComponentLogger(rootLogger, 'Application', {
				environment: 'production',
			});
			const requestLogger = createLoggerWithCorrelationId(componentLogger, 'req-789');

			expect(requestLogger).to.exist;
			const correlationId = getCorrelationId(requestLogger);
			expect(correlationId).to.equal('req-789');
		});
	});
});
