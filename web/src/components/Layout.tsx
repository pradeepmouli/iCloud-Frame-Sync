import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  IconButton,
  Tabs,
  Tab,
  Paper,
  alpha,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Tv as TvIcon,
  CloudSync as CloudSyncIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const navigationItems = [
    { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
    { label: 'Configuration', path: '/config', icon: <SettingsIcon /> },
    { label: 'Authentication', path: '/auth', icon: <SecurityIcon /> },
    { label: 'Photo Gallery', path: '/photos', icon: <PhotoLibraryIcon /> },
    { label: 'Frame Manager', path: '/frame', icon: <TvIcon /> },
  ];

  const currentTab = navigationItems.findIndex(item => item.path === location.pathname);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    navigate(navigationItems[newValue].path);
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* Glass AppBar */}
      <AppBar 
        position="sticky" 
        elevation={0}
        sx={{
          backgroundColor: alpha('#ffffff', 0.05),
          backdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: `1px solid ${alpha('#ffffff', 0.1)}`,
        }}
      >
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <CloudSyncIcon 
              sx={{ 
                mr: 2, 
                fontSize: 32,
                background: 'linear-gradient(45deg, #007AFF, #5AC8FA)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }} 
            />
            <Typography 
              variant="h5" 
              component="div" 
              sx={{ 
                fontWeight: 700,
                background: 'linear-gradient(45deg, #ffffff, #ffffff80)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
              }}
            >
              iCloud Frame Sync
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Glass Navigation */}
      <Container maxWidth="xl" sx={{ px: { xs: 2, sm: 3 } }}>
        <Paper 
          elevation={0}
          sx={{
            mt: 3,
            mb: 3,
            backgroundColor: alpha('#ffffff', 0.05),
            backdropFilter: 'blur(20px) saturate(180%)',
            border: `1px solid ${alpha('#ffffff', 0.1)}`,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <Tabs
            value={currentTab === -1 ? 0 : currentTab}
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{
              '& .MuiTab-root': {
                minHeight: 64,
                fontWeight: 600,
                fontSize: '0.95rem',
                color: alpha('#ffffff', 0.7),
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  color: '#ffffff',
                  backgroundColor: alpha('#ffffff', 0.05),
                },
                '&.Mui-selected': {
                  color: '#007AFF',
                  backgroundColor: alpha('#007AFF', 0.1),
                },
              },
              '& .MuiTabs-indicator': {
                background: 'linear-gradient(45deg, #007AFF, #5AC8FA)',
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
            }}
          >
            {navigationItems.map((item, index) => (
              <Tab
                key={item.path}
                label={item.label}
                icon={item.icon}
                iconPosition="start"
                sx={{
                  '& .MuiSvgIcon-root': {
                    mr: 1,
                    fontSize: 20,
                  },
                }}
              />
            ))}
          </Tabs>
        </Paper>

        {/* Main Content */}
        <Box sx={{ pb: 4 }}>
          {children}
        </Box>
      </Container>
    </Box>
  );
}