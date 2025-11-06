# iCloud Frame Sync

An automated service that synchronizes photos from iCloud Photos to Samsung Frame TVs. The application continuously monitors a specified iCloud Photos album and uploads new photos to your Samsung Frame TV as art, then removes them from iCloud to save storage space.

## Features

- **Automatic Synchronization**: Continuously monitors iCloud Photos for new images with intelligent retry logic and exponential backoff
- **Samsung Frame TV Integration**: Uploads photos directly to your Frame TV as art with automatic reconnection
- **Two Operation Modes**: CLI commands and Web UI interface
- **Storage Management**: Automatically removes photos from iCloud after successful upload
- **Web Dashboard**: Modern React-based interface for monitoring and configuration
- **MFA Support**: Handles iCloud two-factor authentication seamlessly
- **Connection Testing**: Test iCloud and Frame TV connectivity before syncing
- **Configurable Sync Intervals**: Customize how often the service checks for new photos
- **CLI Commands**: Start, stop, and check status of sync service from command line
- **Resilient Operations**: Automatic reconnection to Frame TV, pause/resume capabilities, and graceful error handling
- **Smart Thumbnail Generation**: Server-side thumbnail generation for user-uploaded photos with intelligent caching

## Architecture

### CLI Mode (Original)
- **Application.ts**: Main application orchestrator that initializes and coordinates all services
- **PhotoSyncService**: Handles iCloud authentication, photo downloading, and uploading to Frame TV
- **FrameManager**: Manages Samsung Frame TV connection and art uploads
- **SyncScheduler**: Manages periodic synchronization with configurable intervals

### Web UI Mode
- **WebServer**: Express API server that provides REST endpoints for web UI
- **React Frontend**: Modern web interface with routing for configuration and monitoring
- **API Integration**: Frontend communicates with backend via REST API
- **ThumbnailService**: Server-side thumbnail generation and caching for Frame TV photos

#### Web UI Features
- **Dashboard**: Real-time sync monitoring and control
- **Configuration**: iCloud and Samsung Frame settings with connection testing
- **Photo Gallery**: Browse iCloud albums, view photo metadata, manual sync controls
- **Frame Manager**: Samsung Frame TV status, art management, device information

## Installation

1. Install [Node.js](https://nodejs.org/en/download/) (v18 or later)
2. Clone this repository:
   ```bash
   git clone https://github.com/pradeepmouli/iCloud-Frame-Sync.git
   cd iCloud-Frame-Sync
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Create a `.env` file in the root directory with your configuration:

```env
# iCloud Settings
ICLOUD_USERNAME=your-icloud-email@icloud.com
ICLOUD_PASSWORD=your-app-specific-password
ICLOUD_SOURCE_ALBUM=Frame Sync

# Samsung Frame TV Settings
SAMSUNG_FRAME_HOST=192.168.1.100

# Optional Settings
ICLOUD_SYNC_INTERVAL=60
LOG_LEVEL=info
WEB_PORT=3001
CORS_ORIGIN=http://localhost:3000
```

### Configuration Variables

#### Core Settings
- `ICLOUD_USERNAME` / `ICLOUD_PASSWORD`: iCloud credentials (use app-specific password)
- `ICLOUD_SOURCE_ALBUM`: Album name to sync from (default: "Frame Sync")
- `SAMSUNG_FRAME_HOST`: Samsung TV IP address
- `ICLOUD_SYNC_INTERVAL`: Sync frequency in seconds (default: 60)
- `LOG_LEVEL`: Logging level (default: "info")

#### Web UI Settings
- `WEB_PORT`: Web server port (default: 3001)
- `CORS_ORIGIN`: Allowed CORS origin (default: "http://localhost:3000")

## Usage

### CLI Commands

The application provides several CLI commands for managing the sync service:

```bash
# Start the sync service
npm start sync:start

# Check the status of the sync service
npm start sync:status

# Stop the sync service
npm start sync:stop
```

#### Using the CLI directly (after build)

If you've installed the package globally or built the application:

```bash
# Start the sync service
icloud-frame-sync sync:start

# Check the status
icloud-frame-sync sync:status

# Stop the service
icloud-frame-sync sync:stop
```

### CLI Mode (Long-running Service)

#### Development
```bash
npm run dev          # Start CLI app with hot reload
```

#### Production
```bash
npm run build        # Build the application
npm start           # Run CLI app from dist/
```

### Web UI Mode

#### Development
```bash
npm run dev:web      # Start both web server and React dev server
npm run dev:server   # Start web server only (port 3001)
npm run dev:client   # Start React dev server only (port 3000)
```

#### Production
```bash
npm run build        # Build both server and client
npm run start:web    # Run web server from dist/
```

#### Web UI Features

Once the web server is running, access the dashboard at `http://localhost:3001`:

- **Dashboard**: Monitor sync status, view sync history, and manually trigger syncs
- **Configuration**:
  - Configure iCloud credentials and test connection
  - Set Samsung Frame TV host and verify connectivity
  - Handle MFA authentication flow
  - Adjust sync interval and other settings
- **Photo Gallery**: Browse iCloud albums, view photo details, manually sync specific photos
- **Frame Manager**: View Frame TV status, manage art, and control device settings

### Alternative Runtime
```bash
npm run start:deno   # Run with Deno runtime
```

## Docker

### Quick Start

1. Build the Docker image:
   ```bash
   docker build -t icloud-frame-sync .
   ```

2. Run the container with environment file:
   ```bash
   docker run -d \
     --name icloud-frame-sync \
     --env-file .env \
     -p 3001:3001 \
     icloud-frame-sync
   ```

3. Or run with individual environment variables:
   ```bash
   docker run -d \
     --name icloud-frame-sync \
     -e ICLOUD_USERNAME=your-email@icloud.com \
     -e ICLOUD_PASSWORD=your-app-password \
     -e ICLOUD_SOURCE_ALBUM="Frame Sync" \
     -e SAMSUNG_FRAME_HOST=192.168.1.100 \
     -p 3001:3001 \
     icloud-frame-sync
   ```

### Docker Configuration

The Docker image:
- Uses **pnpm** for dependency management (faster, more efficient)
- Runs in **production mode** with the web server enabled
- Exposes **port 3001** for the web dashboard
- Includes optimized `.dockerignore` for smaller image size
- Uses **frozen lockfile** for reproducible builds

### Docker Management

```bash
# View logs
docker logs icloud-frame-sync

# Follow logs in real-time
docker logs -f icloud-frame-sync

# Stop the container
docker stop icloud-frame-sync

# Start the container
docker start icloud-frame-sync

# Remove the container
docker rm icloud-frame-sync

# Remove the image
docker rmi icloud-frame-sync
   ```

## Development

### Code Quality
```bash
npm run lint         # ESLint with auto-fix
npm run format       # Prettier formatting
```

### Testing
```bash
npm test            # Run all tests (unit + integration)
npm run test:unit   # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:watch  # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

### IDE Setup
For Visual Studio Code, install the recommended extensions:
- ESLint (`dbaeumer.vscode-eslint`)
- Prettier - Code formatter (`esbenp.prettier-vscode`)

## How It Works

1. Application starts and initializes all services
2. PhotoSyncService authenticates with iCloud
3. SyncScheduler begins periodic photo checking
4. For each new photo: download from iCloud → upload to Frame TV → delete from iCloud
5. Process continues until application shutdown

### Thumbnail Generation

The application includes intelligent server-side thumbnail generation for Frame TV photos:

- **Content Detection**: Automatically detects user-uploaded photos (MY-* content IDs) vs. Samsung preloaded art (SAM-* IDs)
- **Server-Side Processing**: For user photos, thumbnails are generated locally using the Sharp image library
- **Smart Caching**: Generated thumbnails are cached in `.cache/thumbnails/` to avoid regeneration
- **Optimized Settings**: Thumbnails are 300x300px JPEG images with 80% quality for optimal performance
- **WebSocket Protocol**: Downloads full images from Frame TV via WebSocket + d2d socket when needed

This approach ensures fast thumbnail loading in the web UI while conserving network bandwidth through effective caching.

## Important Notes

- **Photo Deletion**: Photos are automatically deleted from iCloud after successful upload to Frame TV
- **Persistent Connection**: The application maintains a connection to the Samsung Frame TV and automatically reconnects if the connection is lost
- **Retry Logic**: Failed uploads are automatically retried with exponential backoff (default: 3 attempts)
- **MFA Requirement**: Two-factor authentication may be required for iCloud on first run
- **Credential Caching**: iCloud credentials are cached locally for subsequent runs
- **App-Specific Password**: Use an app-specific password for iCloud, not your main account password
- **State Persistence**: Sync state is stored in `~/.icloud-frame-sync/state.json` for resuming after restarts
- **Connection Testing**: Use the web UI or CLI to test connectivity before starting a sync

## Troubleshooting

### Connection Issues

If you're experiencing connection issues:

1. **Test Connections**: Use the web UI Configuration page or CLI to test both iCloud and Frame TV connectivity
2. **Check Frame TV**: Ensure your Samsung Frame TV is powered on and connected to the same network
3. **Verify iCloud Credentials**: Make sure you're using an app-specific password, not your main iCloud password
4. **MFA Setup**: If prompted for MFA, complete the authentication flow through the web UI

### Sync Issues

If photos aren't syncing:

1. **Check Album Name**: Ensure the `ICLOUD_SOURCE_ALBUM` matches exactly (case-sensitive)
2. **Review Logs**: Check the console output or log files for detailed error messages
3. **Verify Photo Format**: Ensure photos are in a supported format (JPEG, PNG)
4. **Check Disk Space**: Verify sufficient disk space on both the local machine and Frame TV

### CLI Issues

If CLI commands aren't working:

1. **Build First**: Run `npm run build` before using CLI commands in production
2. **Check Installation**: Ensure the package is properly installed with `npm install`
3. **Permissions**: On Unix systems, you may need to make the bin file executable: `chmod +x bin/icloud-frame-sync.js`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - see the [LICENSE](LICENSE) file for details.
