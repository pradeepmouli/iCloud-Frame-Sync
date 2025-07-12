# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an iCloud to Samsung Frame TV synchronization service that automatically downloads photos from a specified iCloud Photos album and uploads them to a Samsung Frame TV as art. The application runs continuously, periodically checking for new photos to sync.

## Architecture

The application has two modes of operation:

### CLI Mode (Original)

- **Application.ts**: Main application orchestrator that initializes and coordinates all services
- **PhotoSyncService**: Handles iCloud authentication, photo downloading, and uploading to Frame TV
- **FrameManager**: Manages Samsung Frame TV connection and art uploads
- **SyncScheduler**: Manages periodic synchronization with configurable intervals

### Web UI Mode (New)

- **WebServer**: Express API server that provides REST endpoints for web UI
- **React Frontend**: Modern web interface with routing for configuration and monitoring
- **API Integration**: Frontend communicates with backend via REST API

#### Web UI Features

- **Dashboard**: Real-time sync monitoring and control
- **Configuration**: iCloud and Samsung Frame settings with connection testing
- **Photo Gallery**: Browse iCloud albums, view photo metadata, manual sync controls
- **Frame Manager**: Samsung Frame TV status, art management, device information

## Development Commands

```bash
# CLI Application Development
npm run dev          # Start CLI app with hot reload using tsx
npm run start:deno   # Run with Deno runtime (alternative)

# Web UI Development
npm run dev:web      # Start both web server and React dev server
npm run dev:server   # Start web server only (port 3001)
npm run dev:client   # Start React dev server only (port 3000)

# Building
npm run build        # Build both server and client
npm run build:server # Compile TypeScript to dist/
npm run build:client # Build React app to dist/web/

# Running Production
npm start           # Run CLI app from dist/
npm run start:web   # Run web server from dist/

# Code Quality
npm run lint         # ESLint with auto-fix
npm run format       # Prettier formatting

# Testing
npm test            # Run all tests (unit + integration)
npm run test:unit   # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:watch  # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

## Configuration

The application uses environment variables for configuration. Key variables include:

### Core Settings

- `ICLOUD_USERNAME` / `ICLOUD_PASSWORD`: iCloud credentials
- `ICLOUD_SOURCE_ALBUM`: Album name to sync from (default: "Frame Sync")
- `SAMSUNG_FRAME_HOST`: Samsung TV IP address
- `ICLOUD_SYNC_INTERVAL`: Sync frequency in seconds (default: 60)
- `LOG_LEVEL`: Logging level (default: "info")

### Web UI Settings

- `WEB_PORT`: Web server port (default: 3001)
- `CORS_ORIGIN`: Allowed CORS origin (default: "http://localhost:3000")

## Key Dependencies

### Core Dependencies

- **icloudjs**: iCloud Photos API integration
- **samsung-frame-connect**: Samsung Frame TV API client
- **pino**: Structured logging
- **@dotenvx/dotenvx**: Environment variable management

### Web UI Dependencies

- **express**: Web server framework
- **cors**: Cross-origin resource sharing
- **react**: Frontend UI library
- **react-router-dom**: Client-side routing
- **vite**: Build tool for React app
- **concurrently**: Run multiple commands simultaneously

## Testing Structure

- Unit tests: `test/unit/` - Test individual components in isolation
- Integration tests: `test/integration/` - Test full application workflows
- Test framework: Mocha with tsx for TypeScript support

## Data Flow

1. Application starts and initializes all services
2. PhotoSyncService authenticates with iCloud
3. SyncScheduler begins periodic photo checking
4. For each new photo: download from iCloud → upload to Frame TV → delete from iCloud
5. Process continues until application shutdown

## Important Notes

- Photos are deleted from iCloud after successful upload to Frame TV
- The application maintains a connection to the Samsung Frame TV throughout operation
- MFA may be required for iCloud authentication on first run
- Credentials are cached locally for subsequent runs
- Please also refer to the instructions in the .github/instructions folder
