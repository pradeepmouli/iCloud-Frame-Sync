import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../services/api';
import Dashboard from '../Dashboard';

vi.mock('../../services/api', () => {
	const successResponse = Promise.resolve({ success: true, message: 'ok' });
	return {
		api: {
			getStatus: vi.fn(),
			queueManualSync: vi.fn(),
			updateSettings: vi.fn(),
			getAppStatus: vi.fn().mockResolvedValue({
				isRunning: true,
				syncStatus: true,
				syncInProgress: false,
				syncInterval: 120,
			}),
			getSyncStatus: vi.fn().mockResolvedValue({
				isRunning: true,
				inProgress: false,
				intervalSeconds: 120,
			}),
			startApp: vi.fn().mockResolvedValue({ success: true, message: 'started' }),
			stopApp: vi.fn().mockResolvedValue({ success: true, message: 'stopped' }),
			startSync: vi.fn().mockResolvedValue({ success: true, message: 'sync started' }),
			stopSync: vi.fn().mockResolvedValue({ success: true, message: 'sync stopped' }),
			runSyncOnce: vi.fn().mockResolvedValue({ success: true, message: 'sync triggered' }),
			updateConfiguration: vi.fn().mockReturnValue(successResponse),
			getConfig: vi.fn().mockResolvedValue({
				iCloud: { username: 'user@example.com', sourceAlbum: 'Launch Album' },
				frame: { host: 'frame.local' },
				syncIntervalSeconds: 300,
				logLevel: 'info',
			}),
		},
	};
});

type MockedApi = {
	getStatus: ReturnType<typeof vi.fn>;
	queueManualSync: ReturnType<typeof vi.fn>;
	updateSettings: ReturnType<typeof vi.fn>;
	getAppStatus: ReturnType<typeof vi.fn>;
	getSyncStatus: ReturnType<typeof vi.fn>;
	startApp: ReturnType<typeof vi.fn>;
	stopApp: ReturnType<typeof vi.fn>;
	startSync: ReturnType<typeof vi.fn>;
	stopSync: ReturnType<typeof vi.fn>;
	runSyncOnce: ReturnType<typeof vi.fn>;
	updateConfiguration: ReturnType<typeof vi.fn>;
	getConfig: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

describe('Dashboard page', () => {
	beforeEach(() => {
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

		mockedApi.updateSettings.mockResolvedValue({
			syncAlbumName: 'Launch Album',
			frameHost: 'frame.local',
			syncIntervalSeconds: 300,
			logLevel: 'info',
			corsOrigin: 'http://localhost:3000',
			webPort: 3001,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('renders latest sync status from status endpoint', async () => {
		render(<Dashboard />);

		await screen.findByText(/latest operation/i);

		expect(screen.getByText(/op-200/i)).toBeInTheDocument();
		expect(screen.getByText(/status:\s*succeeded/i)).toBeInTheDocument();
		expect(screen.getByText(/next sync:/i)).toHaveTextContent('2024-02-01T12:00:00.000Z');
	});

	it('triggers manual sync when user clicks trigger button', async () => {
		render(<Dashboard />);

		const triggerButton = await screen.findByRole('button', {
			name: /trigger manual sync/i,
		});

		await userEvent.click(triggerButton);

		await waitFor(() => {
			expect(mockedApi.queueManualSync).toHaveBeenCalledWith({});
		});
	});

	it('saves configuration changes through dashboard form', async () => {
		render(<Dashboard />);

		const albumInput = await screen.findByLabelText(/sync album/i);
		const frameInput = screen.getByLabelText(/frame host/i);
		const intervalInput = screen.getByLabelText(/sync interval/i);
		const logLevelSelect = screen.getByLabelText(/log level/i);
		const corsInput = screen.getByLabelText(/cors origin/i);

		await userEvent.clear(albumInput);
		await userEvent.type(albumInput, 'Family Album');
		await userEvent.clear(frameInput);
		await userEvent.type(frameInput, 'frame.home');
		await userEvent.clear(intervalInput);
		await userEvent.type(intervalInput, '180');
		await userEvent.selectOptions(logLevelSelect, 'debug');
		await userEvent.clear(corsInput);
		await userEvent.type(corsInput, 'http://localhost:5173');

		const saveButton = screen.getByRole('button', { name: /save settings/i });
		await userEvent.click(saveButton);

		await waitFor(() => {
			expect(mockedApi.updateSettings).toHaveBeenCalledWith({
				syncAlbumName: 'Family Album',
				frameHost: 'frame.home',
				syncIntervalSeconds: 180,
				logLevel: 'debug',
				corsOrigin: 'http://localhost:5173',
			});
		});
	});

	it('disables manual sync when setup is incomplete', async () => {
		mockedApi.getStatus.mockResolvedValueOnce({
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
			},
		});

		render(<Dashboard />);

		const triggerButton = await screen.findByRole('button', {
			name: /trigger manual sync/i,
		});

		expect(triggerButton).toBeDisabled();
		expect(await screen.findByTestId('dashboard-setup-warning')).toBeInTheDocument();
	});
});
