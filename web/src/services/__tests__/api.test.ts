import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api';

const ORIGINAL_FETCH = globalThis.fetch;

type FetchMock = ReturnType<typeof vi.fn>;

function mockJsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: {
			'Content-Type': 'application/json',
		},
	});
}

describe('ApiService', () => {
	let fetchMock: FetchMock;

	beforeEach(() => {
		fetchMock = vi.fn();
		globalThis.fetch = fetchMock as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		globalThis.fetch = ORIGINAL_FETCH;
	});

	it('normalizes album collections from API responses', async () => {
		fetchMock.mockResolvedValueOnce(
			mockJsonResponse({
				albums: [
					{ id: 'album-1', name: 'Family', photoCount: '42', lastSyncedAt: '2024-02-01T10:00:00.000Z' },
					{ id: 'album-2', name: 'Trips', photoCount: 12, lastSyncedAt: null },
					{ id: '', name: '', photoCount: 1 },
				],
			}),
		);

		const albums = await api.listAlbums();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/albums');
		expect(albums).toEqual([
			{
				id: 'album-1',
				name: 'Family',
				photoCount: 42,
				lastSyncedAt: '2024-02-01T10:00:00.000Z',
			},
			{
				id: 'album-2',
				name: 'Trips',
				photoCount: 12,
				lastSyncedAt: null,
			},
		]);
	});

	it('normalizes paginated photo responses and filters invalid entries', async () => {
		fetchMock.mockResolvedValueOnce(
			mockJsonResponse({
				items: [
					{
						id: 'photo-1',
						albumId: 'album-1',
						takenAt: '2024-02-01T09:00:00.000Z',
						sizeBytes: '2048',
						format: 'jpeg',
						status: 'uploaded',
					},
					{
						id: '',
						albumId: 'album-1',
						takenAt: '',
					},
				],
				pagination: { page: '2', pageSize: '24', total: '48' },
			}),
		);

		const page = await api.listPhotos({ albumId: 'album-1', page: 2, pageSize: 24 });

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/photos?albumId=album-1&page=2&pageSize=24',
			expect.objectContaining({ method: 'GET' }),
		);
		expect(page.items).toEqual([
			{
				id: 'photo-1',
				albumId: 'album-1',
				takenAt: '2024-02-01T09:00:00.000Z',
				sizeBytes: 2048,
				format: 'jpeg',
				status: 'uploaded',
			},
		]);
		expect(page.pagination).toEqual({ page: 2, pageSize: 24, total: 48 });
	});

	it('normalizes configuration snapshots when updating settings', async () => {
		fetchMock.mockResolvedValueOnce(
			mockJsonResponse({
				success: true,
				config: {
					syncAlbumName: 'Family',
					frameHost: 'frame.local',
					syncIntervalSeconds: '60',
					logLevel: 'warn',
					corsOrigin: 'http://localhost:3000',
					webPort: '3001',
					iCloudUsername: 'user@example.com',
					hasICloudPassword: true,
					isConfigured: true,
					missingFields: [],
					lastError: null,
				},
			}),
		);

		const payload = { syncAlbumName: 'Family', frameHost: 'frame.local' };
		const config = await api.updateSettings(payload);

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/settings',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(payload),
			}),
		);
		expect(config).toMatchObject({
			syncAlbumName: 'Family',
			frameHost: 'frame.local',
			syncIntervalSeconds: 60,
			logLevel: 'warn',
			corsOrigin: 'http://localhost:3000',
			webPort: 3001,
			iCloudUsername: 'user@example.com',
			hasICloudPassword: true,
			isConfigured: true,
			missingFields: [],
			lastError: null,
		});
	});

	it('normalizes frame status responses', async () => {
		fetchMock.mockResolvedValueOnce(
			mockJsonResponse({
				host: 'frame.local',
				isReachable: true,
				isOn: true,
				inArtMode: false,
				brightness: '42',
				currentArt: {
					id: 'art-1',
					name: 'Sunset',
					width: '1920',
					height: '1080',
					isFavorite: true,
					matte: { type: 'modern', color: 'white' },
					addedAt: '2024-02-01T08:00:00.000Z',
				},
				device: {
					name: 'The Frame',
					model: '2022',
					serialNumber: 'ABC123',
					firmwareVersion: '1.0.0',
				},
				lastCheckedAt: '2024-02-01T10:30:00.000Z',
			}),
		);

		const status = await api.getFrameStatus();

		expect(status.host).toBe('frame.local');
		expect(status.isReachable).toBe(true);
		expect(status.isOn).toBe(true);
		expect(status.inArtMode).toBe(false);
		expect(status.brightness).toBe(42);
		expect(status.currentArt).toMatchObject({
			id: 'art-1',
			name: 'Sunset',
			width: 1920,
			height: 1080,
			isFavorite: true,
		});
		expect(status.device).toEqual({
			name: 'The Frame',
			model: '2022',
			serialNumber: 'ABC123',
			firmwareVersion: '1.0.0',
		});
		expect(status.lastCheckedAt).toBe('2024-02-01T10:30:00.000Z');
	});

	it('normalizes sync accepted response body', async () => {
		fetchMock.mockResolvedValueOnce(
			mockJsonResponse({ operationId: 'operation-123' }, { status: 202 }),
		);

		const result = await api.queueManualSync({ albumName: 'Family' });

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/sync',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ albumName: 'Family' }),
			}),
		);
		expect(result).toEqual({ operationId: 'operation-123' });
	});
});
