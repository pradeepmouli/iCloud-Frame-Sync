import {
  Computer as ComputerIcon,
  Phone as PhoneIcon,
  Security as SecurityIcon,
  Watch as WatchIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import React, { useEffect, useState } from 'react';

interface MfaDialogProps {
  open: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

export default function MfaDialog({
  open,
  onSubmit,
  onCancel,
  loading = false,
  error = null,
}: MfaDialogProps) {
  const [mfaCode, setMfaCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMfaCode('');
      setLocalError(null);
    }
  }, [open]);

  const handleSubmit = () => {
    if (!mfaCode.trim()) {
      setLocalError('Please enter the verification code');
      return;
    }

    if (mfaCode.length !== 6) {
      setLocalError('Verification code must be 6 digits');
      return;
    }

    setLocalError(null);
    onSubmit(mfaCode);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && mfaCode.length === 6 && !loading) {
      handleSubmit();
    }
  };

  const displayError = error || localError;

  return (
    <Dialog
      open={open}
      onClose={() => {}} // Prevent closing by clicking outside
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: alpha('#ffffff', 0.05),
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
      }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={2}>
          <SecurityIcon
            sx={{
              color: 'primary.main',
              fontSize: 32,
            }}
          />
          <Box>
            <Typography variant="h6" component="div">
              Two-Factor Authentication
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Apple has sent a verification code to your trusted devices
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent>
        {loading && (
          <LinearProgress
            sx={{
              mb: 2,
              borderRadius: 2,
              height: 6,
            }}
          />
        )}

        {/* Device Icons */}
        <Stack
          direction="row"
          justifyContent="center"
          spacing={3}
          sx={{ mb: 3 }}
        >
          <Box sx={{ textAlign: 'center', opacity: 0.7 }}>
            <PhoneIcon
              sx={{ fontSize: 32, mb: 0.5, color: 'text.secondary' }}
            />
            <Typography variant="caption" display="block">
              iPhone
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center', opacity: 0.7 }}>
            <WatchIcon
              sx={{ fontSize: 32, mb: 0.5, color: 'text.secondary' }}
            />
            <Typography variant="caption" display="block">
              Apple Watch
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center', opacity: 0.7 }}>
            <ComputerIcon
              sx={{ fontSize: 32, mb: 0.5, color: 'text.secondary' }}
            />
            <Typography variant="caption" display="block">
              Mac
            </Typography>
          </Box>
        </Stack>

        <TextField
          label="Verification Code"
          value={mfaCode}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, '').slice(0, 6);
            setMfaCode(value);
            setLocalError(null);
          }}
          onKeyPress={handleKeyPress}
          placeholder="000000"
          fullWidth
          variant="outlined"
          disabled={loading}
          autoFocus
          inputProps={{
            maxLength: 6,
            style: {
              textAlign: 'center',
              fontSize: '1.5rem',
              letterSpacing: '0.5rem',
              fontFamily: 'monospace',
              fontWeight: 'bold',
            },
          }}
          helperText="Enter the 6-digit code from your Apple device"
          error={!!displayError}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
            },
          }}
        />

        {displayError && (
          <Alert
            severity="error"
            sx={{
              mt: 2,
              borderRadius: 2,
            }}
          >
            {displayError}
          </Alert>
        )}

        <Box
          sx={{ mt: 3, p: 2, bgcolor: alpha('#ffffff', 0.02), borderRadius: 2 }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            <strong>Didn't receive a code?</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • Check your iPhone, iPad, Mac, or Apple Watch • Make sure your
            devices are signed in to iCloud • The code expires after a few
            minutes
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button onClick={onCancel} disabled={loading} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || mfaCode.length !== 6}
          sx={{ minWidth: 100 }}
        >
          {loading ? 'Verifying...' : 'Verify'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
