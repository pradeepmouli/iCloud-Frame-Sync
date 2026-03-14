/**
 * Unit tests for ConfigurationService
 *
 * Tests the database-backed configuration management including:
 * - CRUD operations
 * - Password encryption/decryption
 * - Connection testing
 */
import '../helpers/setup.js';
import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { decrypt, encrypt } from '../../src/lib/encryption.js';
import { prisma } from '../../src/lib/prisma.js';
import { ConfigurationService } from '../../src/services/ConfigurationService.js';

describe('ConfigurationService', () => {
	let service: ConfigurationService;

	beforeEach(async () => {
		service = new ConfigurationService();
		// Clean up any existing configuration
		await prisma.configuration.deleteMany({});
	});

	afterEach(async () => {
		// Clean up after each test
		await prisma.configuration.deleteMany({});
	});

	describe('getConfiguration', () => {
		it('should return default configuration when none exists', async () => {
			const config = await service.getConfiguration();

			expect(config).to.deep.include({
				icloudUsername: null,
				icloudSourceAlbum: null,
				frameHost: null,
				framePort: 8002,
				syncInterval: 60,
				syncEnabled: false,
				deleteAfterSync: true,
				maxRetries: 3,
				hasPassword: false,
			});
		});

		it('should return existing configuration with hasPassword flag', async () => {
			// Create configuration with encrypted password
			await prisma.configuration.create({
				data: {
					id: 'default',
					icloudUsername: 'test@example.com',
					icloudPassword: encrypt('secret123'),
					icloudSourceAlbum: 'Test Album',
					frameHost: '192.168.1.100',
					framePort: 8002,
					syncInterval: 120,
					syncEnabled: true,
					deleteAfterSync: false,
					maxRetries: 5,
				},
			});

			const config = await service.getConfiguration();

			expect(config).to.deep.include({
				icloudUsername: 'test@example.com',
				icloudSourceAlbum: 'Test Album',
				frameHost: '192.168.1.100',
				framePort: 8002,
				syncInterval: 120,
				syncEnabled: true,
				deleteAfterSync: false,
				maxRetries: 5,
				hasPassword: true,
			});

			// Ensure password is never returned
			expect(config).to.not.have.property('icloudPassword');
		});

		it('should never expose raw password in response', async () => {
			await prisma.configuration.create({
				data: {
					id: 'default',
					icloudPassword: encrypt('my-secret-password'),
					frameHost: 'localhost',
					framePort: 8002,
					syncInterval: 60,
					syncEnabled: false,
					deleteAfterSync: true,
					maxRetries: 3,
				},
			});

			const config = await service.getConfiguration();

			expect(config.hasPassword).to.equal(true);
			expect(config).to.not.have.property('icloudPassword');
		});
	});

	describe('updateConfiguration', () => {
		it('should create new configuration if none exists', async () => {
			const updates = {
				icloudUsername: 'user@example.com',
				icloudPassword: 'securepass',
				frameHost: '192.168.1.50',
				syncInterval: 180,
			};

			const result = await service.updateConfiguration(updates);

			expect(result).to.deep.include({
				icloudUsername: 'user@example.com',
				frameHost: '192.168.1.50',
				syncInterval: 180,
				hasPassword: true,
			});
			expect(result).to.not.have.property('icloudPassword');

			// Verify password is encrypted in DB
			const dbConfig = await prisma.configuration.findUnique({
				where: { id: 'default' },
			});

			expect(dbConfig?.icloudPassword).to.not.equal('securepass');
			expect(dbConfig?.icloudPassword).to.exist;
			expect(decrypt(dbConfig!.icloudPassword!)).to.equal('securepass');
		});

		it('should perform partial updates', async () => {
			// Create initial config
			await prisma.configuration.create({
				data: {
					id: 'default',
					icloudUsername: 'initial@example.com',
					frameHost: 'initial-host',
					framePort: 8002,
					syncInterval: 60,
					syncEnabled: false,
					deleteAfterSync: true,
					maxRetries: 3,
				},
			});

			// Partial update - only change username
			const result = await service.updateConfiguration({
				icloudUsername: 'updated@example.com',
			});

			expect(result.icloudUsername).to.equal('updated@example.com');
			expect(result.frameHost).to.equal('initial-host'); // Unchanged
		});

		it('should encrypt new password when updating', async () => {
			await prisma.configuration.create({
				data: {
					id: 'default',
					icloudUsername: 'user@example.com',
					frameHost: 'localhost',
					framePort: 8002,
					syncInterval: 60,
					syncEnabled: false,
					deleteAfterSync: true,
					maxRetries: 3,
				},
			});

			const result = await service.updateConfiguration({
				icloudPassword: 'new-password',
			});

			expect(result.hasPassword).to.equal(true);

			// Verify encryption
			const dbConfig = await prisma.configuration.findUnique({
				where: { id: 'default' },
			});

			expect(dbConfig?.icloudPassword).to.not.equal('new-password');
			expect(decrypt(dbConfig!.icloudPassword!)).to.equal('new-password');
		});

		it('should handle password updates correctly', async () => {
			// Create config with password
			await prisma.configuration.create({
				data: {
					id: 'default',
					icloudUsername: 'user@example.com',
					icloudPassword: encrypt('old-password'),
					frameHost: 'localhost',
					framePort: 8002,
					syncInterval: 60,
					syncEnabled: false,
					deleteAfterSync: true,
					maxRetries: 3,
				},
			});

			// Update password
			const result = await service.updateConfiguration({
				icloudPassword: 'new-password',
			});

			expect(result.hasPassword).to.equal(true);

			const dbConfig = await prisma.configuration.findUnique({
				where: { id: 'default' },
			});

			expect(decrypt(dbConfig!.icloudPassword!)).to.equal('new-password');
		});

		it('should clear password when explicitly set to null', async () => {
			await prisma.configuration.create({
				data: {
					id: 'default',
					icloudPassword: encrypt('existing-password'),
					frameHost: 'localhost',
					framePort: 8002,
					syncInterval: 60,
					syncEnabled: false,
					deleteAfterSync: true,
					maxRetries: 3,
				},
			});

			const result = await service.updateConfiguration({
				icloudPassword: null,
			});

			expect(result.hasPassword).to.equal(false);

			const dbConfig = await prisma.configuration.findUnique({
				where: { id: 'default' },
			});

			expect(dbConfig?.icloudPassword).to.be.null;
		});
	});

	describe('testICloudConnection', () => {
		it('should validate iCloud credentials format', async () => {
			const result = await service.testICloudConnection('invalid-email', 'password123');

			expect(result.success).to.equal(false);
			expect(result.message).to.include('Invalid email format');
		});

		it('should require both username and password', async () => {
			const result1 = await service.testICloudConnection('user@example.com', '');

			expect(result1.success).to.equal(false);
			expect(result1.message).to.include('Username and password are required');

			const result2 = await service.testICloudConnection('', 'password123');

			expect(result2.success).to.equal(false);
			expect(result2.message).to.include('Username and password are required');
		});

		it('should return placeholder success for valid input', async () => {
			const result = await service.testICloudConnection('user@example.com', 'password123');

			expect(result.success).to.equal(true);
			expect(result.message).to.include('not yet implemented');
		});
	});

	describe('testFrameConnection', () => {
		it('should require host parameter', async () => {
			const result = await service.testFrameConnection('', 8002);

			expect(result.success).to.equal(false);
			expect(result.message).to.include('required');
		});

		it('should validate port range', async () => {
			const result1 = await service.testFrameConnection('192.168.1.100', 0);

			expect(result1.success).to.equal(false);
			expect(result1.message).to.include('Port must be between 1 and 65535');

			const result2 = await service.testFrameConnection('192.168.1.100', 70000);

			expect(result2.success).to.equal(false);
			expect(result2.message).to.include('Port must be between 1 and 65535');
		});

		it('should return placeholder success for valid input', async () => {
			const result = await service.testFrameConnection('192.168.1.100', 8002);

			expect(result.success).to.equal(true);
			expect(result.message).to.include('not yet implemented');
		});
	});

	describe('getDecryptedPassword', () => {
		it('should return null when no password exists', async () => {
			const password = await service.getDecryptedPassword();
			expect(password).to.equal(null);
		});

		it('should decrypt stored password', async () => {
			const testPassword = 'my-secret-password';

			await prisma.configuration.create({
				data: {
					id: 'default',
					icloudPassword: encrypt(testPassword),
					frameHost: 'localhost',
					framePort: 8002,
					syncInterval: 60,
					syncEnabled: false,
					deleteAfterSync: true,
					maxRetries: 3,
				},
			});

			const password = await service.getDecryptedPassword();
			expect(password).to.equal(testPassword);
		});
	});
});
