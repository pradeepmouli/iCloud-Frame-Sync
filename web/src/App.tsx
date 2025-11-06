import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Configuration from './pages/Configuration';
import Dashboard from './pages/Dashboard';
import FrameManager from './pages/FrameManager';
import PhotoGallery from './pages/PhotoGallery';
import { liquidGlassTheme } from './theme/liquidGlassTheme';

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
          </Routes>
        </Layout>
      </Box>
    </ThemeProvider>
  );
}

export default App;