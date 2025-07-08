import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  GridLegacy as Grid,
  Alert,
  Stack,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Cloud as CloudIcon,
  Tv as TvIcon,
  Settings as SettingsIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { api, type Config } from '../services/api';

export default function Configuration() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({ icloud: false, frame: false });
  const [testResults, setTestResults] = useState<{
    icloud?: string;
    frame?: string;
  }>({});
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const configData = await api.getConfig();
      setConfig(configData);
    } catch (err: any) {
      setError(`Failed to load configuration: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    section: keyof Config,
    field: string,
    value: string | number,
  ) => {
    if (!config) return;

    setConfig({
      ...config,
      [section]: {
        ...config[section],
        [field]: value,
      },
    });
  };

  const testICloudConnection = async () => {
    if (!config || !password) {
      setTestResults({
        ...testResults,
        icloud: 'Please enter username and password',
      });
      return;
    }

    setTesting({ ...testing, icloud: true });
    try {
      const result = await api.testICloudConnection({
        username: config.iCloud.username,
        password,
      });

      if (result.success) {
        setTestResults({
          ...testResults,
          icloud: `✓ ${result.status || 'Connected successfully'}`,
        });
      } else {
        setTestResults({ ...testResults, icloud: `✗ Failed: ${result.error}` });
      }
    } catch (err: any) {
      setTestResults({ ...testResults, icloud: `✗ Error: ${err.message}` });
    } finally {
      setTesting({ ...testing, icloud: false });
    }
  };

  const testFrameConnection = async () => {
    if (!config || !config.frame.host) {
      setTestResults({
        ...testResults,
        frame: 'Please enter frame host IP address',
      });
      return;
    }

    setTesting({ ...testing, frame: true });
    try {
      const result = await api.testFrameConnection({
        host: config.frame.host,
      });

      if (result.success) {
        setTestResults({
          ...testResults,
          frame: `✓ ${result.message || 'Connected successfully'}`,
        });
      } else {
        setTestResults({ ...testResults, frame: `✗ Failed: ${result.error}` });
      }
    } catch (err: any) {
      setTestResults({ ...testResults, frame: `✗ Error: ${err.message}` });
    } finally {
      setTesting({ ...testing, frame: false });
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    setSaving(true);
    try {
      await api.updateConfig(config);
      setError(null);
    } catch (err: any) {
      setError(`Failed to save configuration: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography>Loading configuration...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent>
          <Typography>Failed to load configuration</Typography>
        </CardContent>
      </Card>
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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* iCloud Settings */}
        <Grid item xs={12} lg={6}>
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
                    iCloud Settings
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure your Apple ID and photo album
                  </Typography>
                </Box>
              </Stack>

              <Stack spacing={3}>
                <TextField
                  label="Apple ID (Username)"
                  type="email"
                  value={config.iCloud.username}
                  onChange={(e) =>
                    handleInputChange('iCloud', 'username', e.target.value)
                  }
                  placeholder="your-apple-id@example.com"
                  fullWidth
                  variant="outlined"
                />

                <TextField
                  label="Password (for testing only)"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your iCloud password"
                  fullWidth
                  variant="outlined"
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? (
                          <VisibilityOffIcon />
                        ) : (
                          <VisibilityIcon />
                        )}
                      </IconButton>
                    ),
                  }}
                  helperText="Password is only used for testing. Actual authentication uses environment variables."
                />

                <TextField
                  label="Source Album"
                  value={config.iCloud.sourceAlbum}
                  onChange={(e) =>
                    handleInputChange('iCloud', 'sourceAlbum', e.target.value)
                  }
                  placeholder="Frame Sync"
                  fullWidth
                  variant="outlined"
                  helperText="Name of the iCloud Photos album to sync from"
                />

                <Divider />

                <Box>
                  <Button
                    variant="contained"
                    startIcon={
                      testing.icloud ? (
                        <SyncIcon className="spin" />
                      ) : (
                        <CloudIcon />
                      )
                    }
                    onClick={testICloudConnection}
                    disabled={testing.icloud}
                    sx={{ mb: 2 }}
                  >
                    {testing.icloud ? 'Testing...' : 'Test iCloud Connection'}
                  </Button>

                  {testResults.icloud && (
                    <Alert
                      severity={
                        testResults.icloud.startsWith('✓') ? 'success' : 'error'
                      }
                      variant="outlined"
                    >
                      {testResults.icloud}
                    </Alert>
                  )}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Samsung Frame Settings */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ mb: 3 }}
              >
                <Avatar
                  sx={{ bgcolor: 'secondary.main', width: 48, height: 48 }}
                >
                  <TvIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h2">
                    Samsung Frame Settings
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure your Samsung Frame TV connection
                  </Typography>
                </Box>
              </Stack>

              <Stack spacing={3}>
                <TextField
                  label="Frame TV IP Address"
                  value={config.frame.host}
                  onChange={(e) =>
                    handleInputChange('frame', 'host', e.target.value)
                  }
                  placeholder="192.168.1.100"
                  fullWidth
                  variant="outlined"
                  helperText="Find your TV's IP address in Settings → General → Network → Network Status"
                />

                <Divider />

                <Box>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={
                      testing.frame ? <SyncIcon className="spin" /> : <TvIcon />
                    }
                    onClick={testFrameConnection}
                    disabled={testing.frame}
                    sx={{ mb: 2 }}
                  >
                    {testing.frame ? 'Testing...' : 'Test Frame Connection'}
                  </Button>

                  {testResults.frame && (
                    <Alert
                      severity={
                        testResults.frame.startsWith('✓') ? 'success' : 'error'
                      }
                      variant="outlined"
                    >
                      {testResults.frame}
                    </Alert>
                  )}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Sync Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ mb: 3 }}
              >
                <Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48 }}>
                  <SettingsIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h2">
                    Sync Settings
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure synchronization behavior and logging
                  </Typography>
                </Box>
              </Stack>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Sync Interval (seconds)"
                    type="number"
                    value={config.syncIntervalSeconds}
                    onChange={(e) =>
                      handleInputChange(
                        '',
                        'syncIntervalSeconds',
                        parseInt(e.target.value),
                      )
                    }
                    inputProps={{ min: 30, max: 3600 }}
                    fullWidth
                    variant="outlined"
                    helperText="How often to check for new photos (30-3600 seconds)"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Log Level</InputLabel>
                    <Select
                      value={config.logLevel}
                      onChange={(e) =>
                        handleInputChange('', 'logLevel', e.target.value)
                      }
                      label="Log Level"
                    >
                      <MenuItem value="error">Error</MenuItem>
                      <MenuItem value="warn">Warning</MenuItem>
                      <MenuItem value="info">Info</MenuItem>
                      <MenuItem value="debug">Debug</MenuItem>
                      <MenuItem value="trace">Trace</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Save Configuration */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Save Configuration
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Save your settings to apply changes
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={
                    saving ? <SyncIcon className="spin" /> : <CheckCircleIcon />
                  }
                  onClick={saveConfig}
                  disabled={saving}
                  sx={{ minWidth: 160 }}
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </Stack>
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
