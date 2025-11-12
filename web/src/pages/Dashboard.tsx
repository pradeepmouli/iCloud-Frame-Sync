import {
	Pause as PauseIcon,
	PlayArrow as PlayArrowIcon,
	Refresh as RefreshIcon,
	Settings as SettingsIcon,
	Stop as StopIcon,
	Sync as SyncIcon,
	Warning as WarningIcon,
} from '@mui/icons-material';
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Divider,
	LinearProgress,
	Link,
	Stack,
	Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { api } from '../services/api';
import type { StatusResponse } from '../types/index';

export default function Dashboard() {
	const [status, setStatus] = useState<StatusResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const loadDashboard = useCallback(async () => {
		try {
			setErrorMessage(null);
			const statusResponse = await api.getStatus();
			setStatus(statusResponse);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: 'Failed to load dashboard data.',
			);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	const refreshStatusOnly = useCallback(async () => {
		try {
			setRefreshing(true);
			const statusResponse = await api.getStatus();
			setStatus(statusResponse);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error ? error.message : 'Failed to refresh status.',
			);
		} finally {
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		loadDashboard();
	}, [loadDashboard]);

	// Auto-refresh during active sync
	useEffect(() => {
		if (status?.sync?.status === 'running') {
			const interval = setInterval(refreshStatusOnly, 2000);
			return () => clearInterval(interval);
		}
	}, [status?.sync?.status, refreshStatusOnly]);

	const handleStartSync = useCallback(async () => {
		setSyncing(true);
		setSuccessMessage(null);
		setErrorMessage(null);

		try {
			const accepted = await api.queueManualSync({});
			await refreshStatusOnly();
			setSuccessMessage(
				`Sync started successfully (operation ${accepted.operationId}).`,
			);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error ? error.message : 'Failed to start sync.',
			);
		} finally {
			setSyncing(false);
		}
	}, [refreshStatusOnly]);

	const handleStopSync = useCallback(async () => {
		setStopping(true);
		setSuccessMessage(null);
		setErrorMessage(null);

		try {
			setSuccessMessage('Stop sync feature coming soon.');
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error ? error.message : 'Failed to stop sync.',
			);
		} finally {
			setStopping(false);
		}
	}, []);

	const latestOperationStatus = useMemo(() => {
		if (!status?.sync) {
			return 'No sync operations yet';
		}
		const state = status.sync.status;
		return state.charAt(0).toUpperCase() + state.slice(1);
	}, [status]);

	const isConfigured = status?.config?.isConfigured ?? false;
	const missingFields = status?.config?.missingFields ?? [];
	const isSyncRunning = status?.sync?.status === 'running';
	const canStartSync = isConfigured && missingFields.length === 0 && !isSyncRunning;

	const syncProgress = useMemo(() => {
		if (!status?.sync || !isSyncRunning) {
			return null;
		}
		const total = status.sync.photoIds.length;
		const completed = 0;
		return {
			total,
			completed,
			percentage: total > 0 ? (completed / total) * 100 : 0,
		};
	}, [status, isSyncRunning]);

	const scheduleInfo = status?.schedule ?? null;

	if (loading) {
		return (
			<Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
				<CircularProgress />
				<Typography variant="body1" sx={{ mt: 2 }}>
					Loading dashboard...
				</Typography>
			</Stack>
		);
	}

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}
			>
				<Typography variant="h4" component="h1">
					Dashboard
				</Typography>
				<Button
					onClick={refreshStatusOnly}
					startIcon={<RefreshIcon />}
					disabled={refreshing}
					size="small"
				>
					{refreshing ? 'Refreshing…' : 'Refresh'}
				</Button>
			</Box>

			{errorMessage && (
				<Alert severity="error" data-testid="dashboard-error">
					{errorMessage}
				</Alert>
			)}

			{successMessage && (
				<Alert severity="success" data-testid="dashboard-success">
					{successMessage}
				</Alert>
			)}

			{status?.sync?.error && (
				<Alert severity="warning" icon={<WarningIcon />}>
					Latest sync error: {status.sync.error}
				</Alert>
			)}

			{(!isConfigured || missingFields.length > 0) && (
				<Alert
					severity="info"
					data-testid="dashboard-setup-warning"
					action={
						<Button
							component={RouterLink}
							to="/configuration"
							startIcon={<SettingsIcon />}
							color="inherit"
							size="small"
						>
							Configure
						</Button>
					}
				>
					<Typography variant="body2" sx={{ fontWeight: 500 }}>
						Setup Required
					</Typography>
					<Typography variant="body2">
						Please configure the application before starting sync.
						{missingFields.length > 0 && (
							<Box component="span" sx={{ display: 'block', mt: 0.5 }}>
								Missing: {missingFields.join(', ')}
							</Box>
						)}
					</Typography>
				</Alert>
			)}

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
							Sync Control
						</Typography>
						<Chip
							icon={isSyncRunning ? <SyncIcon /> : undefined}
							label={latestOperationStatus}
							color={
								isSyncRunning
									? 'primary'
									: status?.sync?.error
										? 'error'
										: 'default'
							}
							size="medium"
						/>
					</Box>

					{isSyncRunning && syncProgress && (
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
									{syncProgress.completed} / {syncProgress.total} photos
								</Typography>
							</Box>
							<LinearProgress
								variant="determinate"
								value={syncProgress.percentage}
								sx={{ height: 8, borderRadius: 4 }}
							/>
						</Box>
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
							disabled={!canStartSync || syncing}
							sx={{ minWidth: 160 }}
						>
							{syncing ? 'Starting…' : 'Start Sync'}
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

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
					gap: 3,
				}}
			>
				<Card>
					<CardContent>
						<Typography variant="h6" component="h2" gutterBottom>
							Sync Status
						</Typography>

						<Stack spacing={1.5}>
							<Box>
								<Typography variant="body2" color="text.secondary">
									Operation ID
								</Typography>
								<Typography variant="body1">
									{status?.sync?.id ?? 'None'}
								</Typography>
							</Box>

							<Box>
								<Typography variant="body2" color="text.secondary">
									Photos Processed
								</Typography>
								<Typography variant="body1">
									{status?.sync ? status.sync.photoIds.length : 0}
								</Typography>
							</Box>

							<Box>
								<Typography variant="body2" color="text.secondary">
									Attempt
								</Typography>
								<Typography variant="body1">
									{status?.sync?.attempt ?? 'N/A'}
								</Typography>
							</Box>

							<Divider />

							<Box>
								<Typography variant="body2" color="text.secondary">
									Started At
								</Typography>
								<Typography variant="body1">
									{status?.sync?.startedAt ?? 'N/A'}
								</Typography>
							</Box>

							<Box>
								<Typography variant="body2" color="text.secondary">
									Completed At
								</Typography>
								<Typography variant="body1">
									{status?.sync?.completedAt ?? 'N/A'}
								</Typography>
							</Box>
						</Stack>
					</CardContent>
				</Card>

				<Card>
					<CardContent>
						<Typography variant="h6" component="h2" gutterBottom>
							Schedule Status
						</Typography>

						<Stack spacing={1.5}>
							<Box>
								<Typography variant="body2" color="text.secondary">
									Scheduler State
								</Typography>
								<Box sx={{ mt: 0.5 }}>
									<Chip
										icon={
											scheduleInfo?.isPaused ? (
												<PauseIcon />
											) : (
												<PlayArrowIcon />
											)
										}
										label={
											scheduleInfo?.isPaused
												? 'Paused'
												: 'Active'
										}
										color={
											scheduleInfo?.isPaused
												? 'warning'
												: 'success'
										}
										size="small"
									/>
								</Box>
							</Box>

							<Box>
								<Typography variant="body2" color="text.secondary">
									Interval
								</Typography>
								<Typography variant="body1">
									{scheduleInfo?.intervalSeconds ?? 'N/A'} seconds
								</Typography>
							</Box>

							<Box>
								<Typography variant="body2" color="text.secondary">
									Next Sync
								</Typography>
								<Typography variant="body1">
									{status?.schedule?.nextRunAt ?? 'Not scheduled'}
								</Typography>
							</Box>
						</Stack>
					</CardContent>
				</Card>
			</Box>

			{!isConfigured && (
				<Alert severity="info" sx={{ mt: 2 }}>
					<Typography variant="body2">
						<strong>Getting Started:</strong> Navigate to the{' '}
						<Link component={RouterLink} to="/configuration" underline="hover">
							Configuration
						</Link>{' '}
						page to set up your iCloud credentials, Frame TV connection, and sync
						preferences.
					</Typography>
				</Alert>
			)}
		</Box>
	);
}
