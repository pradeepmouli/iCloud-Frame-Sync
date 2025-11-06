import { Pause as PauseIcon, PlayArrow as PlayArrowIcon, Refresh as RefreshIcon, Save as SaveIcon, Sync as SyncIcon, Warning as WarningIcon } from '@mui/icons-material';
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Divider,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../services/api';
import type {
	SettingsConfigSnapshot,
	SettingsUpdateRequest,
	StatusResponse,
} from '../types/index';

interface SettingsFormState {
  syncAlbumName: string;
  frameHost: string;
  syncIntervalSeconds: string;
  logLevel: 'info' | 'warn' | 'debug';
  corsOrigin: string;
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
  };
}

export default function Dashboard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [settings, setSettings] = useState<SettingsConfigSnapshot | null>(null);
  const [formState, setFormState] = useState<SettingsFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setErrorMessage(null);
      const statusResponse = await api.getStatus();
      setStatus(statusResponse);
      if (statusResponse.config) {
        setSettings(statusResponse.config);
        setFormState(mapSettingsToForm(statusResponse.config));
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to load dashboard data.'
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
      if (statusResponse.config) {
        setSettings(statusResponse.config);
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to refresh status.'
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleFieldChange = useCallback(
    <K extends keyof SettingsFormState>(name: K) =>
      (
        event: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => {
        const value = event.target.value as SettingsFormState[K];
        setFormState((current) =>
          current
            ? {
                ...current,
                [name]: value,
              }
            : current
        );
      },
    []
  );

  const handleManualSync = useCallback(async () => {
    setSyncing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const accepted = await api.queueManualSync({});
      await refreshStatusOnly();
      setSuccessMessage(`Manual sync accepted (operation ${accepted.operationId}).`);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to trigger manual sync.'
      );
    } finally {
      setSyncing(false);
    }
  }, [refreshStatusOnly]);

  const handleSettingsSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!formState) {
        return;
      }

      setSaving(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      try {
        const intervalValue = parseInt(formState.syncIntervalSeconds, 10);
        const payload: SettingsUpdateRequest = {
          syncAlbumName: formState.syncAlbumName.trim(),
          frameHost: formState.frameHost.trim(),
          logLevel: formState.logLevel,
        };

        if (!Number.isNaN(intervalValue)) {
          payload.syncIntervalSeconds = intervalValue;
        }

        if (formState.corsOrigin.trim()) {
          payload.corsOrigin = formState.corsOrigin.trim();
        }

        const newSettings = await api.updateSettings(payload);
        setSettings(newSettings);
        setFormState(mapSettingsToForm(newSettings));
        setSuccessMessage('Settings saved successfully.');
        await refreshStatusOnly();
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Failed to save settings.'
        );
      } finally {
        setSaving(false);
      }
    },
    [formState, refreshStatusOnly]
  );

  const latestOperationStatus = useMemo(() => {
    if (!status?.sync) {
      return 'No operations have been recorded yet.';
    }
    const state = status.sync.status;
    return `Status: ${state.charAt(0).toUpperCase()}${state.slice(1)}`;
  }, [status]);

  const isConfigured = status?.config?.isConfigured ?? false;
  const missingFields = status?.config?.missingFields ?? [];
  const manualSyncDisabled = syncing || refreshDisabledState(status?.sync, isConfigured, missingFields);

  function refreshDisabledState(sync: StatusResponse['sync'] | null | undefined, configured: boolean, missing: string[]): boolean {
    if (!configured || missing.length > 0) {
      return true;
    }
    if (!sync) {
      return false;
    }
    return sync.status === 'running';
  }

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
      <Typography variant="h4" component="h1">
        Dashboard
      </Typography>

      {errorMessage && (
        <Alert severity="error" data-testid="dashboard-error">
          {errorMessage}
        </Alert>
      )}

      {status?.sync?.error && (
        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 0 }}>
          Latest sync reported an error: {status.sync.error}
        </Alert>
      )}

      {(!isConfigured || missingFields.length > 0) && (
        <Alert severity="warning" sx={{ mb: 0 }} data-testid="dashboard-setup-warning">
          Setup incomplete. Please finish configuration before triggering manual sync.
          {missingFields.length > 0 && (
            <Box component="span" sx={{ display: 'block', mt: 1 }}>
              Missing: {missingFields.join(', ')}
            </Box>
          )}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" data-testid="dashboard-success">
          {successMessage}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 3,
          alignItems: 'stretch',
        }}
      >
        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" component="h2">
                Latest Operation
              </Typography>
              <Button
                onClick={refreshStatusOnly}
                startIcon={<RefreshIcon />}
                disabled={refreshing}
                size="small"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
            </Stack>

            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography variant="body1">
                Operation ID: {status?.sync?.id ?? '—'}
              </Typography>
              <Typography variant="body1">{latestOperationStatus}</Typography>
              <Typography variant="body1">
                Photos Processed: {status?.sync ? status.sync.photoIds.length : 0}
              </Typography>
              <Typography variant="body1">
                Attempt: {status?.sync ? status.sync.attempt : '—'}
              </Typography>
              <Typography variant="body1">
                Started At: {status?.sync?.startedAt ?? '—'}
              </Typography>
              <Typography variant="body1">
                Completed At: {status?.sync?.completedAt ?? '—'}
              </Typography>
              <Divider flexItem sx={{ my: 1 }} />
              <Stack direction="row" alignItems="center" spacing={1}>
                <Chip
                  icon={scheduleInfo?.isPaused ? <PauseIcon /> : <PlayArrowIcon />}
                  label={scheduleInfo?.isPaused ? 'Scheduler Paused' : 'Scheduler Active'}
                  color={scheduleInfo?.isPaused ? 'warning' : 'success'}
                  size="small"
                />
                <Typography variant="body2" color="text.secondary">
                  Interval: {scheduleInfo?.intervalSeconds ?? '—'}s
                </Typography>
              </Stack>
              <Typography variant="body1">
                Next Sync: {status?.schedule?.nextRunAt ?? 'Not scheduled'}
              </Typography>
            </Stack>

            <Button
              variant="contained"
              color="primary"
              startIcon={<SyncIcon />}
              onClick={handleManualSync}
              disabled={manualSyncDisabled}
              sx={{ mt: 3 }}
            >
              {syncing ? 'Syncing…' : 'Trigger Manual Sync'}
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Current Settings
            </Typography>

            <Stack spacing={1}>
              <Typography variant="body2">
                Sync Album: {settings?.syncAlbumName ?? '—'}
              </Typography>
              <Typography variant="body2">
                Frame Host: {settings?.frameHost ?? '—'}
              </Typography>
              <Typography variant="body2">
                Interval Seconds: {settings?.syncIntervalSeconds ?? '—'}
              </Typography>
              <Typography variant="body2">
                Log Level: {settings?.logLevel ?? '—'}
              </Typography>
              <Typography variant="body2">
                CORS Origin: {settings?.corsOrigin ?? '—'}
              </Typography>
              <Divider flexItem sx={{ my: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Setup Status: {isConfigured ? 'Configured' : 'Setup Required'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Missing Fields: {missingFields.length > 0 ? missingFields.join(', ') : 'None'}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Card component="form" onSubmit={handleSettingsSubmit}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'flex-end' }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: 'repeat(3, minmax(0, 1fr))',
                },
                gap: 2,
                flexGrow: 1,
              }}
            >
              <TextField
                label="Sync Album"
                value={formState?.syncAlbumName ?? ''}
                onChange={handleFieldChange('syncAlbumName')}
                fullWidth
                required
              />

              <TextField
                label="Frame Host"
                value={formState?.frameHost ?? ''}
                onChange={handleFieldChange('frameHost')}
                fullWidth
                required
              />

              <TextField
                label="Sync Interval (seconds)"
                value={formState?.syncIntervalSeconds ?? ''}
                onChange={handleFieldChange('syncIntervalSeconds')}
                type="number"
                inputProps={{ min: 0 }}
                fullWidth
              />

              <TextField
                select
                label="Log Level"
                value={formState?.logLevel ?? 'info'}
                onChange={handleFieldChange('logLevel')}
                fullWidth
                SelectProps={{ native: true }}
              >
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="debug">debug</option>
              </TextField>

              <TextField
                label="CORS Origin"
                value={formState?.corsOrigin ?? ''}
                onChange={handleFieldChange('corsOrigin')}
                fullWidth
                sx={{ gridColumn: { xs: 'auto', md: 'span 2' } }}
              />
            </Box>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              disabled={saving}
              sx={{ minWidth: 160 }}
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
