import {
	Info as InfoIcon,
	PhotoLibrary as PhotoLibraryIcon,
	Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
	Alert,
	Avatar,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	FormControl,
	GridLegacy as Grid,
	InputLabel,
	MenuItem,
	Select,
	Skeleton,
	Stack,
	Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../services/api';
import type { AlbumSummary, PhotoPage, PhotoSummary } from '../types/index';

const PAGE_SIZE = 24;

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'Unknown';
  }
  const suffixes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(suffixes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${suffixes[index]}`;
}

function formatDate(input: string | null): string {
  if (!input) {
    return 'Never';
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }
  return date.toLocaleString();
}

function resolveStatusColor(status: PhotoSummary['status']): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'uploaded':
      return 'success';
    case 'uploading':
      return 'warning';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

export default function PhotoGallery() {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [photoPage, setPhotoPage] = useState<PhotoPage | null>(null);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAlbums = useCallback(async (refresh: boolean = false) => {
    setLoadingAlbums(true);
    try {
      const albumList = await api.listAlbums(refresh);
      setAlbums(albumList);
      if (albumList.length > 0) {
        setSelectedAlbumId((current) => current || albumList[0].id);
      } else {
        setSelectedAlbumId('');
      }
      setErrorMessage(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load albums.';
      setErrorMessage(message);
      setAlbums([]);
      setSelectedAlbumId('');
    } finally {
      setLoadingAlbums(false);
    }
  }, []);

  const loadPhotos = useCallback(
    async (albumId: string, page: number = 1, refresh: boolean = false) => {
      if (!albumId) {
        setPhotoPage(null);
        return;
      }

      setLoadingPhotos(true);
      try {
        const pageResponse = await api.listPhotos({
          albumId,
          page,
          pageSize: PAGE_SIZE,
          refresh,
        });
        setPhotoPage(pageResponse);
        setErrorMessage(null);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load photos.';
        setErrorMessage(message);
        setPhotoPage(null);
      } finally {
        setLoadingPhotos(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadAlbums().catch(() => {
      setErrorMessage('Failed to load albums.');
    });
  }, [loadAlbums]);

  useEffect(() => {
    if (selectedAlbumId) {
      loadPhotos(selectedAlbumId).catch(() => {
        setErrorMessage('Failed to load photos.');
      });
    } else {
      setPhotoPage(null);
    }
  }, [loadPhotos, selectedAlbumId]);

  const handleAlbumChange = (event: SelectChangeEvent<string>) => {
    setSelectedAlbumId(event.target.value);
  };

  const handleRefreshAlbums = () => {
    loadAlbums(true).catch(() => {
      setErrorMessage('Failed to refresh albums from iCloud.');
    });
  };

  const handleRefreshPhotos = () => {
    if (!selectedAlbumId) {
      return;
    }
    const currentPage = photoPage?.pagination.page ?? 1;
    loadPhotos(selectedAlbumId, currentPage, true).catch(() => {
      setErrorMessage('Failed to refresh photos from iCloud.');
    });
  };

  const handlePageChange = (direction: 'previous' | 'next') => {
    if (!photoPage || !selectedAlbumId) {
      return;
    }
    const { page, pageSize, total } = photoPage.pagination;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const nextPage = direction === 'previous' ? page - 1 : page + 1;
    if (nextPage < 1 || nextPage > totalPages) {
      return;
    }
    loadPhotos(selectedAlbumId, nextPage).catch(() => {
      setErrorMessage('Failed to change page.');
    });
  };

  const currentAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? null,
    [albums, selectedAlbumId],
  );

  const totalPages = useMemo(() => {
    if (!photoPage) {
      return 0;
    }
    const { pageSize, total } = photoPage.pagination;
    if (pageSize <= 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(total / pageSize));
  }, [photoPage]);

  const hasAlbums = albums.length > 0;

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
        Photo Gallery
      </Typography>

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
              <PhotoLibraryIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" component="h2">
                Album Selection
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Browse all albums from your iCloud Photos library. Use "Refresh from iCloud" to fetch the latest albums.
              </Typography>
            </Box>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
            <FormControl sx={{ minWidth: 240 }} disabled={loadingAlbums || !hasAlbums}>
              <InputLabel id="album-select-label">Select Album</InputLabel>
              <Select
                labelId="album-select-label"
                value={selectedAlbumId}
                label="Select Album"
                onChange={handleAlbumChange}
              >
                {albums.map((album) => (
                  <MenuItem key={album.id} value={album.id}>
                    {album.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleRefreshAlbums}
                disabled={loadingAlbums}
              >
                {loadingAlbums ? 'Refreshing from iCloud…' : 'Refresh from iCloud'}
              </Button>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={handleRefreshPhotos}
                disabled={loadingPhotos || !selectedAlbumId}
              >
                {loadingPhotos ? 'Loading from iCloud…' : 'Refresh Photos from iCloud'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {loadingPhotos ? (
        <Grid container spacing={3}>
          {[...Array(6)].map((_, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
              <Card>
                <Skeleton variant="rectangular" height={200} />
                <CardContent>
                  <Skeleton variant="text" />
                  <Skeleton variant="text" width="60%" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : !photoPage || photoPage.items.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <PhotoLibraryIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              {selectedAlbumId
                ? 'No photos recorded for this album yet'
                : hasAlbums
                ? 'Select an album to begin'
                : 'No albums available'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {selectedAlbumId
                ? 'Sync operations will populate photo metadata after uploads complete.'
                : 'Albums will appear after the sync service reports them through the API.'}
            </Typography>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={selectedAlbumId ? handleRefreshPhotos : loadAlbums}
              disabled={loadingPhotos || loadingAlbums}
            >
              Refresh
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            spacing={2}
            sx={{ mb: 3 }}
          >
            <Box>
              <Typography variant="h6" gutterBottom>
                {currentAlbum ? currentAlbum.name : 'Album Photos'}
              </Typography>
              {currentAlbum && (
                <Typography variant="body2" color="text.secondary">
                  {currentAlbum.photoCount} photos • Last synced {formatDate(currentAlbum.lastSyncedAt)}
                </Typography>
              )}
            </Box>

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handlePageChange('previous')}
                disabled={photoPage.pagination.page <= 1 || loadingPhotos}
              >
                Previous
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handlePageChange('next')}
                disabled={photoPage.pagination.page >= totalPages || loadingPhotos}
              >
                Next
              </Button>
            </Stack>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Page {photoPage.pagination.page} of {totalPages}
          </Typography>

          <Grid container spacing={3}>
            {photoPage.items.map((photo: PhotoSummary) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={photo.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box
                    sx={{
                      height: 200,
                      bgcolor: 'background.paper',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PhotoLibraryIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                  </Box>

                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="subtitle1" component="h3">
                        Photo {photo.id}
                      </Typography>
                      <Chip
                        label={`Status: ${photo.status}`}
                        size="small"
                        icon={<InfoIcon />}
                        variant={photo.status === 'uploaded' ? 'filled' : 'outlined'}
                        color={resolveStatusColor(photo.status)}
                      />
                      <Typography variant="body2" color="text.secondary">
                        Album ID: {photo.albumId}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Taken: {formatDate(photo.takenAt)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Format: {photo.format.toUpperCase()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Size: {formatFileSize(photo.sizeBytes)}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
}
