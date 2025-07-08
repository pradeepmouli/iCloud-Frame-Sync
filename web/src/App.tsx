import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Box } from '@mui/material';
import { liquidGlassTheme } from './theme/liquidGlassTheme';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Configuration from './pages/Configuration';
import PhotoGallery from './pages/PhotoGallery';
import FrameManager from './pages/FrameManager';
import Authentication from './pages/Authentication';

function App() {
  return (
    <ThemeProvider theme={liquidGlassTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh' }}>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/config" element={<Configuration />} />
            <Route path="/photos" element={<PhotoGallery />} />
            <Route path="/frame" element={<FrameManager />} />
            <Route path="/auth" element={<Authentication />} />
          </Routes>
        </Layout>
      </Box>
    </ThemeProvider>
  );
}

export default App;