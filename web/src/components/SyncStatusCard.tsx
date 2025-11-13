import {
	PlayArrow as PlayArrowIcon,
	Stop as StopIcon,
	Sync as SyncIcon,
} from '@mui/icons-material';
import {
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	LinearProgress,
	Stack,
	Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../services/api';
import type { SyncStateResponse } from '../types/index';

export interface SyncStatusCardProps {
	isConfigured: boolean;
	missingFields: string[];
	onError?: (error: string) => void;
	onSuccess?: (message: string) => void;
}

export function SyncStatusCard({
	isConfigured,
	missingFields,
	onError,
	onSuccess,
}: SyncStatusCardProps) {
	const [syncState, setSyncState] = useState<SyncStateResponse | null>(null);
	const [starting, setStarting] = useState(false);
	const [stopping, setStopping] = useState(false);
	const eventSourceRef = useRef<EventSource | null>(null);

	// Initialize and connect to SSE stream
	useEffect(() => {
		// Initial state fetch
		const fetchInitialState = async () => {
			try {
				const state = await api.getSyncStatus();
				setSyncState(state);
			} catch (error) {
				console.error('Failed to fetch sync status:', error);
				if (onError) {
					onError(
						error instanceof Error
							? error.message
							: 'Failed to fetch sync status',
					);
				}
			}
		};

		fetchInitialState();

		// Connect to SSE stream for real-time updates
		try {
			const eventSource = api.createSyncStatusStream();
			eventSourceRef.current = eventSource;

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data) as SyncStateResponse;
					setSyncState(data);
				} catch (error) {
					console.error('Failed to parse SSE message:', error);
				}
			};

			eventSource.onerror = (error) => {
				console.error('SSE connection error:', error);
				// Reconnect will happen automatically
			};
		} catch (error) {
			console.error('Failed to create SSE connection:', error);
		}

		// Cleanup on unmount
		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
		};
	}, [onError]);

	const handleStartSync = useCallback(async () => {
		setStarting(true);
		try {
			const response = await api.startSyncOperation();
			if (onSuccess) {
				onSuccess(response.message ?? 'Sync started successfully');
			}
		} catch (error) {
			if (onError) {
				onError(
					error instanceof Error ? error.message : 'Failed to start sync',
				);
			}
		} finally {
			setStarting(false);
		}
	}, [onError, onSuccess]);

	const handleStopSync = useCallback(async () => {
		setStopping(true);
		try {
			const response = await api.stopSyncOperation();
			if (onSuccess) {
				onSuccess(response.message ?? 'Sync stopped successfully');
			}
		} catch (error) {
			if (onError) {
				onError(
					error instanceof Error ? error.message : 'Failed to stop sync',
				);
			}
		} finally {
			setStopping(false);
		}
	}, [onError, onSuccess]);

	const isSyncRunning = syncState?.status === 'running';
	const canStartSync =
		isConfigured && missingFields.length === 0 && !isSyncRunning;

	const statusLabel = syncState
		? syncState.status.charAt(0).toUpperCase() + syncState.status.slice(1)
		: 'Unknown';

	const statusColor =
		syncState?.status === 'running'
			? 'primary'
			: syncState?.status === 'error'
				? 'error'
				: syncState?.status === 'completed'
					? 'success'
					: 'default';

	return (
		<Card>
			<CardContent>
				<Box
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						mb: 2,
					}}
				>
					<Typography variant="h6" component="h2">
						Sync Status
					</Typography>
					<Chip
						icon={isSyncRunning ? <SyncIcon /> : undefined}
						label={statusLabel}
						color={statusColor}
						size="medium"
					/>
				</Box>

				{isSyncRunning && syncState && (
					<Box sx={{ mb: 3 }}>
						<Box
							sx={{
								display: 'flex',
								justifyContent: 'space-between',
								mb: 1,
							}}
						>
							<Typography variant="body2" color="text.secondary">
								Progress
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{syncState.photosProcessed} / {syncState.photosTotal} photos
							</Typography>
						</Box>
						<LinearProgress
							variant="determinate"
							value={syncState.progressPercent}
							sx={{ height: 8, borderRadius: 4 }}
						/>
						<Box
							sx={{
								display: 'flex',
								justifyContent: 'space-between',
								mt: 1,
							}}
						>
							<Typography variant="caption" color="text.secondary">
								{syncState.progressPercent.toFixed(1)}% complete
							</Typography>
							{syncState.photosFailed > 0 && (
								<Typography variant="caption" color="error">
									{syncState.photosFailed} failed
								</Typography>
							)}
							{syncState.photosSkipped > 0 && (
								<Typography variant="caption" color="text.secondary">
									{syncState.photosSkipped} skipped
								</Typography>
							)}
						</Box>
					</Box>
				)}

				{!isSyncRunning && syncState && (
					<Stack spacing={1.5} sx={{ mb: 2 }}>
						{syncState.photosTotal > 0 && (
							<Box>
								<Typography variant="body2" color="text.secondary">
									Last Sync
								</Typography>
								<Typography variant="body1">
									{syncState.photosProcessed} photos processed
									{syncState.photosFailed > 0 &&
										`, ${syncState.photosFailed} failed`}
								</Typography>
							</Box>
						)}
						{syncState.lastError && (
							<Box>
								<Typography variant="body2" color="error">
									Error: {syncState.lastError}
								</Typography>
							</Box>
						)}
					</Stack>
				)}

				<Box
					sx={{
						display: 'flex',
						gap: 2,
						justifyContent: 'center',
					}}
				>
					<Button
						variant="contained"
						color="primary"
						size="large"
						startIcon={<PlayArrowIcon />}
						onClick={handleStartSync}
						disabled={!canStartSync || starting}
						sx={{ minWidth: 160 }}
					>
						{starting ? 'Starting…' : 'Start Sync'}
					</Button>
					<Button
						variant="outlined"
						color="secondary"
						size="large"
						startIcon={<StopIcon />}
						onClick={handleStopSync}
						disabled={!isSyncRunning || stopping}
						sx={{ minWidth: 160 }}
					>
						{stopping ? 'Stopping…' : 'Stop Sync'}
					</Button>
				</Box>
			</CardContent>
		</Card>
	);
}
