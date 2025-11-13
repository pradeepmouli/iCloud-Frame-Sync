import { Refresh as RefreshIcon } from '@mui/icons-material';
import {
	Alert,
	Avatar,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	GridLegacy as Grid,
	Stack,
	Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo, useState } from 'react';

import { ConfigurationForm } from '../components/forms/ConfigurationForm';
import MfaDialog from '../components/MfaDialog';
import { api } from '../services/api';
import type { ConfigurationUpdate, ConnectionTestResult } from '../types';
import type {
	ConnectionTestRequestPayload,
	ConnectionTestResponsePayload,
	ConnectionTestResultPayload,
	FrameConnectionTestPayload,
} from '../types/index';


export default function Configuration() {
  const queryClient = useQueryClient();

  // Use React Query for configuration data
  const { data: configData, isLoading: loadingConfig } = useQuery({
    queryKey: ['configuration'],
    queryFn: api.getConfiguration,
    retry: 1,
  });

  // Use React Query for status/snapshot data
  const { data: statusData, isLoading: loadingStatus } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    retry: 1,
  });

  const snapshot = statusData?.config ?? null;
  const configInitial = configData ?? null;
  const loading = loadingConfig || loadingStatus;

  // Mutation for updating configuration
  const updateConfigMutation = useMutation({
    mutationFn: api.updateConfiguration,
    onSuccess: () => {
      // Invalidate and refetch both queries
      queryClient.invalidateQueries({ queryKey: ['configuration'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      setSuccessMessage('Configuration saved');
      setErrorMessage(null);
    },
    onError: (error: Error) => {
      setErrorMessage(error.message || 'Failed to save configuration');
      setSuccessMessage(null);
    },
  });

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

  const canTestConnections = useMemo(() => {
    const username = (configInitial?.icloudUsername ?? snapshot?.iCloudUsername ?? '').trim();
    const frameHost = (configInitial?.frameHost ?? snapshot?.frameHost ?? '').trim();
    const hasPassword = (configInitial?.hasPassword ?? snapshot?.hasICloudPassword ?? false);
    return username.length > 0 && frameHost.length > 0 && hasPassword;
  }, [configInitial, snapshot]);

  // the page-level "Run Connection Test" uses stored snapshot/config when available

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
      const host = typeof result.host === 'string' ? result.host : (configInitial?.frameHost ?? snapshot?.frameHost ?? 'frame');
      return `Frame at ${host} responded successfully${responseTime}.`;
    }
    return result.error ?? 'Unable to reach the Samsung Frame device.';
  }, [configInitial?.frameHost, snapshot?.frameHost]);

  const handleTestConnections = useCallback(async () => {
    const username = (configInitial?.icloudUsername ?? snapshot?.iCloudUsername ?? '').trim();
    const frameHost = (configInitial?.frameHost ?? snapshot?.frameHost ?? '').trim();

    // If we don't have a password available on this page, ask user to use the form's Test button
    const hasStoredPassword = Boolean(configInitial?.hasPassword ?? snapshot?.hasICloudPassword ?? false);
    if (!username || !frameHost) {
      setConnectionError('Configuration is incomplete — ensure iCloud username and frame host are set.');
      return;
    }

    if (!hasStoredPassword) {
      setConnectionError('No password available locally — open the Configuration form and use the Test button to provide credentials.');
      return;
    }

    const framePayload: FrameConnectionTestPayload = { host: frameHost };
    const payload: ConnectionTestRequestPayload = {
      icloud: {
        username,
        // no password supplied — server may use stored credential
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
  }, [configInitial, snapshot]);

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

  if (!snapshot && !configInitial) {
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
          <Card>
            <CardContent>
              <ConfigurationForm
                initialData={configInitial ?? undefined}
                isLoading={updateConfigMutation.isPending}
                onSubmit={async (updates: ConfigurationUpdate) => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  await updateConfigMutation.mutateAsync(updates);
                }}
                onTestICloud={async (username: string, password: string, sourceAlbum?: string) => {
                  const result = await api.testICloudConnection({ username, password, sourceAlbum });
                  return result as unknown as ConnectionTestResult;
                }}
                onTestFrame={async (host: string, port: number) => {
                  const result = await api.testFrameConnection({ host, port });
                  return result as unknown as ConnectionTestResult;
                }}
              />
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
