import {
	CloudUpload as CloudUploadIcon,
	Delete as DeleteIcon,
	Image as ImageIcon,
	Lightbulb as LightbulbIcon,
	PowerSettingsNew as PowerIcon,
	Refresh as RefreshIcon,
	Tv as TvIcon,
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
	Checkbox,
	Chip,
	Divider,
	FormControlLabel,
	GridLegacy as Grid,
	IconButton,
	LinearProgress,
	Stack,
	Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../services/api';
import type {
	FrameArtPage,
	FrameArtSummary,
	FramePowerStateResponse,
	FrameStatusSnapshot,
} from '../types/index';

const ART_PAGE_SIZE = 12;

// Serial thumbnail loader to prevent overwhelming the Frame TV
class ThumbnailLoader {
  private queue: Array<{ id: string; resolve: (url: string) => void; reject: (error: Error) => void }> = [];
  private loading = false;
  private cache = new Map<string, string>();

  async load(artId: string): Promise<string> {
    // Check cache first
    if (this.cache.has(artId)) {
      return this.cache.get(artId)!;
    }

    // Add to queue and wait
    return new Promise((resolve, reject) => {
      this.queue.push({ id: artId, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.loading || this.queue.length === 0) {
      return;
    }

    this.loading = true;
    const item = this.queue.shift()!;

    try {
      const url = `/api/frame/art/${item.id}/thumbnail`;
      // Pre-fetch to ensure it's loaded before resolving
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this.cache.set(item.id, objectUrl);
      item.resolve(objectUrl);
    } catch (error) {
      item.reject(error as Error);
    } finally {
      this.loading = false;
      // Small delay between requests to avoid overwhelming the TV
      setTimeout(() => this.processQueue(), 100);
    }
  }

  clearCache() {
    // Revoke all object URLs to free memory
    for (const url of this.cache.values()) {
      URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}

const thumbnailLoader = new ThumbnailLoader();

function formatDate(value?: string | null): string {
  if (!value) {
    return 'Unknown';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatDimensions(art: FrameArtSummary): string {
  if (art.width && art.height) {
    return `${art.width} × ${art.height}`;
  }
  return '—';
}

// Serial thumbnail component
function SerialThumbnail({ artId, alt, height }: { artId: string; alt: string; height: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    thumbnailLoader.load(artId)
      .then(url => {
        if (mounted) {
          setImageUrl(url);
        }
      })
      .catch(err => {
        console.error(`Failed to load thumbnail for ${artId}:`, err);
        if (mounted) {
          setError(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [artId]);

  if (error) {
    return (
      <Box
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
        }}
      >
        <ImageIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
      </Box>
    );
  }

  if (!imageUrl) {
    return (
      <Box
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
        }}
      >
        <LinearProgress sx={{ width: '80%' }} />
      </Box>
    );
  }

  return (
    <CardMedia
      component="img"
      height={height}
      image={imageUrl}
      alt={alt}
      sx={{
        objectFit: 'cover',
        bgcolor: 'background.paper',
      }}
    />
  );
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        if (result.includes(',')) {
          const [, base64] = result.split(',');
          resolve(base64 ?? '');
        } else {
          resolve(result);
        }
      } else {
  reject(new Error('Failed to read file data'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file data'));
    };
    reader.readAsDataURL(file);
  });
}

export default function FrameManager() {
  const [status, setStatus] = useState<FrameStatusSnapshot | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [configuredHost, setConfiguredHost] = useState<string | null>(null);
  const [artPage, setArtPage] = useState<FrameArtPage | null>(null);
  const [artError, setArtError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingArt, setLoadingArt] = useState(true);
  const [powerBusy, setPowerBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [setAsCurrent, setSetAsCurrent] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      // Always refresh configured host alongside live status to reflect recent saves
      const appStatus = await api.getStatus();
      const hostFromConfig = appStatus.config?.frameHost ?? null;
      setConfiguredHost(hostFromConfig);

      const snapshot = await api.getFrameStatus();
      setStatus(snapshot);
      setStatusError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load frame status.';
      setStatusError(message);
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadArt = useCallback(async (targetPage: number = 1) => {
    setLoadingArt(true);
    try {
      const response = await api.listFrameArt({ page: targetPage, pageSize: ART_PAGE_SIZE });
      setArtPage(response);
      setPage(response.pagination.page);
      setArtError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load frame art.';
      setArtError(message);
      setArtPage(null);
    } finally {
      setLoadingArt(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadArt(1);
  }, [loadStatus, loadArt]);

  const totalPages = useMemo(() => {
    if (!artPage) {
      return 1;
    }
    const { pageSize, total } = artPage.pagination;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [artPage]);

  const currentPage = artPage?.pagination.page ?? page;

  const handleRefreshStatus = useCallback(() => {
    setSuccessMessage(null);
    void loadStatus();
  }, [loadStatus]);

  const handleRefreshArt = useCallback(() => {
    setSuccessMessage(null);
    void loadArt(currentPage);
  }, [currentPage, loadArt]);

  const handlePageChange = useCallback(
    (direction: 'previous' | 'next') => {
      if (!artPage) {
        return;
      }
      const nextPage = direction === 'previous' ? currentPage - 1 : currentPage + 1;
      if (nextPage < 1 || nextPage > totalPages) {
        return;
      }
      setSuccessMessage(null);
      void loadArt(nextPage);
    },
    [artPage, currentPage, loadArt, totalPages],
  );

  const handlePowerToggle = useCallback(async () => {
    if (powerBusy) {
      return;
    }
    setPowerBusy(true);
    setSuccessMessage(null);
    try {
      const nextAction = status?.isOn ? 'off' : 'on';
      const response: FramePowerStateResponse = await api.setFramePower(nextAction);
      await loadStatus();
      setSuccessMessage(
        response.wasToggled
          ? `Frame turned ${response.isOn ? 'on' : 'off'}.`
          : 'Frame power state unchanged.',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update power state.';
      setStatusError(message);
    } finally {
      setPowerBusy(false);
    }
  }, [loadStatus, powerBusy, status?.isOn]);

  const handleDeleteArt = useCallback(
    async (artId: string) => {
      setSuccessMessage(null);
      try {
        await api.deleteFrameArt(artId);
        setArtError(null);
        setSuccessMessage('Art removed from frame.');
        await loadArt(currentPage);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to delete frame art.';
        setArtError(message);
      }
    },
    [currentPage, loadArt],
  );

  const handleSelectFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setUploading(true);
      setSuccessMessage(null);
      try {
        const base64 = await readFileAsBase64(file);
        if (!base64) {
          throw new Error('Selected file produced no data.');
        }
        await api.uploadFrameArt({
          filename: file.name,
          contentType: file.type,
          data: base64,
          setAsCurrent,
        });
        setArtError(null);
        setSuccessMessage('Art uploaded to frame.');
        await Promise.all([loadArt(1), loadStatus()]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to upload art.';
        setArtError(message);
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [loadArt, loadStatus, setAsCurrent],
  );

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

      <Stack spacing={2} sx={{ mb: 3 }}>
        {statusError && <Alert severity="error">{statusError}</Alert>}
        {artError && <Alert severity="error">{artError}</Alert>}
        {successMessage && <Alert severity="success">{successMessage}</Alert>}
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', width: 48, height: 48 }}>
                  <TvIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">Frame Status</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Review connectivity, power, and art mode indicators.
                  </Typography>
                </Box>
              </Stack>

              {loadingStatus ? (
                <LinearProgress sx={{ mt: 2 }} />
              ) : status ? (
                <Stack spacing={1} sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={status.isReachable ? 'Reachable' : 'Offline'}
                      color={status.isReachable ? 'success' : 'warning'}
                      size="small"
                    />
                    <Chip
                      label={status.isOn ? 'Powered On' : 'Powered Off'}
                      color={status.isOn ? 'primary' : 'default'}
                      size="small"
                    />
                    <Chip
                      label={status.inArtMode ? 'Art Mode' : 'TV Mode'}
                      size="small"
                    />
                  </Stack>
                  <Typography variant="body2">Host: {status.host}</Typography>
                  {configuredHost && configuredHost !== status.host && (
                    <Typography variant="caption" color="text.secondary">
                      Configured host: {configuredHost}
                    </Typography>
                  )}
                  <Typography variant="body2">
                    Last Checked: {formatDate(status.lastCheckedAt)}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LightbulbIcon fontSize="small" />
                    <Typography variant="body2">
                      Brightness: {status.brightness ?? '—'}
                    </Typography>
                  </Stack>
                  {status.device && (
                    <Box>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="subtitle2" gutterBottom>
                        Device Details
                      </Typography>
                      <Typography variant="body2">
                        Name: {status.device.name ?? '—'}
                      </Typography>
                      <Typography variant="body2">
                        Model: {status.device.model ?? '—'}
                      </Typography>
                      <Typography variant="body2">
                        Serial: {status.device.serialNumber ?? '—'}
                      </Typography>
                      <Typography variant="body2">
                        Firmware: {status.device.firmwareVersion ?? '—'}
                      </Typography>
                    </Box>
                  )}
                  {status.currentArt && (
                    <Box>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="subtitle2" gutterBottom>
                        Current Art
                      </Typography>
                      <Typography variant="body2">{status.currentArt.name}</Typography>
                      <Typography variant="body2">
                        Added: {formatDate(status.currentArt.addedAt)}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Unable to retrieve frame status. Verify the host information and retry.
                  {configuredHost && (
                    <>
                      {' '}Configured host: {configuredHost}
                    </>
                  )}
                </Typography>
              )}
            </CardContent>
            <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleRefreshStatus}
                disabled={loadingStatus}
              >
                Refresh Status
              </Button>
              <Button
                variant="contained"
                startIcon={<PowerIcon />}
                onClick={handlePowerToggle}
                disabled={loadingStatus || powerBusy}
                color={status?.isOn ? 'error' : 'primary'}
              >
                {powerBusy ? 'Updating…' : status?.isOn ? 'Power Off' : 'Power On'}
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                  <CloudUploadIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">Upload Art</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Upload a JPEG or PNG asset directly to your Frame.
                  </Typography>
                </Box>
              </Stack>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              <Stack spacing={2}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={setAsCurrent}
                      onChange={(event) => setSetAsCurrent(event.target.checked)}
                    />
                  }
                  label="Set as current art after upload"
                />
                <Button
                  variant="contained"
                  startIcon={<CloudUploadIcon />}
                  onClick={handleSelectFile}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : 'Choose File'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6">Available Art</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={handleRefreshArt}
                    disabled={loadingArt}
                  >
                    Refresh Art
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => handlePageChange('previous')}
                    disabled={loadingArt || currentPage <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => handlePageChange('next')}
                    disabled={loadingArt || currentPage >= totalPages}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>

              {loadingArt ? (
                <LinearProgress />
              ) : !artPage || artPage.items.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <ImageIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    No art found on the frame.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Upload art to populate this list.
                  </Typography>
                </Box>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Page {currentPage} of {totalPages}
                  </Typography>
                  <Grid container spacing={3}>
                    {artPage.items.map((art: FrameArtSummary) => {
                      const isCurrent = status?.currentArt?.id === art.id;
                      return (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={art.id}>
                          <Card
                            variant={isCurrent ? 'outlined' : undefined}
                            sx={{
                              height: '100%',
                              borderColor: isCurrent ? 'primary.main' : undefined,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                            }}
                          >
                            <SerialThumbnail
                              artId={art.id}
                              alt={art.name}
                              height="180"
                            />
                            <CardContent>
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                <ImageIcon color={isCurrent ? 'primary' : 'disabled'} />
                                <Typography variant="subtitle1" noWrap>
                                  {art.name}
                                </Typography>
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                Category: {art.categoryId ?? '—'}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Dimensions: {formatDimensions(art)}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Added: {formatDate(art.addedAt)}
                              </Typography>
                              {art.isFavorite && (
                                <Chip label="Favorite" color="secondary" size="small" sx={{ mt: 1 }} />
                              )}
                            </CardContent>
                            <CardActions sx={{ justifyContent: 'flex-end' }}>
                              <IconButton
                                aria-label={`Delete ${art.name}`}
                                onClick={() => handleDeleteArt(art.id)}
                                disabled={loadingArt}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </CardActions>
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
