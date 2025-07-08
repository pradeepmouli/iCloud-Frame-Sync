import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  GridLegacy as Grid,
  Chip,
  Alert,
  LinearProgress,
  Stack,
  Avatar,
  Divider,
  alpha,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Sync as SyncIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  CloudSync as CloudSyncIcon,
  Computer as ComputerIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import { api, type AppStatus, type SyncStatus } from '../services/api';

export default function Dashboard() {
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const [appStatusData, syncStatusData] = await Promise.all([
        api.getAppStatus(),
        api.getSyncStatus(),
      ]);
      setAppStatus(appStatusData);
      setSyncStatus(syncStatusData);
    } catch (err: any) {
      console.error('Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string, apiCall: () => Promise<any>) => {
    setActionLoading(action);
    setMessage(null);

    try {
      const result = await apiCall();
      setMessage(result.message);
      await loadStatus();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const startApp = () => handleAction('start-app', api.startApp.bind(api));
  const stopApp = () => handleAction('stop-app', api.stopApp.bind(api));
  const startSync = () => handleAction('start-sync', api.startSync.bind(api));
  const stopSync = () => handleAction('stop-sync', api.stopSync.bind(api));
  const runSyncOnce = () =>
    handleAction('sync-once', api.runSyncOnce.bind(api));

  if (loading) {
    return (
      <Box sx={{ width: '100%' }}>
        <LinearProgress />
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography>Loading dashboard...</Typography>
          </CardContent>
        </Card>
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
        Dashboard
      </Typography>

      {message && (
        <Alert
          severity={message.includes('Error') ? 'error' : 'success'}
          sx={{ mb: 3 }}
        >
          {message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Application Status Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ mb: 2 }}
              >
                <Avatar
                  sx={{
                    bgcolor: appStatus?.isRunning
                      ? 'success.main'
                      : 'error.main',
                    width: 48,
                    height: 48,
                  }}
                >
                  <ComputerIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h2">
                    Application Status
                  </Typography>
                  <Chip
                    label={appStatus?.isRunning ? 'Running' : 'Stopped'}
                    color={appStatus?.isRunning ? 'success' : 'error'}
                    icon={
                      appStatus?.isRunning ? <CheckCircleIcon /> : <ErrorIcon />
                    }
                    variant="filled"
                  />
                </Box>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Stack spacing={2}>
                {!appStatus?.isRunning ? (
                  <Button
                    variant="contained"
                    startIcon={
                      actionLoading === 'start-app' ? (
                        <SyncIcon className="spin" />
                      ) : (
                        <PlayArrowIcon />
                      )
                    }
                    onClick={startApp}
                    disabled={actionLoading === 'start-app'}
                    fullWidth
                    size="large"
                  >
                    {actionLoading === 'start-app'
                      ? 'Starting...'
                      : 'Start Application'}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={
                      actionLoading === 'stop-app' ? (
                        <SyncIcon className="spin" />
                      ) : (
                        <StopIcon />
                      )
                    }
                    onClick={stopApp}
                    disabled={actionLoading === 'stop-app'}
                    fullWidth
                    size="large"
                  >
                    {actionLoading === 'stop-app'
                      ? 'Stopping...'
                      : 'Stop Application'}
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Sync Status Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ mb: 2 }}
              >
                <Avatar
                  sx={{
                    bgcolor: syncStatus?.inProgress
                      ? 'warning.main'
                      : syncStatus?.isRunning
                        ? 'success.main'
                        : 'error.main',
                    width: 48,
                    height: 48,
                  }}
                >
                  <CloudSyncIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h2">
                    Sync Status
                  </Typography>
                  <Chip
                    label={
                      syncStatus?.inProgress
                        ? 'Syncing in progress'
                        : syncStatus?.isRunning
                          ? `Running (every ${syncStatus.intervalSeconds}s)`
                          : 'Stopped'
                    }
                    color={
                      syncStatus?.inProgress
                        ? 'warning'
                        : syncStatus?.isRunning
                          ? 'success'
                          : 'error'
                    }
                    icon={
                      syncStatus?.inProgress ? (
                        <SyncIcon className="spin" />
                      ) : syncStatus?.isRunning ? (
                        <CheckCircleIcon />
                      ) : (
                        <ErrorIcon />
                      )
                    }
                    variant="filled"
                  />
                </Box>
              </Stack>

              {appStatus?.isRunning && (
                <>
                  <Divider sx={{ my: 2 }} />

                  <Stack spacing={2}>
                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        gutterBottom
                      >
                        Sync Interval: {syncStatus?.intervalSeconds} seconds
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Status:{' '}
                        {syncStatus?.inProgress
                          ? 'In Progress'
                          : syncStatus?.isRunning
                            ? 'Scheduled'
                            : 'Idle'}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1}>
                      {!syncStatus?.isRunning ? (
                        <Button
                          variant="contained"
                          startIcon={
                            actionLoading === 'start-sync' ? (
                              <SyncIcon className="spin" />
                            ) : (
                              <PlayArrowIcon />
                            )
                          }
                          onClick={startSync}
                          disabled={actionLoading === 'start-sync'}
                          size="small"
                        >
                          {actionLoading === 'start-sync'
                            ? 'Starting...'
                            : 'Start Auto Sync'}
                        </Button>
                      ) : (
                        <Button
                          variant="outlined"
                          startIcon={
                            actionLoading === 'stop-sync' ? (
                              <SyncIcon className="spin" />
                            ) : (
                              <StopIcon />
                            )
                          }
                          onClick={stopSync}
                          disabled={actionLoading === 'stop-sync'}
                          size="small"
                        >
                          {actionLoading === 'stop-sync'
                            ? 'Stopping...'
                            : 'Stop Auto Sync'}
                        </Button>
                      )}

                      <Button
                        variant="contained"
                        color="secondary"
                        startIcon={
                          actionLoading === 'sync-once' ? (
                            <SyncIcon className="spin" />
                          ) : (
                            <SyncIcon />
                          )
                        }
                        onClick={runSyncOnce}
                        disabled={
                          actionLoading === 'sync-once' ||
                          syncStatus?.inProgress
                        }
                        size="small"
                      >
                        {actionLoading === 'sync-once'
                          ? 'Syncing...'
                          : 'Run Once'}
                      </Button>
                    </Stack>
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Stats Cards */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar
                sx={{
                  bgcolor: 'primary.main',
                  width: 64,
                  height: 64,
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Typography variant="h4" component="div">
                  {appStatus?.isRunning ? '1' : '0'}
                </Typography>
              </Avatar>
              <Typography variant="h6" gutterBottom>
                Services Running
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active background services
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar
                sx={{
                  bgcolor: 'success.main',
                  width: 64,
                  height: 64,
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Typography variant="h4" component="div">
                  {syncStatus?.isRunning ? '✓' : '✗'}
                </Typography>
              </Avatar>
              <Typography variant="h6" gutterBottom>
                Auto Sync
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Automatic synchronization status
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar
                sx={{
                  bgcolor: 'warning.main',
                  width: 64,
                  height: 64,
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Typography variant="h4" component="div">
                  {syncStatus?.intervalSeconds || 0}
                </Typography>
              </Avatar>
              <Typography variant="h6" gutterBottom>
                Sync Interval
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Seconds between automatic syncs
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* System Information Card */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Information
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <ScheduleIcon color="primary" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Application
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        iCloud Frame Sync
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <CheckCircleIcon
                      color={appStatus?.isRunning ? 'success' : 'error'}
                    />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Status
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {appStatus?.isRunning ? 'Active' : 'Inactive'}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <TimerIcon color="primary" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Last Updated
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {new Date().toLocaleTimeString()}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </Box>
  );
}
