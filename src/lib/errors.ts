/**
 * Shared error utilities
 *
 * @module lib/errors
 */

/**
 * Extract a human-readable message from an unknown error value.
 * Handles Error instances, plain strings, and falls back to a default message.
 */
export function resolveErrorMessage(
	error: unknown,
	fallback = 'An unexpected error occurred.',
): string {
	if (error instanceof Error && typeof error.message === 'string') {
		return error.message;
	}
	if (typeof error === 'string' && error.trim().length > 0) {
		return error.trim();
	}
	return fallback;
}

/**
 * Error thrown when iCloud authentication requires multi-factor authentication.
 * Used by both ConnectionTesterService and the web server's inline auth flow.
 */
export class MfaRequiredError extends Error {
	public readonly sessionId: string;

	constructor(sessionId: string) {
		super('MFA_REQUIRED');
		this.sessionId = sessionId;
	}
}

/**
 * Safely close an endpoint, swallowing any errors that occur during close.
 */
export async function safeClose(endpoint: {
	close: () => Promise<void>;
}): Promise<void> {
	try {
		await endpoint.close();
	} catch {
		// Swallow close errors to avoid masking original issues.
	}
}
