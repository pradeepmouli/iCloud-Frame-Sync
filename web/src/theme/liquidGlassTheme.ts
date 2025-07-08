import { createTheme, alpha } from '@mui/material/styles';

// Apple-inspired liquid glass theme
export const liquidGlassTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#007AFF', // Apple Blue
      light: '#5AC8FA',
      dark: '#0051D0',
    },
    secondary: {
      main: '#FF9500', // Apple Orange
      light: '#FFCC02',
      dark: '#FF6D00',
    },
    success: {
      main: '#34C759', // Apple Green
      light: '#30D158',
      dark: '#248A3D',
    },
    warning: {
      main: '#FF9500', // Apple Orange
      light: '#FFCC02',
      dark: '#FF6D00',
    },
    error: {
      main: '#FF3B30', // Apple Red
      light: '#FF6961',
      dark: '#D70015',
    },
    background: {
      default: 'rgba(0, 0, 0, 0.85)',
      paper: 'rgba(255, 255, 255, 0.05)',
    },
    text: {
      primary: 'rgba(255, 255, 255, 0.95)',
      secondary: 'rgba(255, 255, 255, 0.7)',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"SF Pro Display"',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.125rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.4,
    },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: `
            radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.2) 0%, transparent 50%)
          `,
          backgroundColor: '#000',
          minHeight: '100vh',
        },
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent',
        },
        '*::-webkit-scrollbar': {
          width: '8px',
        },
        '*::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          border: 'none',
        },
        '*::-webkit-scrollbar-thumb:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: alpha('#ffffff', 0.05),
          backdropFilter: 'blur(20px) saturate(180%)',
          border: `1px solid ${alpha('#ffffff', 0.1)}`,
          borderRadius: 16,
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: alpha('#ffffff', 0.05),
          backdropFilter: 'blur(20px) saturate(180%)',
          border: `1px solid ${alpha('#ffffff', 0.1)}`,
          borderRadius: 16,
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: `
              0 12px 40px rgba(0, 0, 0, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.15)
            `,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.95rem',
          padding: '10px 24px',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: `1px solid ${alpha('#ffffff', 0.1)}`,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)',
          },
        },
        contained: {
          backgroundColor: alpha('#007AFF', 0.8),
          '&:hover': {
            backgroundColor: alpha('#007AFF', 0.9),
          },
        },
        outlined: {
          backgroundColor: alpha('#ffffff', 0.05),
          borderColor: alpha('#ffffff', 0.2),
          '&:hover': {
            backgroundColor: alpha('#ffffff', 0.1),
            borderColor: alpha('#ffffff', 0.3),
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: alpha('#ffffff', 0.05),
            backdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 12,
            '& fieldset': {
              borderColor: alpha('#ffffff', 0.2),
            },
            '&:hover fieldset': {
              borderColor: alpha('#ffffff', 0.3),
            },
            '&.Mui-focused fieldset': {
              borderColor: '#007AFF',
              borderWidth: 2,
            },
          },
          '& .MuiInputLabel-root': {
            color: alpha('#ffffff', 0.7),
          },
          '& .MuiInputBase-input': {
            color: '#ffffff',
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#ffffff', 0.05),
          backdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 12,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#ffffff', 0.2),
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#ffffff', 0.3),
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#007AFF',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#ffffff', 0.1),
          backdropFilter: 'blur(20px) saturate(180%)',
          border: `1px solid ${alpha('#ffffff', 0.2)}`,
          color: '#ffffff',
          '&.MuiChip-colorPrimary': {
            backgroundColor: alpha('#007AFF', 0.2),
            borderColor: alpha('#007AFF', 0.4),
          },
          '&.MuiChip-colorSuccess': {
            backgroundColor: alpha('#34C759', 0.2),
            borderColor: alpha('#34C759', 0.4),
          },
          '&.MuiChip-colorError': {
            backgroundColor: alpha('#FF3B30', 0.2),
            borderColor: alpha('#FF3B30', 0.4),
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#ffffff', 0.05),
          backdropFilter: 'blur(20px) saturate(180%)',
          border: `1px solid ${alpha('#ffffff', 0.1)}`,
          boxShadow: 'none',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#ffffff', 0.05),
          backdropFilter: 'blur(20px) saturate(180%)',
          border: `1px solid ${alpha('#ffffff', 0.1)}`,
          borderRadius: 12,
          color: '#ffffff',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#ffffff', 0.1),
          borderRadius: 4,
          height: 6,
        },
        bar: {
          borderRadius: 4,
        },
      },
    },
  },
});