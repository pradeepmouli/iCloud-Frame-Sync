import {
	CheckCircle as CheckCircleIcon,
	Cloud as CloudIcon,
	Person as PersonIcon,
	Security as SecurityIcon,
	Visibility as VisibilityIcon,
	VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import {
	Alert,
	Avatar,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	IconButton,
	LinearProgress,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import React, { useMemo, useState } from 'react';

import MfaDialog from '../components/MfaDialog';
import { api } from '../services/api';
import type { AuthenticateICloudResponse } from '../types/index';

interface AuthenticationStatus {
	isAuthenticated: boolean;
	status: string;
	userInfo?: {
		fullName: string;
		appleId: string;
	};
}

type AlertState = {
	text: string;
	severity: 'success' | 'error' | 'info' | 'warning';
};

export default function Authentication() {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [alert, setAlert] = useState<AlertState | null>(null);
	const [authStatus, setAuthStatus] = useState<AuthenticationStatus | null>(null);
	const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

	const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
	const [mfaLoading, setMfaLoading] = useState(false);
	const [mfaError, setMfaError] = useState<string | null>(null);

	const canSubmit = useMemo(() => {
		return username.trim().length > 0 && password.trim().length > 0 && !loading;
	}, [username, password, loading]);

	const handleAuthenticationResult = (result: AuthenticateICloudResponse, credentialPasswordReset = true): void => {
		if (result.requiresMfa && result.sessionId) {
			setPendingSessionId(result.sessionId);
			setMfaDialogOpen(true);
			setMfaError(null);
			setAlert({
				text: 'Two-factor authentication required. Enter the code sent to your Apple devices.',
				severity: 'info',
			});
			return;
		}

		if (result.success) {
			setAuthStatus({
				isAuthenticated: true,
				status: result.status ?? 'Authenticated',
				userInfo: result.userInfo,
			});
			setAlert({
				text: 'Successfully authenticated with iCloud.',
				severity: 'success',
			});
			if (credentialPasswordReset) {
				setPassword('');
			}
			setPendingSessionId(null);
			setMfaDialogOpen(false);
			setMfaError(null);
			return;
		}

		setAlert({
			text: result.error ?? 'Authentication failed. Please verify your credentials and try again.',
			severity: 'error',
		});
	};

	const handleAuthenticate = async () => {
		if (!username.trim() || !password.trim()) {
			setAlert({ text: 'Please enter both username and password.', severity: 'warning' });
			return;
		}

		setLoading(true);
		setAlert(null);
		setPendingSessionId(null);
		setMfaDialogOpen(false);
		setMfaError(null);

		try {
			const result = await api.authenticateICloud({
				username: username.trim(),
				password,
			});
			handleAuthenticationResult(result);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Authentication request failed.';
			setAlert({ text: message, severity: 'error' });
		} finally {
			setLoading(false);
		}
	};

	const handleMfaSubmit = async (code: string) => {
		if (!pendingSessionId) {
			setMfaError('MFA session expired. Please restart authentication.');
			return;
		}

		if (!code.trim()) {
			setMfaError('Please enter the MFA code.');
			return;
		}
		if (code.trim().length !== 6) {
			setMfaError('MFA code must be 6 digits.');
			return;
		}

		setMfaLoading(true);
		setMfaError(null);

		try {
			const result = await api.submitMfaCode({ sessionId: pendingSessionId, code: code.trim() });
			handleAuthenticationResult(result, false);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to verify MFA code.';
			setMfaError(message);
		} finally {
			setMfaLoading(false);
		}
	};

	const handleMfaCancel = () => {
		setMfaDialogOpen(false);
		setPendingSessionId(null);
		setMfaError(null);
		setAlert({ text: 'MFA process cancelled. Authentication not completed.', severity: 'warning' });
	};

	const handleLogout = () => {
		setAuthStatus(null);
		setAlert({ text: 'Session cleared. Submit credentials to authenticate again.', severity: 'info' });
		setUsername('');
		setPassword('');
		setPendingSessionId(null);
		setMfaDialogOpen(false);
		setMfaError(null);
	};

	return (
		<Box>
			<Typography
				variant="h3"
				component="h1"
				gutterBottom
				sx={{
					background: 'linear-gradient(45deg, #ffffff, #ffffff80)',
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
					fontWeight: 700,
					mb: 4,
				}}
			>
				iCloud Authentication
			</Typography>

			{alert && (
				<Alert severity={alert.severity} sx={{ mb: 3 }}>
					{alert.text}
				</Alert>
			)}

			{authStatus && (
				<Card sx={{ mb: 3 }}>
					<CardContent>
						<Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
							<Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48 }}>
								<CheckCircleIcon />
							</Avatar>
							<Box sx={{ flexGrow: 1 }}>
								<Typography variant="h6" component="h2">
									Authentication Successful
								</Typography>
								<Chip label={authStatus.status} color="success" variant="filled" size="small" />
							</Box>
							<Button variant="outlined" color="error" onClick={handleLogout} size="small">
								Logout
							</Button>
						</Stack>

						{authStatus.userInfo && (
							<Box sx={{ mt: 2 }}>
								<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
									<PersonIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
									<Typography variant="body1" fontWeight={600}>
										{authStatus.userInfo.fullName}
									</Typography>
								</Stack>
								<Typography variant="body2" color="text.secondary">
									Apple ID: {authStatus.userInfo.appleId}
								</Typography>
							</Box>
						)}
					</CardContent>
				</Card>
			)}

			{!authStatus && (
				<Card>
					<CardContent>
						<Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
							<Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
								<CloudIcon />
							</Avatar>
							<Box>
								<Typography variant="h6" component="h2">
									Sign in to iCloud
								</Typography>
								<Typography variant="body2" color="text.secondary">
									Enter your Apple ID credentials to authenticate the sync service.
								</Typography>
							</Box>
						</Stack>

						{loading && <LinearProgress sx={{ mb: 2 }} />}

						<Stack spacing={3}>
							<TextField
								label="Apple ID"
								type="email"
								value={username}
								onChange={(event) => setUsername(event.target.value)}
								placeholder="your-apple-id@example.com"
								fullWidth
								variant="outlined"
								disabled={loading}
								autoComplete="username"
							/>

							<TextField
								label="Password"
								type={showPassword ? 'text' : 'password'}
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								placeholder="Your iCloud password"
								fullWidth
								variant="outlined"
								disabled={loading}
								autoComplete="current-password"
								InputProps={{
									endAdornment: (
										<IconButton onClick={() => setShowPassword((current) => !current)} edge="end" disabled={loading}>
											{showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
										</IconButton>
									),
								}}
							/>

							<Button
								variant="contained"
								size="large"
								onClick={handleAuthenticate}
								disabled={!canSubmit}
								fullWidth
								sx={{ mt: 2 }}
							>
								{loading ? 'Authenticating…' : 'Sign In to iCloud'}
							</Button>
						</Stack>
					</CardContent>
				</Card>
			)}

			<Card sx={{ mt: 3 }}>
				<CardContent>
					<Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
						<SecurityIcon color="primary" />
						<Typography variant="h6">Security & Privacy</Typography>
					</Stack>

					<Stack spacing={1} component="ul" sx={{ pl: 2, m: 0 }}>
						<Typography component="li" variant="body2" color="text.secondary">
							Credentials are transmitted securely to iCloud and never stored permanently by this application.
						</Typography>
						<Typography component="li" variant="body2" color="text.secondary">
							Two-factor authentication keeps your account safe. Enter the verification code when prompted.
						</Typography>
						<Typography component="li" variant="body2" color="text.secondary">
							Authentication tokens remain local to this device for seamless syncing.
						</Typography>
						<Typography component="li" variant="body2" color="text.secondary">
							Use the Logout option above to clear cached credentials at any time.
						</Typography>
						<Typography component="li" variant="body2" color="text.secondary">
							The app only accesses iCloud Photos—no other iCloud services are touched.
						</Typography>
					</Stack>
				</CardContent>
			</Card>

			<MfaDialog
				open={mfaDialogOpen}
				onSubmit={handleMfaSubmit}
				onCancel={handleMfaCancel}
				loading={mfaLoading}
				error={mfaError}
			/>
		</Box>
	);
}
