import {
  Delete as DeleteIcon,
  DeviceHub as DeviceHubIcon,
  Info as InfoIcon,
  Palette as PaletteIcon,
  PowerSettingsNew as PowerIcon,
  Refresh as RefreshIcon,
  Tv as TvIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Chip,
  Divider,
  GridLegacy as Grid,
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import PhotoDetailModal from '../components/PhotoDetailModal';
import { api, type FrameArt, type FrameStatus } from '../services/api';

export default function FrameManager() {
  const [frameStatus, setFrameStatus] = useState<FrameStatus | null>(null);
  const [frameArt, setFrameArt] = useState<FrameArt[]>([]);
  const [loading, setLoading] = useState(true);
  const [artLoading, setArtLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<{
    [key: string]: boolean;
  }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [selectedArt, setSelectedArt] = useState<FrameArt | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  useEffect(() => {
    loadFrameStatus();
    loadFrameArt();
  }, []);

  const loadFrameStatus = async () => {
    try {
      const status = await api.getFrameStatus();
      setFrameStatus(status);
      setMessage(null);
    } catch (err: any) {
      setMessage(`Failed to load frame status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadFrameArt = async () => {
    setArtLoading(true);
    try {
      const result = await api.getFrameArt();
      setFrameArt(result.art);
    } catch (err: any) {
      console.error('Failed to load frame art:', err);
      setFrameArt([]);
    } finally {
      setArtLoading(false);
    }
  };

  const deleteArt = async (artId: string) => {
    setActionLoading({ ...actionLoading, [artId]: true });
    try {
      const result = await api.deleteFrameArt(artId);
      setMessage(result.message);
      await loadFrameArt();
    } catch (err: any) {
      setMessage(`Failed to delete art: ${err.message}`);
    } finally {
      setActionLoading({ ...actionLoading, [artId]: false });
    }
  };

  const refreshStatus = () => {
    setLoading(true);
    Promise.all([loadFrameStatus(), loadFrameArt()]);
  };

  const openDetailModal = (art: FrameArt) => {
    setSelectedArt(art);
    setDetailModalOpen(true);
  };

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedArt(null);
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
        Frame Manager
      </Typography>

      {message && (
        <Alert
          severity={
            message.includes('Error') || message.includes('Failed')
              ? 'error'
              : 'success'
          }
          sx={{ mb: 3 }}
        >
          {message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Frame Status Card */}
        <Grid item xs={12} lg={8}>
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
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" component="h2">
                    Samsung Frame TV Status
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Current device status and information
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={refreshStatus}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
              </Stack>

              {frameStatus ? (
                <Box>
                  <Grid container spacing={3} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6}>
                      <Paper
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          bgcolor: alpha('#ffffff', 0.02),
                        }}
                      >
                        <PowerIcon
                          sx={{
                            fontSize: 40,
                            color: frameStatus.isOn
                              ? 'success.main'
                              : 'error.main',
                            mb: 1,
                          }}
                        />
                        <Typography variant="h6" gutterBottom>
                          Power Status
                        </Typography>
                        <Chip
                          label={frameStatus.isOn ? 'ON' : 'OFF'}
                          color={frameStatus.isOn ? 'success' : 'error'}
                          variant="filled"
                        />
                      </Paper>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <Paper
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          bgcolor: alpha('#ffffff', 0.02),
                        }}
                      >
                        <PaletteIcon
                          sx={{
                            fontSize: 40,
                            color: frameStatus.inArtMode
                              ? 'success.main'
                              : 'error.main',
                            mb: 1,
                          }}
                        />
                        <Typography variant="h6" gutterBottom>
                          Art Mode
                        </Typography>
                        <Chip
                          label={frameStatus.inArtMode ? 'ACTIVE' : 'INACTIVE'}
                          color={frameStatus.inArtMode ? 'success' : 'error'}
                          variant="filled"
                        />
                      </Paper>
                    </Grid>
                  </Grid>

                  {frameStatus.deviceInfo && (
                    <Box>
                      <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ mt: 3, mb: 2 }}
                      >
                        <DeviceHubIcon
                          sx={{ verticalAlign: 'middle', mr: 1 }}
                        />
                        Device Information
                      </Typography>
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: alpha('#ffffff', 0.02),
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          overflow: 'auto',
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(frameStatus.deviceInfo, null, 2)}
                        </pre>
                      </Paper>
                    </Box>
                  )}
                </Box>
              ) : (
                <Alert severity="warning" variant="outlined">
                  <Typography variant="body1">
                    Unable to connect to Samsung Frame TV
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Please check your configuration and ensure the TV is on the
                    same network.
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions Card */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Stack spacing={2}>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<RefreshIcon />}
                  onClick={refreshStatus}
                  disabled={loading}
                >
                  Refresh Status
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<InfoIcon />}
                  disabled={!frameStatus}
                >
                  Device Info
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="body2" color="text.secondary">
                <strong>Connected:</strong> {frameStatus ? 'Yes' : 'No'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Art Count:</strong>{' '}
                {artLoading ? 'Loading...' : frameArt.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Art Gallery */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 3 }}
              >
                <Typography variant="h6">
                  Art on Frame ({frameArt.length})
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={loadFrameArt}
                  disabled={artLoading}
                >
                  {artLoading ? 'Loading...' : 'Refresh Art'}
                </Button>
              </Stack>

              {artLoading ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <RefreshIcon
                    sx={{
                      fontSize: 64,
                      color: 'primary.main',
                      mb: 2,
                      animation: 'spin 1s linear infinite',
                      '@keyframes spin': {
                        '0%': {
                          transform: 'rotate(0deg)',
                        },
                        '100%': {
                          transform: 'rotate(360deg)',
                        },
                      },
                    }}
                  />
                  <Typography variant="h6" gutterBottom>
                    Loading art thumbnails...
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Fetching art from your Samsung Frame TV
                  </Typography>
                </Box>
              ) : frameArt.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <PaletteIcon
                    sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
                  />
                  <Typography variant="h6" gutterBottom>
                    No art found on the Frame TV
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 3 }}
                  >
                    Art will appear here after photos are uploaded to your
                    Samsung Frame TV.
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={refreshStatus}
                    startIcon={<RefreshIcon />}
                  >
                    Refresh
                  </Button>
                </Box>
              ) : (
                <Grid container spacing={3}>
                  {frameArt.map((art) => (
                    <Grid
                      item
                      xs={12}
                      sm={6}
                      md={4}
                      lg={3}
                      key={art.id || art.name}
                    >
                      <Card
                        sx={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {art.thumbnail ? (
                          <CardMedia
                            component="img"
                            height="200"
                            image={art.thumbnail}
                            alt={art.name || 'Frame Art'}
                            sx={{
                              objectFit: 'cover',
                              transition: 'transform 0.3s ease-in-out',
                              '&:hover': {
                                transform: 'scale(1.05)',
                              },
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              height: 200,
                              bgcolor: alpha('#ffffff', 0.02),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexDirection: 'column',
                              gap: 1,
                            }}
                          >
                            <PaletteIcon
                              sx={{ fontSize: 48, color: 'text.secondary' }}
                            />
                            <Typography variant="body2" color="text.secondary">
                              No thumbnail available
                            </Typography>
                          </Box>
                        )}

                        <CardContent sx={{ flexGrow: 1 }}>
                          <Typography
                            variant="subtitle1"
                            component="h3"
                            gutterBottom
                            noWrap
                            title={art.name || art.id || 'Unknown'}
                          >
                            {art.name || art.id || 'Unknown'}
                          </Typography>

                          <Stack spacing={1}>
                            {art.dimensions &&
                              (art.dimensions.width > 0 ||
                                art.dimensions.height > 0) && (
                                <Chip
                                  label={`${art.dimensions.width} × ${art.dimensions.height}`}
                                  size="small"
                                  icon={<InfoIcon />}
                                  variant="outlined"
                                />
                              )}
                            {art.categoryId && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Category: {art.categoryId}
                              </Typography>
                            )}
                            {art.dateAdded && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Added:{' '}
                                {new Date(art.dateAdded).toLocaleDateString()}
                              </Typography>
                            )}
                            {art.matte && (
                              <Chip
                                label={`Matte: ${art.matte.type}`}
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            )}
                          </Stack>
                        </CardContent>

                        <CardActions sx={{ p: 2, pt: 0 }}>
                          <Stack spacing={1} sx={{ width: '100%' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<VisibilityIcon />}
                              onClick={() => openDetailModal(art)}
                              fullWidth
                            >
                              View Details
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              startIcon={<DeleteIcon />}
                              onClick={() => deleteArt(art.id || art.name)}
                              disabled={actionLoading[art.id || art.name]}
                              fullWidth
                            >
                              {actionLoading[art.id || art.name]
                                ? 'Deleting...'
                                : 'Delete from Frame'}
                            </Button>
                          </Stack>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Tips Card */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Frame Management Tips
              </Typography>
              <Stack spacing={1} component="ul" sx={{ pl: 2, m: 0 }}>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  Make sure your Samsung Frame TV is on the same network as this
                  application
                </Typography>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  The TV must be powered on to manage art and check status
                </Typography>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  Art Mode should be enabled on your TV to display uploaded
                  photos
                </Typography>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  Use the Photo Gallery to upload new photos to the Frame
                </Typography>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  Deleted art cannot be recovered unless you upload it again
                </Typography>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  Refresh the status if you've made changes directly on the TV
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Photo Detail Modal */}
      {selectedArt && (
        <PhotoDetailModal
          open={detailModalOpen}
          onClose={closeDetailModal}
          photo={selectedArt}
          photoType="frame"
        />
      )}
    </Box>
  );
}
