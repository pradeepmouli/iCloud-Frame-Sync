/**
 * AES-256-GCM Encryption Utilities
 *
 * Provides secure encryption/decryption for sensitive credentials
 * using AES-256-GCM with authenticated encryption.
 *
 * @module lib/encryption
 */

import crypto from 'node:crypto';

import { createLogger } from '../observability/logger.js';

const logger = createLogger({ name: 'encryption' });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const KEY_LENGTH = 32; // 256 bits for AES-256

/**
 * Get or generate encryption key from environment
 *
 * @returns Encryption key buffer
 * @throws Error if ENCRYPTION_KEY is not set
 */
function getEncryptionKey(): Buffer {
	const envKey = process.env.ENCRYPTION_KEY;

	if (!envKey) {
		throw new Error('ENCRYPTION_KEY environment variable is required');
	}

	// Derive a proper 32-byte key from the environment variable
	return crypto.scryptSync(envKey, 'icloud-frame-sync-salt', KEY_LENGTH);
}

/**
 * Generate a random encryption key (for initial setup)
 *
 * @returns Hex-encoded 32-byte key
 */
export function generateKey(): string {
	return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Encrypt a string value using AES-256-GCM
 *
 * @param plaintext - Value to encrypt
 * @returns Encrypted value in format: iv:authTag:encryptedData (all hex-encoded)
 * @throws Error if encryption fails
 */
export function encrypt(plaintext: string): string {
	try {
		const key = getEncryptionKey();
		const iv = crypto.randomBytes(IV_LENGTH);
		const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

		let encrypted = cipher.update(plaintext, 'utf8', 'hex');
		encrypted += cipher.final('hex');

		const authTag = cipher.getAuthTag();

		// Format: iv:authTag:encryptedData
		return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
	} catch (error) {
		logger.error({ error }, 'Encryption failed');
		throw new Error('Failed to encrypt data');
	}
}

/**
 * Decrypt an encrypted string value
 *
 * @param ciphertext - Encrypted value in format: iv:authTag:encryptedData
 * @returns Decrypted plaintext value
 * @throws Error if decryption fails or format is invalid
 */
export function decrypt(ciphertext: string): string {
	try {
		const parts = ciphertext.split(':');

		if (parts.length !== 3) {
			throw new Error('Invalid encrypted data format');
		}

		const [ivHex, authTagHex, encryptedHex] = parts;

		if (!ivHex || !authTagHex || !encryptedHex) {
			throw new Error('Invalid encrypted data format');
		}

		const key = getEncryptionKey();
		const iv = Buffer.from(ivHex!, 'hex');
		const authTag = Buffer.from(authTagHex!, 'hex');
		const encrypted = Buffer.from(encryptedHex!, 'hex');

		const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encrypted, undefined, 'utf8');
		decrypted += decipher.final('utf8');

		return decrypted;
	} catch (error) {
		logger.error({ error }, 'Decryption failed');
		throw new Error('Failed to decrypt data');
	}
}

/**
 * Check if a value appears to be encrypted
 *
 * @param value - Value to check
 * @returns True if value matches encrypted format
 */
export function isEncrypted(value: string): boolean {
	const parts = value.split(':');
	if (parts.length !== 3) return false;

	// Check if all parts are valid hex
	return parts.every((part) => /^[a-f0-9]+$/i.test(part));
}

/**
 * Safely encrypt a value only if not already encrypted
 *
 * @param value - Value to encrypt
 * @returns Encrypted value or original if already encrypted
 */
export function encryptIfNeeded(value: string): string {
	if (isEncrypted(value)) {
		return value;
	}
	return encrypt(value);
}

/**
 * Hash a value using SHA-256 (for checksums, not encryption)
 *
 * @param value - Value to hash
 * @returns Hex-encoded hash
 */
export function hash(value: string | Buffer): string {
	const hasher = crypto.createHash('sha256');
	hasher.update(value);
	return hasher.digest('hex');
}
