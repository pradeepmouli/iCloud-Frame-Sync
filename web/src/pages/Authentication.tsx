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
import React, { useState } from 'react';
import MfaDialog from '../components/MfaDialog';
import { api } from '../services/api';

interface AuthenticationStatus {
  isAuthenticated: boolean;
  status: string;
  userInfo?: {
    fullName: string;
    appleId: string;
  };
}

export default function Authentication() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthenticationStatus | null>(
    null,
  );

  // MFA Dialog state
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaResolve, setMfaResolve] = useState<((code: string) => void) | null>(
    null,
  );

  const handleAuthenticate = async () => {
    if (!username.trim() || !password.trim()) {
      setMessage('Please enter both username and password');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Create MFA callback function
      const mfaCallback = (): Promise<string> => {
        return new Promise((resolve) => {
          setMfaResolve(() => resolve);
          setMfaDialogOpen(true);
          setMfaCode('');
          setMfaError(null);
        });
      };

      const result = await api.authenticateICloud({
        username: username.trim(),
        password,
        mfaCallback,
      });

      if (result.success) {
        setAuthStatus({
          isAuthenticated: true,
          status: result.status || 'Authenticated',
          userInfo: result.userInfo,
        });
        setMessage('Successfully authenticated with iCloud');
        // Clear password for security
        setPassword('');
      } else {
        setMessage(`Authentication failed: ${result.error}`);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = (code: string) => {
    if (!code.trim()) {
      setMfaError('Please enter the MFA code');
      return;
    }

    if (code.length !== 6) {
      setMfaError('MFA code must be 6 digits');
      return;
    }

    setMfaLoading(true);
    setMfaError(null);

    // Resolve the MFA promise with the code
    if (mfaResolve) {
      mfaResolve(code);
      setMfaResolve(null);
    }

    // Close dialog
    setMfaDialogOpen(false);
    setMfaLoading(false);
  };

  const handleMfaCancel = () => {
    if (mfaResolve) {
      // Reject the promise by providing empty code
      mfaResolve('');
      setMfaResolve(null);
    }
    setMfaDialogOpen(false);
    setMfaCode('');
    setMfaError(null);
    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      await api.logoutICloud();
      setAuthStatus(null);
      setMessage('Logged out successfully');
      setUsername('');
      setPassword('');
    } catch (err: any) {
      setMessage(`Logout error: ${err.message}`);
    }
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

      {message && (
        <Alert
          severity={
            message.includes('Error') || message.includes('failed')
              ? 'error'
              : 'success'
          }
          sx={{ mb: 3 }}
        >
          {message}
        </Alert>
      )}

      {/* Authentication Status Card */}
      {authStatus && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{ mb: 2 }}
            >
              <Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48 }}>
                <CheckCircleIcon />
              </Avatar>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" component="h2">
                  Authentication Successful
                </Typography>
                <Chip
                  label={authStatus.status}
                  color="success"
                  variant="filled"
                  size="small"
                />
              </Box>
              <Button
                variant="outlined"
                color="error"
                onClick={handleLogout}
                size="small"
              >
                Logout
              </Button>
            </Stack>

            {authStatus.userInfo && (
              <Box sx={{ mt: 2 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ mb: 1 }}
                >
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

      {/* Authentication Form */}
      {!authStatus && (
        <Card>
          <CardContent>
            <Stack
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{ mb: 3 }}
            >
              <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                <CloudIcon />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h2">
                  Sign in to iCloud
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Enter your Apple ID credentials to access iCloud Photos
                </Typography>
              </Box>
            </Stack>

            {loading && <LinearProgress sx={{ mb: 2 }} />}

            <Stack spacing={3}>
              <TextField
                label="Apple ID"
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your iCloud password"
                fullWidth
                variant="outlined"
                disabled={loading}
                autoComplete="current-password"
                InputProps={{
                  endAdornment: (
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      disabled={loading}
                    >
                      {showPassword ? (
                        <VisibilityOffIcon />
                      ) : (
                        <VisibilityIcon />
                      )}
                    </IconButton>
                  ),
                }}
              />

              <Button
                variant="contained"
                size="large"
                onClick={handleAuthenticate}
                disabled={loading || !username.trim() || !password.trim()}
                fullWidth
                sx={{ mt: 2 }}
              >
                {loading ? 'Authenticating...' : 'Sign In to iCloud'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Security Information */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <SecurityIcon color="primary" />
            <Typography variant="h6">Security & Privacy</Typography>
          </Stack>

          <Stack spacing={1} component="ul" sx={{ pl: 2, m: 0 }}>
            <Typography component="li" variant="body2" color="text.secondary">
              Your credentials are used only for authentication and are not
              stored permanently
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Two-factor authentication (2FA) is supported and recommended
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Authentication tokens are cached locally for convenience
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              You can logout at any time to clear stored credentials
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              This app only accesses your iCloud Photos, not other iCloud
              services
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* MFA Dialog */}
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
