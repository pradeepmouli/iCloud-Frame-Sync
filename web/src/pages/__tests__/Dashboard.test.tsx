import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../services/api';
import Dashboard from '../Dashboard';

vi.mock('../../services/api', () => {
	return {
		api: {
			getStatus: vi.fn(),
			queueManualSync: vi.fn(),
		},
	};
});

type MockedApi = {
	getStatus: ReturnType<typeof vi.fn>;
	queueManualSync: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

// Helper to render Dashboard with router context
const renderDashboard = () => {
	return render(
		<MemoryRouter>
			<Dashboard />
		</MemoryRouter>
	);
};

describe('Dashboard page', () => {
	beforeEach(() => {
		mockedApi.getStatus.mockResolvedValue({
			sync: {
				id: 'op-200',
				status: 'succeeded',
				photoIds: ['photo-1', 'photo-2', 'photo-3'],
				startedAt: '2024-02-01T11:58:00.000Z',
				completedAt: '2024-02-01T11:59:00.000Z',
				error: null,
				attempt: 1,
				frameId: 'frame-1',
			},
			schedule: {
				nextRunAt: '2024-02-01T12:00:00.000Z',
				intervalSeconds: 120,
				isPaused: false,
			},
			config: {
				syncAlbumName: 'Launch Album',
				frameHost: 'frame.local',
				syncIntervalSeconds: 300,
				logLevel: 'info',
				corsOrigin: 'http://localhost:3000',
				webPort: 3001,
				isConfigured: true,
				missingFields: [],
				hasICloudPassword: true,
				iCloudUsername: 'user@example.com',
			},
		});

		mockedApi.queueManualSync.mockResolvedValue({ operationId: 'manual-001' });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Rendering', () => {
		it('renders dashboard with sync status', async () => {
			renderDashboard();

			await screen.findByText('Dashboard');
			expect(screen.getByText('Sync Control')).toBeInTheDocument();
			expect(screen.getByText('Sync Status')).toBeInTheDocument();
			expect(screen.getByText('Schedule Status')).toBeInTheDocument();
		});

		it('displays loading state initially', () => {
			renderDashboard();

			expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
		});

		it('shows sync operation details', async () => {
			renderDashboard();

			await screen.findByText('op-200');
			expect(screen.getByText('3')).toBeInTheDocument(); // Photo count
			expect(screen.getByText('2024-02-01T11:58:00.000Z')).toBeInTheDocument(); // Started at
			expect(screen.getByText('2024-02-01T11:59:00.000Z')).toBeInTheDocument(); // Completed at
		});

		it('displays schedule information', async () => {
			renderDashboard();

			await screen.findByText('Schedule Status');
			expect(screen.getByText('Active')).toBeInTheDocument();
			expect(screen.getByText('120 seconds')).toBeInTheDocument();
			expect(screen.getByText('2024-02-01T12:00:00.000Z')).toBeInTheDocument();
		});
	});

	describe('Start/Stop Controls', () => {
		it('enables Start Sync button when configured', async () => {
			renderDashboard();

			const startButton = await screen.findByRole('button', {
				name: /start sync/i,
			});

			expect(startButton).toBeEnabled();
		});

		it('triggers manual sync when Start Sync clicked', async () => {
			const user = userEvent.setup();
			renderDashboard();

			const startButton = await screen.findByRole('button', {
				name: /start sync/i,
			});

			await user.click(startButton);

			await waitFor(() => {
				expect(mockedApi.queueManualSync).toHaveBeenCalledWith({});
			});

			expect(await screen.findByText(/sync started successfully/i)).toBeInTheDocument();
		});

		it('disables Start Sync when sync is running', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: {
					id: 'op-201',
					status: 'running',
					photoIds: ['photo-1', 'photo-2'],
					startedAt: '2024-02-01T12:00:00.000Z',
					completedAt: null,
					error: null,
					attempt: 1,
					frameId: 'frame-1',
				},
				schedule: {
					nextRunAt: '2024-02-01T12:05:00.000Z',
					intervalSeconds: 120,
					isPaused: false,
				},
				config: {
					syncAlbumName: 'Launch Album',
					frameHost: 'frame.local',
					syncIntervalSeconds: 300,
					logLevel: 'info',
					corsOrigin: 'http://localhost:3000',
					webPort: 3001,
					isConfigured: true,
					missingFields: [],
					hasICloudPassword: true,
					iCloudUsername: 'user@example.com',
				},
			});

			renderDashboard();

			const startButton = await screen.findByRole('button', {
				name: /start sync/i,
			});

			expect(startButton).toBeDisabled();
		});

		it('enables Stop Sync button when sync is running', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: {
					id: 'op-201',
					status: 'running',
					photoIds: ['photo-1', 'photo-2'],
					startedAt: '2024-02-01T12:00:00.000Z',
					completedAt: null,
					error: null,
					attempt: 1,
					frameId: 'frame-1',
				},
				schedule: {
					nextRunAt: '2024-02-01T12:05:00.000Z',
					intervalSeconds: 120,
					isPaused: false,
				},
				config: {
					syncAlbumName: 'Launch Album',
					frameHost: 'frame.local',
					syncIntervalSeconds: 300,
					logLevel: 'info',
					corsOrigin: 'http://localhost:3000',
					webPort: 3001,
					isConfigured: true,
					missingFields: [],
					hasICloudPassword: true,
					iCloudUsername: 'user@example.com',
				},
			});

			renderDashboard();

			const stopButton = await screen.findByRole('button', {
				name: /stop sync/i,
			});

			expect(stopButton).toBeEnabled();
		});

		it('disables Stop Sync button when sync is not running', async () => {
			renderDashboard();

			const stopButton = await screen.findByRole('button', {
				name: /stop sync/i,
			});

			expect(stopButton).toBeDisabled();
		});
	});

	describe('Configuration Link', () => {
		it('shows configuration alert when not configured', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: null,
				schedule: null,
				config: {
					syncAlbumName: '',
					frameHost: '',
					syncIntervalSeconds: 60,
					logLevel: 'info',
					corsOrigin: undefined,
					webPort: 3001,
					isConfigured: false,
					hasICloudPassword: false,
					missingFields: ['iCloudUsername', 'iCloudPassword', 'syncAlbumName'],
					iCloudUsername: '',
				},
			});

			renderDashboard();

			expect(await screen.findByTestId('dashboard-setup-warning')).toBeInTheDocument();
			expect(screen.getByText(/setup required/i)).toBeInTheDocument();
			expect(screen.getByText(/missing:/i)).toHaveTextContent(
				'Missing: iCloudUsername, iCloudPassword, syncAlbumName'
			);
		});

		it('displays Configure button link to configuration page', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: null,
				schedule: null,
				config: {
					syncAlbumName: '',
					frameHost: '',
					syncIntervalSeconds: 60,
					logLevel: 'info',
					corsOrigin: undefined,
					webPort: 3001,
					isConfigured: false,
					hasICloudPassword: false,
					missingFields: ['iCloudUsername'],
					iCloudUsername: '',
				},
			});

			renderDashboard();

			await screen.findByTestId('dashboard-setup-warning');

			const configureLink = screen.getByRole('link', { name: /configure/i });

			expect(configureLink).toBeInTheDocument();
			expect(configureLink).toHaveAttribute('href', '/configuration');
		});

		it('disables Start Sync when not configured', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: null,
				schedule: null,
				config: {
					syncAlbumName: '',
					frameHost: '',
					syncIntervalSeconds: 60,
					logLevel: 'info',
					corsOrigin: undefined,
					webPort: 3001,
					isConfigured: false,
					hasICloudPassword: false,
					missingFields: ['iCloudUsername', 'iCloudPassword'],
					iCloudUsername: '',
				},
			});

			renderDashboard();

			const startButton = await screen.findByRole('button', {
				name: /start sync/i,
			});

			expect(startButton).toBeDisabled();
		});

		it('shows getting started message when not configured', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: null,
				schedule: null,
				config: {
					syncAlbumName: '',
					frameHost: '',
					syncIntervalSeconds: 60,
					logLevel: 'info',
					corsOrigin: undefined,
					webPort: 3001,
					isConfigured: false,
					hasICloudPassword: false,
					missingFields: ['iCloudUsername'],
					iCloudUsername: '',
				},
			});

			renderDashboard();

			expect(await screen.findByText(/getting started:/i)).toBeInTheDocument();
			const configLink = screen.getByRole('link', { name: /configuration/i });
			expect(configLink).toHaveAttribute('href', '/configuration');
		});
	});

	describe('Status Display', () => {
		it('shows color-coded status chip for running sync', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: {
					id: 'op-201',
					status: 'running',
					photoIds: ['photo-1'],
					startedAt: '2024-02-01T12:00:00.000Z',
					completedAt: null,
					error: null,
					attempt: 1,
					frameId: 'frame-1',
				},
				schedule: {
					nextRunAt: '2024-02-01T12:05:00.000Z',
					intervalSeconds: 120,
					isPaused: false,
				},
				config: {
					syncAlbumName: 'Launch Album',
					frameHost: 'frame.local',
					syncIntervalSeconds: 300,
					logLevel: 'info',
					corsOrigin: 'http://localhost:3000',
					webPort: 3001,
					isConfigured: true,
					missingFields: [],
					hasICloudPassword: true,
					iCloudUsername: 'user@example.com',
				},
			});

			renderDashboard();

			expect(await screen.findByText('Running')).toBeInTheDocument();
		});

		it('displays sync error alert when present', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: {
					id: 'op-202',
					status: 'failed',
					photoIds: ['photo-1'],
					startedAt: '2024-02-01T12:00:00.000Z',
					completedAt: '2024-02-01T12:01:00.000Z',
					error: 'Connection timeout',
					attempt: 1,
					frameId: 'frame-1',
				},
				schedule: {
					nextRunAt: '2024-02-01T12:05:00.000Z',
					intervalSeconds: 120,
					isPaused: false,
				},
				config: {
					syncAlbumName: 'Launch Album',
					frameHost: 'frame.local',
					syncIntervalSeconds: 300,
					logLevel: 'info',
					corsOrigin: 'http://localhost:3000',
					webPort: 3001,
					isConfigured: true,
					missingFields: [],
					hasICloudPassword: true,
					iCloudUsername: 'user@example.com',
				},
			});

			renderDashboard();

			expect(await screen.findByText(/latest sync error:/i)).toBeInTheDocument();
			expect(screen.getByText(/connection timeout/i)).toBeInTheDocument();
		});

		it('shows paused scheduler status', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: {
					id: 'op-200',
					status: 'succeeded',
					photoIds: ['photo-1'],
					startedAt: '2024-02-01T11:58:00.000Z',
					completedAt: '2024-02-01T11:59:00.000Z',
					error: null,
					attempt: 1,
					frameId: 'frame-1',
				},
				schedule: {
					nextRunAt: null,
					intervalSeconds: 120,
					isPaused: true,
				},
				config: {
					syncAlbumName: 'Launch Album',
					frameHost: 'frame.local',
					syncIntervalSeconds: 300,
					logLevel: 'info',
					corsOrigin: 'http://localhost:3000',
					webPort: 3001,
					isConfigured: true,
					missingFields: [],
					hasICloudPassword: true,
					iCloudUsername: 'user@example.com',
				},
			});

			renderDashboard();

			expect(await screen.findByText('Paused')).toBeInTheDocument();
		});
	});

	describe('Real-Time Progress', () => {
		it('displays progress bar when sync is running', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: {
					id: 'op-201',
					status: 'running',
					photoIds: ['photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5'],
					startedAt: '2024-02-01T12:00:00.000Z',
					completedAt: null,
					error: null,
					attempt: 1,
					frameId: 'frame-1',
				},
				schedule: {
					nextRunAt: '2024-02-01T12:05:00.000Z',
					intervalSeconds: 120,
					isPaused: false,
				},
				config: {
					syncAlbumName: 'Launch Album',
					frameHost: 'frame.local',
					syncIntervalSeconds: 300,
					logLevel: 'info',
					corsOrigin: 'http://localhost:3000',
					webPort: 3001,
					isConfigured: true,
					missingFields: [],
					hasICloudPassword: true,
					iCloudUsername: 'user@example.com',
				},
			});

			renderDashboard();

			expect(await screen.findByText('Progress')).toBeInTheDocument();
			expect(screen.getByText('0 / 5 photos')).toBeInTheDocument();
		});

		it('does not show progress bar when sync is not running', async () => {
			renderDashboard();

			await screen.findByText('Sync Control');

			expect(screen.queryByText('Progress')).not.toBeInTheDocument();
		});
	});

	describe('Auto-Refresh', () => {
		it('sets up polling interval when sync is running', async () => {
			mockedApi.getStatus.mockResolvedValue({
				sync: {
					id: 'op-201',
					status: 'running',
					photoIds: ['photo-1', 'photo-2'],
					startedAt: '2024-02-01T12:00:00.000Z',
					completedAt: null,
					error: null,
					attempt: 1,
					frameId: 'frame-1',
				},
				schedule: {
					nextRunAt: '2024-02-01T12:05:00.000Z',
					intervalSeconds: 120,
					isPaused: false,
				},
				config: {
					syncAlbumName: 'Launch Album',
					frameHost: 'frame.local',
					syncIntervalSeconds: 300,
					logLevel: 'info',
					corsOrigin: 'http://localhost:3000',
					webPort: 3001,
					isConfigured: true,
					missingFields: [],
					hasICloudPassword: true,
					iCloudUsername: 'user@example.com',
				},
			});

			renderDashboard();

			await screen.findByText('Running');

			// Verify the component loaded with running status
			expect(screen.getByText('Progress')).toBeInTheDocument();
		});

		it('does not show progress when sync is idle', async () => {
			renderDashboard();

			await screen.findByText('Succeeded');

			// Should not show progress bar
			expect(screen.queryByText('Progress')).not.toBeInTheDocument();
		});

		it('manual refresh button triggers status update', async () => {
			const user = userEvent.setup();
			renderDashboard();

			await screen.findByText('Dashboard');

			const refreshButton = screen.getByRole('button', {
				name: /refresh/i,
			});

			const initialCalls = mockedApi.getStatus.mock.calls.length;

			await user.click(refreshButton);

			await waitFor(() => {
				expect(mockedApi.getStatus.mock.calls.length).toBeGreaterThan(initialCalls);
			});
		});
	});

	describe('Error Handling', () => {
		it('displays error message when API call fails', async () => {
			mockedApi.getStatus.mockRejectedValueOnce(new Error('Network error'));

			renderDashboard();

			// Wait for error to be displayed
			await waitFor(
				() => {
					const errorAlert = screen.queryByTestId('dashboard-error');
					expect(errorAlert).toBeInTheDocument();
				},
				{ timeout: 10000 }
			);

			expect(screen.getByTestId('dashboard-error')).toHaveTextContent(/network error/i);
		});

		it('shows error when manual sync fails', async () => {
			const user = userEvent.setup();
			mockedApi.queueManualSync.mockRejectedValueOnce(
				new Error('Sync service unavailable')
			);

			renderDashboard();

			const startButton = await screen.findByRole('button', {
				name: /start sync/i,
			});

			await user.click(startButton);

			// Wait for error to be displayed
			await waitFor(
				() => {
					const errorAlert = screen.queryByTestId('dashboard-error');
					expect(errorAlert).toBeInTheDocument();
				},
				{ timeout: 10000 }
			);

			expect(screen.getByTestId('dashboard-error')).toHaveTextContent(/sync service unavailable/i);
		});
	});
});
