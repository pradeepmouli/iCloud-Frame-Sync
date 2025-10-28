import { Refresh as RefreshIcon, Save as SaveIcon, Settings as SettingsIcon } from '@mui/icons-material';
import {
	Alert,
	Avatar,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	GridLegacy as Grid,
	MenuItem,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import MfaDialog from '../components/MfaDialog';
import { api } from '../services/api';
import type {
	ConnectionTestRequestPayload,
	ConnectionTestResponsePayload,
	ConnectionTestResultPayload,
	FrameConnectionTestPayload,
	SettingsConfigSnapshot,
	SettingsUpdateRequest,
} from '../types/index';

interface SettingsFormState {
  syncAlbumName: string;
  frameHost: string;
  syncIntervalSeconds: string;
  logLevel: 'info' | 'warn' | 'debug';
  corsOrigin: string;
  icloudUsername: string;
  icloudPassword: string;
  hasIcloudPassword: boolean;
}

function mapSettingsToForm(settings: SettingsConfigSnapshot): SettingsFormState {
  return {
    syncAlbumName: settings.syncAlbumName ?? '',
    frameHost: settings.frameHost ?? '',
    syncIntervalSeconds:
      settings.syncIntervalSeconds !== undefined
        ? String(settings.syncIntervalSeconds)
        : '',
    logLevel: settings.logLevel ?? 'info',
    corsOrigin: settings.corsOrigin ?? '',
    icloudUsername: settings.iCloudUsername ?? '',
    icloudPassword: '',
    hasIcloudPassword: Boolean(settings.hasICloudPassword),
  };
}

function buildPayload(formState: SettingsFormState): SettingsUpdateRequest {
  const payload: SettingsUpdateRequest = {
    syncAlbumName: formState.syncAlbumName.trim(),
    frameHost: formState.frameHost.trim(),
    logLevel: formState.logLevel,
  };

  const intervalValue = parseInt(formState.syncIntervalSeconds, 10);
  if (!Number.isNaN(intervalValue)) {
    payload.syncIntervalSeconds = intervalValue;
  }

  if (formState.corsOrigin.trim()) {
    payload.corsOrigin = formState.corsOrigin.trim();
  }

  if (formState.icloudUsername.trim()) {
    payload.iCloudUsername = formState.icloudUsername.trim();
  }

  if (formState.icloudPassword.trim()) {
    payload.iCloudPassword = formState.icloudPassword;
  }

  return payload;
}

export default function Configuration() {
  const [snapshot, setSnapshot] = useState<SettingsConfigSnapshot | null>(null);
  const [formState, setFormState] = useState<SettingsFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResponsePayload | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionTesting, setConnectionTesting] = useState(false);
  const [mfaContext, setMfaContext] = useState<{
    sessionId: string;
    username: string;
    frame: FrameConnectionTestPayload;
  } | null>(null);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!formState) {
      return false;
    }
    const hasUsername = formState.icloudUsername.trim().length > 0;
    const hasPassword = formState.icloudPassword.trim().length > 0 || formState.hasIcloudPassword;
    return (
      formState.syncAlbumName.trim().length > 0 &&
      formState.frameHost.trim().length > 0 &&
      hasUsername &&
      hasPassword
    );
  }, [formState]);

  const canTestConnections = useMemo(() => {
    if (!formState) {
      return false;
    }
    return (
      formState.icloudUsername.trim().length > 0 &&
      formState.icloudPassword.trim().length > 0 &&
      formState.frameHost.trim().length > 0
    );
  }, [formState]);

  const loadConfiguration = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const status = await api.getStatus();
      if (!status.config) {
        setSnapshot(null);
        setFormState(null);
        setErrorMessage('Configuration snapshot is not yet available.');
        return;
      }

      setSnapshot(status.config);
      setFormState(mapSettingsToForm(status.config));
    } catch (error: unknown) {
      setSnapshot(null);
      setFormState(null);
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load configuration.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  const handleFieldChange = useCallback(
    <K extends keyof SettingsFormState>(field: K) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value as SettingsFormState[K];
        setFormState((current) =>
          current
            ? {
                ...current,
                [field]: value,
              }
            : current
        );
      },
    []
  );

  const handleLogLevelChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value as SettingsFormState['logLevel'];
      setFormState((current) =>
        current
          ? {
              ...current,
              logLevel: value,
            }
          : current
      );
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!formState) {
        return;
      }

      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const payload = buildPayload(formState);
        const updated = await api.updateSettings(payload);
        setSnapshot(updated);
        setFormState(mapSettingsToForm(updated));
        setSuccessMessage('Settings updated successfully.');
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to save configuration.'
        );
      } finally {
        setSaving(false);
      }
    },
    [formState]
  );

  const handleReset = useCallback(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  const describeICloudResult = useCallback((result: ConnectionTestResultPayload): string => {
    if (result.success) {
      const userInfo = (result.userInfo ?? {}) as Record<string, unknown>;
      const fullName = typeof userInfo.fullName === 'string' ? userInfo.fullName : undefined;
      const appleId = typeof userInfo.appleId === 'string' ? userInfo.appleId : undefined;
      if (fullName && appleId) {
        return `Authenticated as ${fullName} (${appleId}).`;
      }
      if (appleId) {
        return `Authenticated as ${appleId}.`;
      }
      return 'Authentication succeeded.';
    }
    if (result.requiresMfa) {
      return result.message ?? 'Two-factor authentication required. Enter the verification code to continue.';
    }
    return result.error ?? 'Unable to authenticate with iCloud.';
  }, []);

  const describeFrameResult = useCallback((result: ConnectionTestResultPayload): string => {
    if (result.success) {
      const responseTime = typeof result.responseTimeMs === 'number' ? ` (response time ${result.responseTimeMs} ms)` : '';
      const host = typeof result.host === 'string' ? result.host : formState?.frameHost ?? 'frame';
      return `Frame at ${host} responded successfully${responseTime}.`;
    }
    return result.error ?? 'Unable to reach the Samsung Frame device.';
  }, [formState?.frameHost]);

  const handleTestConnections = useCallback(async () => {
    if (!formState) {
      return;
    }
    const username = formState.icloudUsername.trim();
    const password = formState.icloudPassword.trim();
    const frameHost = formState.frameHost.trim();

    if (!username || !password || !frameHost) {
      setConnectionError('Enter your iCloud username, password, and frame host before testing connections.');
      return;
    }

    const framePayload: FrameConnectionTestPayload = { host: frameHost };
    const payload: ConnectionTestRequestPayload = {
      icloud: {
        username,
        password,
        forceRefresh: true,
      },
      frame: framePayload,
    };

    setConnectionTesting(true);
    setConnectionError(null);
    setConnectionResult(null);
    setMfaContext(null);
    setMfaError(null);

    try {
      const response = await api.testConnections(payload);
      setConnectionResult(response);
      if (response.icloud.requiresMfa && typeof response.icloud.sessionId === 'string') {
        setMfaContext({
          sessionId: response.icloud.sessionId,
          username,
          frame: framePayload,
        });
        setMfaError(response.icloud.error ?? null);
      }
    } catch (error: unknown) {
      setConnectionError(error instanceof Error ? error.message : 'Connection test failed.');
    } finally {
      setConnectionTesting(false);
    }
  }, [formState]);

  const handleMfaSubmit = useCallback(async (code: string) => {
    if (!mfaContext) {
      return;
    }
    setMfaSubmitting(true);
    setMfaError(null);
    try {
      const response = await api.testConnections({
        icloud: {
          username: mfaContext.username,
          sessionId: mfaContext.sessionId,
          mfaCode: code,
        },
        frame: mfaContext.frame,
      });
      setConnectionResult(response);
      if (response.icloud.requiresMfa && typeof response.icloud.sessionId === 'string') {
        setMfaContext({
          sessionId: response.icloud.sessionId,
          username: mfaContext.username,
          frame: mfaContext.frame,
        });
        setMfaError(response.icloud.error ?? 'Verification code was not accepted. Try again.');
      } else {
        setMfaContext(null);
      }
    } catch (error: unknown) {
      setMfaError(error instanceof Error ? error.message : 'Failed to verify MFA code.');
    } finally {
      setMfaSubmitting(false);
    }
  }, [mfaContext]);

  const handleMfaCancel = useCallback(() => {
    setMfaContext(null);
    setMfaError(null);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography>Loading configuration…</Typography>
        </CardContent>
      </Card>
    );
  }

  if (!formState) {
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
          Configuration
        </Typography>
        {errorMessage && (
          <Alert severity="error">{errorMessage}</Alert>
        )}
      </Box>
    );
  }

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
        Configuration
      </Typography>

      <Stack spacing={2} sx={{ mb: 3 }}>
        {errorMessage && (
          <Alert severity="error">{errorMessage}</Alert>
        )}
        {successMessage && (
          <Alert severity="success">{successMessage}</Alert>
        )}
        {snapshot && (!snapshot.isConfigured || snapshot.missingFields.length > 0) && (
          <Alert severity="warning">
            {snapshot.isConfigured
              ? 'Setup incomplete: some configuration fields are still missing.'
              : 'Setup required: complete the configuration fields below to enable syncing.'}
            {snapshot.missingFields.length > 0 && (
              <Box component="span" sx={{ display: 'block', mt: 1 }}>
                Missing: {snapshot.missingFields.join(', ')}
              </Box>
            )}
          </Alert>
        )}
        {snapshot?.lastError && (
          <Alert severity="info">
            Last initialization error: {snapshot.lastError}
          </Alert>
        )}
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Card component="form" onSubmit={handleSubmit}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', width: 48, height: 48 }}>
                  <SettingsIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h2">
                    Sync Configuration
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Update album selection, target frame host, and runtime options.
                  </Typography>
                </Box>
              </Stack>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="iCloud Username"
                    value={formState.icloudUsername}
                    onChange={handleFieldChange('icloudUsername')}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label={
                      formState.hasIcloudPassword
                        ? 'iCloud Password (leave blank to keep existing)'
                        : 'iCloud Password'
                    }
                    value={formState.icloudPassword}
                    onChange={handleFieldChange('icloudPassword')}
                    type="password"
                    fullWidth
                    required={!formState.hasIcloudPassword}
                    helperText={
                      formState.hasIcloudPassword
                        ? 'Enter a new password to replace the stored credential.'
                        : undefined
                    }
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Sync Album Name"
                    value={formState.syncAlbumName}
                    onChange={handleFieldChange('syncAlbumName')}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Frame Host"
                    value={formState.frameHost}
                    onChange={handleFieldChange('frameHost')}
                    fullWidth
                    required
                    helperText="Hostname or IP address of your Samsung Frame TV."
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Sync Interval (seconds)"
                    value={formState.syncIntervalSeconds}
                    onChange={handleFieldChange('syncIntervalSeconds')}
                    type="number"
                    inputProps={{ min: 0 }}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Log Level"
                    value={formState.logLevel}
                    onChange={handleLogLevelChange}
                    fullWidth
                  >
                    <MenuItem value="info">info</MenuItem>
                    <MenuItem value="warn">warn</MenuItem>
                    <MenuItem value="debug">debug</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="CORS Origin"
                    value={formState.corsOrigin}
                    onChange={handleFieldChange('corsOrigin')}
                    fullWidth
                    helperText="Optional origin allowed to access the REST API."
                  />
                </Grid>
              </Grid>

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="flex-end"
                spacing={2}
                sx={{ mt: 4 }}
              >
                <Button
                  type="button"
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleReset}
                  disabled={loading}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={!canSubmit || saving}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                    <RefreshIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h6" component="h2">
                      Connection Test
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Validate iCloud credentials and frame reachability before saving.
                    </Typography>
                  </Box>
                </Stack>

                <Stack spacing={2}>
                  <Button
                    type="button"
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={handleTestConnections}
                    disabled={!canTestConnections || connectionTesting}
                  >
                    {connectionTesting ? 'Testing…' : 'Run Connection Test'}
                  </Button>
                  {!canTestConnections && (
                    <Typography variant="body2" color="text.secondary">
                      Enter your iCloud password to enable connection testing.
                    </Typography>
                  )}
                  {connectionError && <Alert severity="error">{connectionError}</Alert>}
                  {connectionResult && (
                    <Stack spacing={2} sx={{ mt: 1 }}>
                      <Alert severity={connectionResult.overall === 'ready' ? 'success' : 'warning'}>
                        {connectionResult.overall === 'ready'
                          ? 'All connections responded successfully.'
                          : 'One or more connections need attention.'}
                      </Alert>
                      <Stack spacing={1.5}>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip
                              size="small"
                              color={
                                connectionResult.icloud.success
                                  ? 'success'
                                  : connectionResult.icloud.requiresMfa
                                    ? 'warning'
                                    : 'error'
                              }
                              label={
                                connectionResult.icloud.success
                                  ? 'Connected'
                                  : connectionResult.icloud.requiresMfa
                                    ? 'MFA required'
                                    : 'Attention'
                              }
                            />
                            <Typography variant="subtitle2">iCloud</Typography>
                          </Stack>
                          {connectionResult.icloud.status && (
                            <Typography variant="body2" color="text.secondary">
                              Status: {connectionResult.icloud.status}
                            </Typography>
                          )}
                          <Typography
                            variant="body2"
                            color={connectionResult.icloud.success ? 'success.main' : 'text.secondary'}
                          >
                            {describeICloudResult(connectionResult.icloud)}
                          </Typography>
                          {!connectionResult.icloud.success && connectionResult.icloud.error && (
                            <Typography variant="body2" color="error.main">
                              {connectionResult.icloud.error}
                            </Typography>
                          )}
                        </Stack>

                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip
                              size="small"
                              color={connectionResult.frame.success ? 'success' : 'error'}
                              label={connectionResult.frame.success ? 'Connected' : 'Attention'}
                            />
                            <Typography variant="subtitle2">Frame</Typography>
                          </Stack>
                          <Typography
                            variant="body2"
                            color={connectionResult.frame.success ? 'success.main' : 'text.secondary'}
                          >
                            {describeFrameResult(connectionResult.frame)}
                          </Typography>
                          {typeof connectionResult.frame.responseTimeMs === 'number' && (
                            <Typography variant="body2" color="text.secondary">
                              Response time: {connectionResult.frame.responseTimeMs} ms
                            </Typography>
                          )}
                          {!connectionResult.frame.success && connectionResult.frame.error && (
                            <Typography variant="body2" color="error.main">
                              {connectionResult.frame.error}
                            </Typography>
                          )}
                        </Stack>
                      </Stack>
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Current Snapshot
                </Typography>
                {snapshot ? (
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      Sync Album: {snapshot.syncAlbumName}
                    </Typography>
                    <Typography variant="body2">
                      iCloud Username: {snapshot.iCloudUsername ?? '—'}
                    </Typography>
                    <Typography variant="body2">
                      Password Stored: {snapshot.hasICloudPassword ? 'Yes' : 'No'}
                    </Typography>
                    <Typography variant="body2">
                      Frame Host: {snapshot.frameHost}
                    </Typography>
                    <Typography variant="body2">
                      Interval: {snapshot.syncIntervalSeconds ?? '—'} seconds
                    </Typography>
                    <Typography variant="body2">
                      Log Level: {snapshot.logLevel ?? '—'}
                    </Typography>
                    <Typography variant="body2">
                      CORS Origin: {snapshot.corsOrigin ?? '—'}
                    </Typography>
                    <Typography variant="body2">
                      Web Port: {snapshot.webPort}
                    </Typography>
                    <Typography variant="body2">
                      Service Ready: {snapshot.isConfigured ? 'Yes' : 'No'}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      <Chip
                        label={snapshot.hasICloudPassword ? 'Password stored' : 'Password missing'}
                        color={snapshot.hasICloudPassword ? 'success' : 'warning'}
                        size="small"
                      />
                      <Chip
                        label={snapshot.isConfigured ? 'Configured' : 'Needs setup'}
                        color={snapshot.isConfigured ? 'success' : 'warning'}
                        size="small"
                      />
                      <Chip
                        label={snapshot.missingFields.length > 0 ? `${snapshot.missingFields.length} missing fields` : 'All fields present'}
                        color={snapshot.missingFields.length > 0 ? 'warning' : 'success'}
                        size="small"
                      />
                    </Stack>
                    {snapshot.lastError && (
                      <Typography variant="body2" color="warning.main">
                        Last Error: {snapshot.lastError}
                      </Typography>
                    )}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Snapshot not available yet. Trigger a sync to populate configuration.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <MfaDialog
        open={Boolean(mfaContext)}
        onSubmit={handleMfaSubmit}
        onCancel={handleMfaCancel}
        loading={mfaSubmitting}
        error={mfaError}
      />
    </Box>
  );
}
