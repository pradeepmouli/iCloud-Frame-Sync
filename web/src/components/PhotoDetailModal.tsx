import {
  AspectRatio as AspectRatioIcon,
  Camera as CameraIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  Image as ImageIcon,
  Info as InfoIcon,
  Palette as PaletteIcon,
  Schedule as ScheduleIcon,
  Share as ShareIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  GridLegacy as Grid,
  IconButton,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
  alpha,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { api, type FrameArt } from '../services/api';

interface PhotoDetailModalProps {
  open: boolean;
  onClose: () => void;
  photo: any; // Can be either a regular photo or FrameArt
  photoType: 'gallery' | 'frame';
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`photo-tabpanel-${index}`}
      aria-labelledby={`photo-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `photo-tab-${index}`,
    'aria-controls': `photo-tabpanel-${index}`,
  };
}

export default function PhotoDetailModal({
  open,
  onClose,
  photo,
  photoType,
}: PhotoDetailModalProps) {
  const [tabValue, setTabValue] = useState(0);
  const [exifData, setExifData] = useState<any>(null);
  const [loadingExif, setLoadingExif] = useState(false);
  const [exifError, setExifError] = useState<string | null>(null);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Load EXIF data when modal opens
  useEffect(() => {
    if (open && photo && tabValue === 1) {
      loadExifData();
    }
  }, [open, photo, tabValue]);

  const loadExifData = async () => {
    if (!photo) return;

    setLoadingExif(true);
    setExifError(null);

    try {
      let response;

      if (photoType === 'frame') {
        // Call Frame EXIF API
        response = await api.getFrameArtExif(photo.id);
      } else {
        // Call iCloud Photo EXIF API
        response = await api.getPhotoExif(photo.id);
      }

      if (response.success && response.exif) {
        setExifData(response.exif);
      } else {
        // No EXIF data available
        setExifData(null);
        setExifError(
          response.message || 'No EXIF data available for this photo',
        );
      }
    } catch (error: any) {
      setExifError(error.message || 'Failed to load EXIF data');
      setExifData(null);
    } finally {
      setLoadingExif(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: string | Date) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  if (!photo) return null;

  const imageUrl =
    photoType === 'frame'
      ? (photo as FrameArt).thumbnail
      : photo.thumbnailUrl || photo.thumbnail;

  const hasImage = !!imageUrl;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '80vh',
          background:
            'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(20,20,20,0.95) 100%)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {photoType === 'frame' ? (
            <PaletteIcon sx={{ color: 'primary.main' }} />
          ) : (
            <ImageIcon sx={{ color: 'primary.main' }} />
          )}
          <Typography variant="h6" component="div">
            {photo.name || photo.filename || 'Photo Details'}
          </Typography>
          <Chip
            label={photoType === 'frame' ? 'Frame Art' : 'Gallery Photo'}
            size="small"
            color={photoType === 'frame' ? 'secondary' : 'primary'}
            variant="outlined"
          />
        </Box>
        <IconButton onClick={onClose} size="large">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="photo detail tabs"
            sx={{ px: 3 }}
          >
            <Tab
              label="Preview & Details"
              icon={<InfoIcon />}
              iconPosition="start"
              {...a11yProps(0)}
            />
            <Tab
              label="EXIF Data"
              icon={<CameraIcon />}
              iconPosition="start"
              {...a11yProps(1)}
            />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            {/* Image Preview */}
            <Grid item xs={12} md={8}>
              <Card
                sx={{
                  height: '100%',
                  background: alpha('#ffffff', 0.02),
                }}
              >
                {hasImage ? (
                  <CardMedia
                    component="img"
                    image={imageUrl}
                    alt={photo.name || photo.filename}
                    sx={{
                      height: 400,
                      objectFit: 'contain',
                      bgcolor: 'background.paper',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      height: 400,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 2,
                      color: 'text.secondary',
                    }}
                  >
                    <ImageIcon sx={{ fontSize: 64 }} />
                    <Typography variant="h6">No preview available</Typography>
                  </Box>
                )}
              </Card>
            </Grid>

            {/* Photo Information */}
            <Grid item xs={12} md={4}>
              <Card
                sx={{
                  height: '100%',
                  background: alpha('#ffffff', 0.02),
                }}
              >
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Photo Information
                  </Typography>
                  <Divider sx={{ mb: 2 }} />

                  <Stack spacing={2}>
                    {/* Basic Info */}
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Filename
                      </Typography>
                      <Typography variant="body1">
                        {photo.filename || photo.name || 'Unknown'}
                      </Typography>
                    </Box>

                    {/* Dimensions */}
                    {photo.dimensions && (
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">
                          <AspectRatioIcon
                            sx={{
                              verticalAlign: 'middle',
                              mr: 0.5,
                              fontSize: 16,
                            }}
                          />
                          Dimensions
                        </Typography>
                        <Typography variant="body1">
                          {photo.dimensions.width} × {photo.dimensions.height}{' '}
                          pixels
                        </Typography>
                      </Box>
                    )}

                    {/* File Size */}
                    {photo.size && (
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">
                          <StorageIcon
                            sx={{
                              verticalAlign: 'middle',
                              mr: 0.5,
                              fontSize: 16,
                            }}
                          />
                          File Size
                        </Typography>
                        <Typography variant="body1">
                          {formatFileSize(photo.size)}
                        </Typography>
                      </Box>
                    )}

                    {/* Date Added/Created */}
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        <ScheduleIcon
                          sx={{
                            verticalAlign: 'middle',
                            mr: 0.5,
                            fontSize: 16,
                          }}
                        />
                        {photoType === 'frame' ? 'Date Added' : 'Date Created'}
                      </Typography>
                      <Typography variant="body1">
                        {formatDate(photo.dateAdded || photo.dateCreated)}
                      </Typography>
                    </Box>

                    {/* Frame-specific information */}
                    {photoType === 'frame' && (
                      <>
                        {photo.categoryId && (
                          <Box>
                            <Typography
                              variant="subtitle2"
                              color="text.secondary"
                            >
                              Category
                            </Typography>
                            <Chip
                              label={photo.categoryId}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        )}

                        {photo.matte && (
                          <Box>
                            <Typography
                              variant="subtitle2"
                              color="text.secondary"
                            >
                              Matte
                            </Typography>
                            <Typography variant="body1">
                              {photo.matte.type} - {photo.matte.color}
                            </Typography>
                          </Box>
                        )}

                        <Box>
                          <Typography
                            variant="subtitle2"
                            color="text.secondary"
                          >
                            Slideshow
                          </Typography>
                          <Chip
                            label={photo.slideshow ? 'Enabled' : 'Disabled'}
                            size="small"
                            color={photo.slideshow ? 'success' : 'default'}
                            variant="outlined"
                          />
                        </Box>
                      </>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {loadingExif ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>Loading EXIF data...</Typography>
            </Box>
          ) : exifError ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {exifError}
            </Alert>
          ) : exifData ? (
            <Grid container spacing={3}>
              {/* Camera Information */}
              <Grid item xs={12} md={6}>
                <Card sx={{ background: alpha('#ffffff', 0.02) }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Camera Information
                    </Typography>
                    <TableContainer
                      component={Paper}
                      sx={{ background: 'transparent' }}
                    >
                      <Table size="small">
                        <TableBody>
                          {exifData.Make && (
                            <TableRow>
                              <TableCell>Make</TableCell>
                              <TableCell>{exifData.Make}</TableCell>
                            </TableRow>
                          )}
                          {exifData.Model && (
                            <TableRow>
                              <TableCell>Model</TableCell>
                              <TableCell>{exifData.Model}</TableCell>
                            </TableRow>
                          )}
                          {exifData.Software && (
                            <TableRow>
                              <TableCell>Software</TableCell>
                              <TableCell>{exifData.Software}</TableCell>
                            </TableRow>
                          )}
                          {exifData.LensModel && (
                            <TableRow>
                              <TableCell>Lens</TableCell>
                              <TableCell>{exifData.LensModel}</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* Camera Settings */}
              <Grid item xs={12} md={6}>
                <Card sx={{ background: alpha('#ffffff', 0.02) }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Camera Settings
                    </Typography>
                    <TableContainer
                      component={Paper}
                      sx={{ background: 'transparent' }}
                    >
                      <Table size="small">
                        <TableBody>
                          {exifData.FNumber && (
                            <TableRow>
                              <TableCell>Aperture</TableCell>
                              <TableCell>f/{exifData.FNumber}</TableCell>
                            </TableRow>
                          )}
                          {exifData.ExposureTime && (
                            <TableRow>
                              <TableCell>Shutter Speed</TableCell>
                              <TableCell>
                                {exifData.ExposureTime < 1
                                  ? `1/${Math.round(1 / exifData.ExposureTime)}`
                                  : `${exifData.ExposureTime}s`}
                              </TableCell>
                            </TableRow>
                          )}
                          {exifData.ISO && (
                            <TableRow>
                              <TableCell>ISO</TableCell>
                              <TableCell>{exifData.ISO}</TableCell>
                            </TableRow>
                          )}
                          {exifData.FocalLength && (
                            <TableRow>
                              <TableCell>Focal Length</TableCell>
                              <TableCell>{exifData.FocalLength}mm</TableCell>
                            </TableRow>
                          )}
                          {exifData.Flash !== undefined && (
                            <TableRow>
                              <TableCell>Flash</TableCell>
                              <TableCell>
                                {exifData.Flash === 0
                                  ? 'No Flash'
                                  : 'Flash Fired'}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* GPS/Location Information */}
              {(exifData.GPSLatitude || exifData.GPSLongitude) && (
                <Grid item xs={12} md={6}>
                  <Card sx={{ background: alpha('#ffffff', 0.02) }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Location
                      </Typography>
                      <TableContainer
                        component={Paper}
                        sx={{ background: 'transparent' }}
                      >
                        <Table size="small">
                          <TableBody>
                            {exifData.GPSLatitude && (
                              <TableRow>
                                <TableCell>Latitude</TableCell>
                                <TableCell>{exifData.GPSLatitude}°</TableCell>
                              </TableRow>
                            )}
                            {exifData.GPSLongitude && (
                              <TableRow>
                                <TableCell>Longitude</TableCell>
                                <TableCell>{exifData.GPSLongitude}°</TableCell>
                              </TableRow>
                            )}
                            {exifData.GPSAltitude && (
                              <TableRow>
                                <TableCell>Altitude</TableCell>
                                <TableCell>{exifData.GPSAltitude}m</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Timestamp Information */}
              <Grid item xs={12} md={6}>
                <Card sx={{ background: alpha('#ffffff', 0.02) }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Timestamps
                    </Typography>
                    <TableContainer
                      component={Paper}
                      sx={{ background: 'transparent' }}
                    >
                      <Table size="small">
                        <TableBody>
                          {exifData.DateTimeOriginal && (
                            <TableRow>
                              <TableCell>Date Taken</TableCell>
                              <TableCell>
                                {formatDate(exifData.DateTimeOriginal)}
                              </TableCell>
                            </TableRow>
                          )}
                          {exifData.DateTime && (
                            <TableRow>
                              <TableCell>Date Modified</TableCell>
                              <TableCell>
                                {formatDate(exifData.DateTime)}
                              </TableCell>
                            </TableRow>
                          )}
                          {exifData.CreateDate && (
                            <TableRow>
                              <TableCell>Date Created</TableCell>
                              <TableCell>
                                {formatDate(exifData.CreateDate)}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* Raw EXIF Data */}
              <Grid item xs={12}>
                <Card sx={{ background: alpha('#ffffff', 0.02) }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      All EXIF Data
                    </Typography>
                    <TableContainer
                      component={Paper}
                      sx={{ background: 'transparent', maxHeight: 300 }}
                    >
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Field</TableCell>
                            <TableCell>Value</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(exifData).map(([key, value]) => (
                            <TableRow key={key}>
                              <TableCell>{key}</TableCell>
                              <TableCell>
                                {typeof value === 'object' && value !== null
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : (
            <Alert severity="info">
              No EXIF data available for this image.
            </Alert>
          )}
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Stack direction="row" spacing={2}>
          <Button
            startIcon={<DownloadIcon />}
            variant="outlined"
            disabled={!hasImage}
          >
            Download
          </Button>
          <Button
            startIcon={<ShareIcon />}
            variant="outlined"
            disabled={!hasImage}
          >
            Share
          </Button>
          <Button onClick={onClose} variant="contained">
            Close
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
