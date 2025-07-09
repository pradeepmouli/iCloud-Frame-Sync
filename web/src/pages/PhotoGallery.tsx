import {
  Delete as DeleteIcon,
  Info as InfoIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Refresh as RefreshIcon,
  Send as SendIcon,
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
  FormControl,
  GridLegacy as Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import PhotoDetailModal from '../components/PhotoDetailModal';
import { api, type Album, type Photo } from '../services/api';

/**
 * PhotoGallery component allows users to view and manage photos from their iCloud albums.
 * Users can select an album, view photos, send them to a Samsung Frame TV, or delete them from iCloud.
 */

export default function PhotoGallery() {
  const [albums, setAlbums] = useState<string[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>('Frame Sync');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<{ [key: string]: string }>(
    {},
  );
  const [message, setMessage] = useState<string | null>(null);

  // Photo detail modal state
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  useEffect(() => {
    loadAlbums();
  }, []);

  useEffect(() => {
    if (selectedAlbum) {
      loadPhotos(selectedAlbum);
    }
  }, [selectedAlbum]);

  const loadAlbums = async () => {
    try {
      const result = await api.getAlbums();
      setAlbums(result.albums);
    } catch (err: any) {
      setMessage(`Failed to load albums: ${err.message}`);
    }
  };

  const loadPhotos = async (albumName: string) => {
    setLoading(true);
    try {
      const result = await api.getPhotosInAlbum(albumName);
      setPhotos(result.photos);
      setMessage(null);
    } catch (err: any) {
      setMessage(`Failed to load photos: ${err.message}`);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  const sendToFrame = async (photoId: string) => {
    setActionLoading({ ...actionLoading, [photoId]: 'sending' });
    try {
      const result = await api.sendPhotoToFrame(photoId);
      setMessage(result.message);
    } catch (err: any) {
      setMessage(`Failed to send photo: ${err.message}`);
    } finally {
      setActionLoading({ ...actionLoading, [photoId]: '' });
    }
  };

  const deleteFromICloud = async (photoId: string) => {
    setActionLoading({ ...actionLoading, [photoId]: 'deleting' });
    try {
      const result = await api.deletePhotoFromICloud(photoId);
      setMessage(result.message);
      await loadPhotos(selectedAlbum);
    } catch (err: any) {
      setMessage(`Failed to delete photo: ${err.message}`);
    } finally {
      setActionLoading({ ...actionLoading, [photoId]: '' });
    }
  };

  // Modal handlers
  const openDetailModal = (photo: Photo) => {
    setSelectedPhoto(photo);
    setDetailModalOpen(true);
  };

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedPhoto(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
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
        Photo Gallery
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

      {/* Album Selection */}
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
                Choose an iCloud Photos album to browse
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={2} alignItems="center">
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Select Album</InputLabel>
              <Select
                value={selectedAlbum}
                onChange={(e) => setSelectedAlbum(e.target.value)}
                label="Select Album"
              >
                {albums.map((album) => (
                  <MenuItem key={album} value={album}>
                    {album}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => loadPhotos(selectedAlbum)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh Photos'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Photos Grid */}
      {loading ? (
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
      ) : photos.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <PhotoLibraryIcon
              sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
            />
            <Typography variant="h6" gutterBottom>
              No photos found in the selected album
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Make sure your application is running and connected to iCloud to
              see photos.
            </Typography>
            <Button
              variant="contained"
              onClick={() => loadPhotos(selectedAlbum)}
              startIcon={<RefreshIcon />}
            >
              Refresh
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box>
          <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
            Photos in "{selectedAlbum}" ({photos.length})
          </Typography>

          <Grid container spacing={3}>
            {photos.map((photo) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={photo.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {photo.filename ? (
                    <CardMedia
                      component="img"
                      height="200"
                      image={photo.thumbnailUrl || ''}
                      alt={photo.filename}
                      sx={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        height: 200,
                        bgcolor: 'background.paper',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <PhotoLibraryIcon
                        sx={{ fontSize: 48, color: 'text.secondary' }}
                      />
                    </Box>
                  )}

                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography
                      variant="subtitle1"
                      component="h3"
                      gutterBottom
                      noWrap
                    >
                      {photo.filename}
                    </Typography>

                    <Stack spacing={1}>
                      <Chip
                        label={`${photo.dimensions.width}px × ${photo.dimensions.height}px`}
                        size="small"
                        icon={<InfoIcon />}
                        variant="outlined"
                      />
                      <Typography variant="body2" color="text.secondary">
                        Size: {formatFileSize(photo.size)}
                      </Typography>
                      {/*  <Typography variant="body2" color="text.secondary">
                        Added: {photo?.addedDate?.toLocaleDateString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Created: {photo?.created?.toLocaleDateString()}
                      </Typography> */}
                    </Stack>
                  </CardContent>

                  <CardActions sx={{ p: 2, pt: 0 }}>
                    <Stack spacing={1} sx={{ width: '100%' }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<InfoIcon />}
                        onClick={() => openDetailModal(photo)}
                        fullWidth
                      >
                        View Details
                      </Button>

                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<SendIcon />}
                        onClick={() => sendToFrame(photo.id)}
                        disabled={actionLoading[photo.id] === 'sending'}
                        fullWidth
                      >
                        {actionLoading[photo.id] === 'sending'
                          ? 'Sending...'
                          : 'Send to Frame'}
                      </Button>

                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<DeleteIcon />}
                        onClick={() => deleteFromICloud(photo.id)}
                        disabled={actionLoading[photo.id] === 'deleting'}
                        fullWidth
                      >
                        {actionLoading[photo.id] === 'deleting'
                          ? 'Deleting...'
                          : 'Delete from iCloud'}
                      </Button>
                    </Stack>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Tips Card */}
      <Card sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Photo Management Tips
          </Typography>
          <Stack spacing={1} component="ul" sx={{ pl: 2, m: 0 }}>
            <Typography component="li" variant="body2" color="text.secondary">
              Photos are automatically synced when the application is running
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Use "Send to Frame" to manually upload specific photos to your
              Samsung Frame TV
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Deleting from iCloud will permanently remove the photo from your
              iCloud Photos
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              The automatic sync process will also delete photos from iCloud
              after uploading to Frame
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Refresh the gallery to see the latest photos from your iCloud
              album
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <PhotoDetailModal
          open={detailModalOpen}
          onClose={closeDetailModal}
          photo={selectedPhoto}
          photoType="gallery"
        />
      )}
    </Box>
  );
}
