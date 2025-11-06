import { render, screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../services/api';
import Authentication from '../Authentication';

vi.mock('../../services/api', () => ({
	api: {
		authenticateICloud: vi.fn(),
		submitMfaCode: vi.fn(),
	},
}));

type MockedApi = {
	authenticateICloud: ReturnType<typeof vi.fn>;
	submitMfaCode: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

describe('Authentication page', () => {
	beforeEach(() => {
		mockedApi.authenticateICloud.mockResolvedValue({
			success: true,
			status: 'Authenticated',
			userInfo: { fullName: 'Test User', appleId: 'user@example.com' },
		});
		mockedApi.submitMfaCode.mockResolvedValue({
			success: true,
			status: 'Authenticated',
			userInfo: { fullName: 'Test User', appleId: 'user@example.com' },
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('authenticates successfully when credentials are provided', async () => {
		const user = userEvent.setup();
		render(<Authentication />);

		const signInButton = screen.getByRole('button', { name: /sign in to icloud/i });
		expect(signInButton).toBeDisabled();

		await user.type(screen.getByLabelText(/apple id/i), 'user@example.com');
		await user.type(screen.getByLabelText(/^password/i), 'super-secret');

		expect(signInButton).toBeEnabled();
		await user.click(signInButton);

		await waitFor(() => {
			expect(mockedApi.authenticateICloud).toHaveBeenCalledWith({
				username: 'user@example.com',
				password: 'super-secret',
			});
		});

		expect(await screen.findByText(/successfully authenticated/i)).toBeInTheDocument();
		expect(screen.getByText(/authentication successful/i)).toBeInTheDocument();
	});

	it('shows error alert when authentication fails', async () => {
		const user = userEvent.setup();
		mockedApi.authenticateICloud.mockResolvedValueOnce({
			success: false,
			error: 'Invalid credentials',
		});

		render(<Authentication />);

		await user.type(screen.getByLabelText(/apple id/i), 'user@example.com');
		await user.type(screen.getByLabelText(/^password/i), 'bad-password');
		await user.click(screen.getByRole('button', { name: /sign in to icloud/i }));

		expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
	});

	it('handles MFA challenge and completes authentication after successful code entry', async () => {
		const user = userEvent.setup();
		mockedApi.authenticateICloud.mockResolvedValueOnce({
			success: false,
			requiresMfa: true,
			sessionId: 'session-123',
		});
		mockedApi.submitMfaCode.mockResolvedValueOnce({
			success: true,
			status: 'Authenticated',
			userInfo: { fullName: 'MFA User', appleId: 'user@example.com' },
		});

		render(<Authentication />);

		await user.type(screen.getByLabelText(/apple id/i), 'user@example.com');
		await user.type(screen.getByLabelText(/^password/i), 'super-secret');
		await user.click(screen.getByRole('button', { name: /sign in to icloud/i }));

		expect(await screen.findByText(/two-factor authentication required/i)).toBeInTheDocument();
		const mfaDialog = await screen.findByRole('dialog', { name: /two-factor authentication/i });

		await user.type(within(mfaDialog).getByLabelText(/verification code/i), '123456');
		await user.click(within(mfaDialog).getByRole('button', { name: /verify/i }));

		await waitFor(() => {
			expect(mockedApi.submitMfaCode).toHaveBeenCalledWith({
				sessionId: 'session-123',
				code: '123456',
			});
		});

		expect(await screen.findByText(/successfully authenticated/i)).toBeInTheDocument();
		await waitForElementToBeRemoved(() => screen.getByRole('dialog', { name: /two-factor authentication/i }));
	});

	it('shows error inside MFA dialog when code submission fails', async () => {
		const user = userEvent.setup();
		mockedApi.authenticateICloud.mockResolvedValueOnce({
			success: false,
			requiresMfa: true,
			sessionId: 'session-456',
		});
		mockedApi.submitMfaCode.mockRejectedValueOnce(new Error('Code rejected'));

		render(<Authentication />);

		await user.type(screen.getByLabelText(/apple id/i), 'user@example.com');
		await user.type(screen.getByLabelText(/^password/i), 'super-secret');
		await user.click(screen.getByRole('button', { name: /sign in to icloud/i }));

		const mfaDialog = await screen.findByRole('dialog', { name: /two-factor authentication/i });
		await user.type(within(mfaDialog).getByLabelText(/verification code/i), '654321');
		await user.click(within(mfaDialog).getByRole('button', { name: /verify/i }));

		expect(await screen.findByText(/code rejected/i)).toBeInTheDocument();
		expect(mockedApi.submitMfaCode).toHaveBeenCalledWith({
			sessionId: 'session-456',
			code: '654321',
		});
	});

	it('allows cancelling MFA challenge and resets session', async () => {
		const user = userEvent.setup();
		mockedApi.authenticateICloud.mockResolvedValueOnce({
			success: false,
			requiresMfa: true,
			sessionId: 'session-789',
		});

		render(<Authentication />);

		await user.type(screen.getByLabelText(/apple id/i), 'user@example.com');
		await user.type(screen.getByLabelText(/^password/i), 'super-secret');
		await user.click(screen.getByRole('button', { name: /sign in to icloud/i }));

		const mfaDialog = await screen.findByRole('dialog', { name: /two-factor authentication/i });
		await user.click(within(mfaDialog).getByRole('button', { name: /cancel/i }));

		expect(screen.getByText(/authentication not completed/i)).toBeInTheDocument();
		await waitForElementToBeRemoved(() => screen.getByRole('dialog', { name: /two-factor authentication/i }));
		expect(mockedApi.submitMfaCode).not.toHaveBeenCalled();
	});
});
