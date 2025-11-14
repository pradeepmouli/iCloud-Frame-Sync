import { zodResolver } from '@hookform/resolvers/zod';
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	FormControlLabel,
	GridLegacy as Grid,
	Paper,
	Switch,
	TextField,
	Typography,
} from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { ConfigurationResponse, ConfigurationUpdate, ConnectionTestResult } from '../../types';

// Validation schema (matches backend schema)
const ConfigurationFormSchema = z.object({
	// iCloud Configuration
	icloudUsername: z.string().email('Invalid email format').optional().or(z.literal('')),
	icloudPassword: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
	icloudSourceAlbum: z.string().optional().or(z.literal('')),

	// Frame Configuration
	frameHost: z.string().regex(/^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-zA-Z0-9][a-zA-Z0-9-.]*$/, 'Invalid IP or hostname').optional().or(z.literal('')),
	framePort: z.number().min(1).max(65535).optional(),

	// Sync Configuration
	syncInterval: z.number().min(30).max(3600).optional(),
	syncEnabled: z.boolean().optional(),
	deleteAfterSync: z.boolean().optional(),
	maxRetries: z.number().min(0).max(10).optional(),
});

type ConfigurationFormData = z.infer<typeof ConfigurationFormSchema>;

export interface ConfigurationFormProps {
	initialData?: ConfigurationResponse;
	onSubmit: (data: ConfigurationUpdate) => Promise<void>;
	onTestICloud?: (username: string, password: string, sourceAlbum?: string) => Promise<ConnectionTestResult>;
	onTestFrame?: (host: string, port: number) => Promise<ConnectionTestResult>;
	isLoading?: boolean;
}

export function ConfigurationForm({
	initialData,
	onSubmit,
	onTestICloud,
	onTestFrame,
	isLoading = false,
}: ConfigurationFormProps) {
	const [testingICloud, setTestingICloud] = useState(false);
	const [testingFrame, setTestingFrame] = useState(false);
	const [icloudTestResult, setICloudTestResult] = useState<ConnectionTestResult | null>(null);
	const [frameTestResult, setFrameTestResult] = useState<ConnectionTestResult | null>(null);

	const {
		register,
		handleSubmit,
		watch,
		formState: { errors, isDirty },
	} = useForm<ConfigurationFormData>({
		resolver: zodResolver(ConfigurationFormSchema),
		defaultValues: {
			icloudUsername: initialData?.icloudUsername || '',
			icloudPassword: '', // Never populate password field
			icloudSourceAlbum: initialData?.icloudSourceAlbum || '',
			frameHost: initialData?.frameHost || '',
			framePort: initialData?.framePort || 8002,
			syncInterval: initialData?.syncInterval || 60,
			syncEnabled: initialData?.syncEnabled ?? false,
			deleteAfterSync: initialData?.deleteAfterSync ?? true,
			maxRetries: initialData?.maxRetries || 3,
		},
	});

	const icloudUsername = watch('icloudUsername');
	const icloudPassword = watch('icloudPassword');
	const icloudSourceAlbum = watch('icloudSourceAlbum');
	const frameHost = watch('frameHost');
	const framePort = watch('framePort');
	const syncEnabled = watch('syncEnabled');
	const deleteAfterSync = watch('deleteAfterSync');

	const handleFormSubmit = async (data: ConfigurationFormData) => {
		// Convert form data to update payload (remove empty strings)
		const updates: ConfigurationUpdate = {};

		if (data.icloudUsername && data.icloudUsername.trim()) {
			updates.icloudUsername = data.icloudUsername;
		}
		if (data.icloudPassword && data.icloudPassword.trim()) {
			updates.icloudPassword = data.icloudPassword;
		}
		if (data.icloudSourceAlbum && data.icloudSourceAlbum.trim()) {
			updates.icloudSourceAlbum = data.icloudSourceAlbum;
		}
		if (data.frameHost && data.frameHost.trim()) {
			updates.frameHost = data.frameHost;
		}
		if (data.framePort) {
			updates.framePort = data.framePort;
		}
		if (data.syncInterval) {
			updates.syncInterval = data.syncInterval;
		}
		if (data.syncEnabled !== undefined) {
			updates.syncEnabled = data.syncEnabled;
		}
		if (data.deleteAfterSync !== undefined) {
			updates.deleteAfterSync = data.deleteAfterSync;
		}
		if (data.maxRetries !== undefined) {
			updates.maxRetries = data.maxRetries;
		}

		await onSubmit(updates);
	};

	const handleTestICloud = async () => {
		if (!onTestICloud || !icloudUsername || !icloudPassword) {
			return;
		}

		setTestingICloud(true);
		setICloudTestResult(null);

		try {
			const result = await onTestICloud(icloudUsername, icloudPassword, icloudSourceAlbum || undefined);
			setICloudTestResult(result);
		} catch (error) {
			setICloudTestResult({
				success: false,
				message: error instanceof Error ? error.message : 'Connection test failed',
			});
		} finally {
			setTestingICloud(false);
		}
	};

	const handleTestFrame = async () => {
		if (!onTestFrame || !frameHost) {
			return;
		}

		setTestingFrame(true);
		setFrameTestResult(null);

		try {
			const result = await onTestFrame(frameHost, framePort || 8002);
			setFrameTestResult(result);
		} catch (error) {
			setFrameTestResult({
				success: false,
				message: error instanceof Error ? error.message : 'Connection test failed',
			});
		} finally {
			setTestingFrame(false);
		}
	};

	return (
		<Box component="form" onSubmit={handleSubmit(handleFormSubmit)} sx={{ maxWidth: 800 }}>
			<Grid container spacing={3}>
				{/* iCloud Configuration Section */}
				<Grid item xs={12}>
					<Paper sx={{ p: 3 }}>
						<Typography variant="h6" gutterBottom>
							iCloud Configuration
						</Typography>

						<Grid container spacing={2}>
							<Grid item xs={12}>
								<TextField
									{...register('icloudUsername')}
									label="iCloud Email"
									type="email"
									fullWidth
									error={Boolean(errors.icloudUsername)}
									helperText={errors.icloudUsername?.message}
									placeholder="your@email.com"
								/>
							</Grid>

							<Grid item xs={12}>
								<TextField
									{...register('icloudPassword')}
									label="iCloud Password"
									type="password"
									fullWidth
									error={Boolean(errors.icloudPassword)}
									helperText={
										errors.icloudPassword?.message ||
										(initialData?.hasPassword ? 'Leave blank to keep existing password' : '')
									}
									placeholder="Enter password"
								/>
							</Grid>

							<Grid item xs={12}>
								<TextField
									{...register('icloudSourceAlbum')}
									label="Source Album Name"
									fullWidth
									error={Boolean(errors.icloudSourceAlbum)}
									helperText={errors.icloudSourceAlbum?.message || 'Album to sync photos from'}
									placeholder="My Photos"
								/>
							</Grid>

							{onTestICloud && (
								<Grid item xs={12}>
									<Button
										variant="outlined"
										onClick={handleTestICloud}
										disabled={testingICloud || !icloudUsername || !icloudPassword}
										startIcon={testingICloud ? <CircularProgress size={20} /> : undefined}
									>
										{testingICloud ? 'Testing...' : 'Test iCloud Connection'}
									</Button>

									{icloudTestResult && (
										<Alert severity={icloudTestResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
											{icloudTestResult.message}
										</Alert>
									)}
								</Grid>
							)}
						</Grid>
					</Paper>
				</Grid>

				{/* Frame TV Configuration Section */}
				<Grid item xs={12}>
					<Paper sx={{ p: 3 }}>
						<Typography variant="h6" gutterBottom>
							Frame TV Configuration
						</Typography>

						<Grid container spacing={2}>
							<Grid item xs={12} sm={8}>
								<TextField
									{...register('frameHost')}
									label="Frame TV IP or Hostname"
									fullWidth
									error={Boolean(errors.frameHost)}
									helperText={errors.frameHost?.message}
									placeholder="192.168.1.100"
								/>
							</Grid>

							<Grid item xs={12} sm={4}>
								<TextField
									{...register('framePort', { valueAsNumber: true })}
									label="Port"
									type="number"
									fullWidth
									error={Boolean(errors.framePort)}
									helperText={errors.framePort?.message}
									placeholder="8002"
								/>
							</Grid>

							{onTestFrame && (
								<Grid item xs={12}>
									<Button
										variant="outlined"
										onClick={handleTestFrame}
										disabled={testingFrame || !frameHost}
										startIcon={testingFrame ? <CircularProgress size={20} /> : undefined}
									>
										{testingFrame ? 'Testing...' : 'Test Frame Connection'}
									</Button>

									{frameTestResult && (
										<Alert severity={frameTestResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
											{frameTestResult.message}
										</Alert>
									)}
								</Grid>
							)}
						</Grid>
					</Paper>
				</Grid>

				{/* Sync Configuration Section */}
				<Grid item xs={12}>
					<Paper sx={{ p: 3 }}>
						<Typography variant="h6" gutterBottom>
							Sync Configuration
						</Typography>

						<Grid container spacing={2}>
							<Grid item xs={12} sm={6}>
								<TextField
									{...register('syncInterval', { valueAsNumber: true })}
									label="Sync Interval (seconds)"
									type="number"
									fullWidth
									error={Boolean(errors.syncInterval)}
									helperText={errors.syncInterval?.message || 'How often to check for new photos (30-3600)'}
									placeholder="60"
								/>
							</Grid>

							<Grid item xs={12} sm={6}>
								<TextField
									{...register('maxRetries', { valueAsNumber: true })}
									label="Max Retries"
									type="number"
									fullWidth
									error={Boolean(errors.maxRetries)}
									helperText={errors.maxRetries?.message || 'Maximum retry attempts (0-10)'}
									placeholder="3"
								/>
							</Grid>

							<Grid item xs={12}>
								<FormControlLabel
									control={<Switch {...register('syncEnabled')} checked={syncEnabled} />}
									label="Enable Automatic Sync"
								/>
							</Grid>

							<Grid item xs={12}>
								<FormControlLabel
									control={<Switch {...register('deleteAfterSync')} checked={deleteAfterSync} />}
									label="Delete Photos After Sync"
								/>
							</Grid>
						</Grid>
					</Paper>
				</Grid>

				{/* Submit Button */}
				<Grid item xs={12}>
					<Button
						type="submit"
						variant="contained"
						size="large"
						disabled={isLoading || !isDirty}
						startIcon={isLoading ? <CircularProgress size={20} /> : undefined}
					>
						{isLoading ? 'Saving...' : 'Save Configuration'}
					</Button>
				</Grid>
			</Grid>
		</Box>
	);
}
