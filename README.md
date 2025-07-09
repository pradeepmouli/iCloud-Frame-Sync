# iCloud Frame Sync

An automated service that synchronizes photos from iCloud Photos to Samsung Frame TVs. The application continuously monitors a specified iCloud Photos album and uploads new photos to your Samsung Frame TV as art, then removes them from iCloud to save storage space.

## Features

- **Automatic Synchronization**: Continuously monitors iCloud Photos for new images
- **Samsung Frame TV Integration**: Uploads photos directly to your Frame TV as art
- **Two Operation Modes**: CLI application and Web UI interface
- **Storage Management**: Automatically removes photos from iCloud after successful upload
- **Web Dashboard**: Modern React-based interface for monitoring and configuration
- **MFA Support**: Handles iCloud two-factor authentication
- **Configurable Sync Intervals**: Customize how often the service checks for new photos

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

### CLI Mode

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

### Alternative Runtime
```bash
npm run start:deno   # Run with Deno runtime
```

## Docker

1. Build the Docker image:
   ```bash
   docker build -t icloud-frame-sync .
   ```

2. Run the container:
   ```bash
   docker run -d \
     --env-file .env \
     -p 3001:3001 \
     icloud-frame-sync
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

## Important Notes

- **Photo Deletion**: Photos are automatically deleted from iCloud after successful upload to Frame TV
- **Persistent Connection**: The application maintains a connection to the Samsung Frame TV throughout operation
- **MFA Requirement**: Two-factor authentication may be required for iCloud on first run
- **Credential Caching**: iCloud credentials are cached locally for subsequent runs
- **App-Specific Password**: Use an app-specific password for iCloud, not your main account password

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - see the [LICENSE](LICENSE) file for details.
