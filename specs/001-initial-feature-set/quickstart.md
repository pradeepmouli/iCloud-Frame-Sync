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
### CLI Sync Mode

```bash
npm run dev           # Development with hot reload
npm run build         # Compile TypeScript to dist/
npm start             # Run compiled CLI sync service
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
- Retry policy: 15s exponential backoff with jitter, cap at 5 minutes
- Dashboard caching: 5-second status cache, 24-photo pagination
- Connection testing: POST `/api/connections/test` or CLI `sync:status`

## Next Steps
- Proceed to `/speckit.tasks` after confirming plan and design assets
- Document deployment playbooks (Docker, systemd) before release
