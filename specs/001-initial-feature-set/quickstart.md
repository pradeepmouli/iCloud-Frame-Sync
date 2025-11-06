# Quickstart: iCloud Frame Sync Initial Feature Set

## Prerequisites
- Node.js 20.x (minimum 18.x) and npm 10+
- Samsung Frame TV reachable on local network
- iCloud account with app-specific password and target album created
- Optional: Deno 2.x for alternative runtime (`npm run start:deno`)

## Environment Setup
1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` based on README template:

   ```env
   ICLOUD_USERNAME=your-email@icloud.com
   ICLOUD_PASSWORD=app-specific-password
   ICLOUD_SOURCE_ALBUM=Frame Sync
   SAMSUNG_FRAME_HOST=192.168.1.100
   ICLOUD_SYNC_INTERVAL=60
   LOG_LEVEL=info
   WEB_PORT=3001
   CORS_ORIGIN=http://localhost:3000
   ```

3. Initialize local state directory (created on first run) at
   `~/.icloud-frame-sync/` to store sync checkpoints and cached tokens.

## Running the Services
### CLI Commands

The application provides dedicated CLI commands for managing the sync service:

```bash
# Start the sync service (daemon mode)
npm start sync:start

# Check the current status
npm start sync:status

# Stop the sync service
npm start sync:stop
```

These commands manage a persistent sync service that runs in the background. Runtime metadata is stored in `~/.icloud-frame-sync/runtime.json`.

### CLI Sync Mode (Direct Execution)

```bash
npm run dev           # Development with hot reload
npm run build         # Compile TypeScript to dist/
npm start             # Run compiled CLI sync service (long-running)
```

### Web Dashboard Mode

```bash
npm run dev:web       # Start API server + React dev server
npm run dev:server    # API server only (port 3001)
npm run dev:client    # React client only (port 3000)
```

### Production

```bash
npm run build         # Build server and client bundles
npm run start:web     # Serve REST API + React build output
```

## Testing Strategy
- Unit tests: `npm run test:unit`
- Integration tests (iCloud + Frame simulators): `npm run test:integration`
- Full suite + coverage: `npm run test:coverage`

## Operational Notes
- Logs: JSON output via Pino (`logs/` optional or stdout collectors)
- Sync checkpoints: `~/.icloud-frame-sync/state.json` (atomic writes)
- Runtime metadata: `~/.icloud-frame-sync/runtime.json` (CLI command state)
- Retry policy: Exponential backoff with jitter, configurable max retries (default: 3)
- Scheduler: Pause/resume capability, intelligent backoff on consecutive failures
- Frame TV: Automatic reconnection with configurable retry attempts (default: 5)
- Dashboard caching: 5-second status cache, 24-photo pagination
- Connection testing: POST `/api/connections/test` or CLI `sync:status`

## Key Enhancements
### Resilience Features
- **Automatic Reconnection**: Frame TV connection automatically recovers from network issues
- **Intelligent Retry**: Failed uploads retry with exponential backoff
- **State Persistence**: All sync state persists across restarts
- **Pause/Resume**: Scheduler can be paused and resumed without losing state

### Connection Management
- **Pre-flight Checks**: Test iCloud and Frame TV connectivity before syncing
- **MFA Handling**: Seamless two-factor authentication through web UI or CLI
- **Connection Probes**: Regular health checks with configurable timeouts

### CLI Operations
- **Service Management**: Start, stop, and check status of background sync service
- **Graceful Shutdown**: Proper cleanup of resources on stop
- **Status Reporting**: Detailed information about sync state and configuration

## Next Steps
- Proceed to `/speckit.tasks` after confirming plan and design assets
- Document deployment playbooks (Docker, systemd) before release
