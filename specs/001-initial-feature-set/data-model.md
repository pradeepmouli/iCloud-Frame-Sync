# Data Model: iCloud Frame Sync Initial Feature Set

## Entities

### Photo
- **Fields**:
  - `id`: string (iCloud asset identifier)
  - `albumId`: string (references Album.id)
  - `takenAt`: ISO timestamp
  - `uploadedAt`: ISO timestamp | null (set after Frame upload)
  - `sizeBytes`: number
  - `format`: enum (`jpeg`, `heic`, `png`)
  - `status`: enum (`pending`, `uploading`, `uploaded`, `failed`)
  - `retryCount`: number (resets on success)
- **Validation**:
  - `format` must be supported by Samsung Frame (jpeg or png; heic requires a
    conversion step)
  - `sizeBytes` <= 15 MB (Frame upload limit)
- **State transitions**:
  - `pending` → `uploading` → `uploaded`
  - `pending` → `failed` (after retry limit reached)
  - `failed` → `pending` (manual retry)

### Album
- **Fields**:
  - `id`: string (iCloud album identifier)
  - `name`: string
  - `lastSyncedAt`: ISO timestamp | null
  - `photoCount`: number
- **Relationships**: One-to-many with Photo (`Album.id` → `Photo.albumId`).
- **Validation**: `name` must match configured sync album; `photoCount`
  reflects live iCloud count.

### FrameDevice
- **Fields**:
  - `id`: string (derived from device serial)
  - `host`: string (IP address)
  - `connectedAt`: ISO timestamp | null
  - `status`: enum (`connected`, `disconnected`, `authPending`)
  - `firmwareVersion`: string | null
- **Relationships**: None (referenced by SyncOperation).
- **Validation**: `host` must pass IPv4 validation; status transitions require logs.

### SyncOperation
- **Fields**:
  - `id`: string (UUID)
  - `startedAt`: ISO timestamp
  - `completedAt`: ISO timestamp | null
  - `status`: enum (`running`, `succeeded`, `failed`)
  - `photoIds`: array of strings
  - `error`: string | null
  - `attempt`: number (increments on retries)
  - `frameId`: string (references FrameDevice.id)
- **Relationships**: Associates with Photo and FrameDevice via identifiers.
- **Validation**: `completedAt` must exist when status is `succeeded` or `failed`.

### Configuration
- **Fields**:
  - `icloudUsername`: string
  - `icloudAppPassword`: string (stored encrypted)
  - `syncAlbumName`: string
  - `frameHost`: string
  - `syncIntervalSeconds`: number (default 60)
  - `logLevel`: enum (`info`, `warn`, `debug`)
  - `webPort`: number (default 3001)
  - `corsOrigin`: string (default `http://localhost:3000`)
- **Validation**: Secrets encrypted at rest; intervals >= 30 seconds; port
  range 1024-65535.

### SyncSchedule
- **Fields**:
  - `nextRunAt`: ISO timestamp
  - `intervalSeconds`: number
  - `isPaused`: boolean
- **Relationships**: None (owned by SyncScheduler service).
- **Validation**: `nextRunAt` must adjust when manual trigger occurs.

## Derived Structures

### CLI Command Contracts
- `sync:start --album <name> --frame <host>` → triggers immediate sync cycle
  and prints JSON summary.
- `sync:status` → returns `SyncOperation` snapshot.
- `sync:config --set key=value` → updates Configuration fields with
  validation feedback.

### REST Response Shapes
- `GET /api/status` → `{ sync: SyncOperation, schedule: SyncSchedule }`
- `GET /api/albums` → `{ albums: Album[] }`
- `POST /api/sync` → `{ operationId: string }`
- `POST /api/settings` → `{ success: boolean, config: Configuration }`
- `GET /api/photos?albumId=...&page=...` → `{ items: Photo[], pagination:
  { page: number, pageSize: number, total: number } }`
