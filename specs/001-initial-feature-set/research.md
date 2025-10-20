# Research Findings: iCloud Frame Sync Initial Feature Set

## Sync Metadata Persistence
- **Decision**: Store sync checkpoints (last processed photo ID, timestamps,
  retry counts) in a local JSON file under `~/.icloud-frame-sync/state.json`
  with atomic writes.
- **Rationale**: Matches single-household deployment, avoids database
  overhead, and keeps state portable for CLI and web server processes. Atomic
  writes via temporary files prevent corruption on crashes.
- **Alternatives considered**: Embedded SQLite database (adds deployment
  friction and backups); in-memory only (loses state on restart leading to
  duplicate uploads).

## Retry and Backoff Strategy
- **Decision**: Implement exponential backoff starting at 15 seconds with
  jitter, capping at 5 minutes, and reset on successful sync cycle.
- **Rationale**: Keeps within success criteria (recover within 5 minutes),
  protects iCloud API from rapid retries, and integrates with the
  SyncScheduler loop.
- **Alternatives considered**: Fixed interval retry (risks thundering herd);
  unbounded exponential (could exceed the 5-minute recovery target).

## `icloudjs` Usage Best Practices
- **Decision**: Reuse a single authenticated session per service instance,
  enable MFA token caching, and refresh session tokens proactively every
  50 minutes.
- **Rationale**: Library documentation shows session reuse reduces login
  prompts; proactive refresh prevents mid-sync expiration.
- **Alternatives considered**: Authenticating per photo (excessive latency) or
  relying on lazy refresh (risk of expired sessions during batch uploads).

## `samsung-frame-connect` Integration
- **Decision**: Maintain a persistent WebSocket connection per Frame TV, send
  heartbeat pings every 30 seconds, and fall back to reconnection after two
  missed heartbeats.
- **Rationale**: Library recommends persistent connections for art mode
  uploads; heartbeat ensures the device remains reachable before starting
  transfers.
- **Alternatives considered**: Reconnect per upload (adds setup latency) and
  passive monitoring (delays detection of dropped connections).

## Structured Observability
- **Decision**: Standardize Pino log fields: `syncId`, `photoId`, `frameId`,
  `albumName`, and `step`. Emit JSON logs at info level for lifecycle events
  and warn/error for failures. Use a correlation ID per sync cycle.
- **Rationale**: Provides searchable logs for the destructive delete step,
  aligns with Constitution observability requirements, and keeps telemetry
  consistent across CLI and API.
- **Alternatives considered**: Free-form log strings (hard to parse) or using
  different loggers per layer (complicates correlation).

## Web Dashboard Performance
- **Decision**: Cache dashboard status responses for 5 seconds, paginate photo
  galleries at 24 photos per page, and stream metadata from backend to avoid
  large payloads.
- **Rationale**: Keeps response times under 2 seconds on slower networks,
  limits memory usage, and still feels real-time for users monitoring sync
  progress.
- **Alternatives considered**: No caching (risk of overwhelming backend) or
  aggressive caching (>30 seconds) that would miss timely update goals.
