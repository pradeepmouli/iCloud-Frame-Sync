# API Contracts: UI Polish & Persistence Improvements

**Feature**: 002-ui-polish-persistence
**Date**: 2025-11-06
**Base URL**: `http://localhost:3000/api`

## Overview

This document defines all HTTP API endpoints for the iCloud Frame Sync application. All endpoints return JSON responses unless specified otherwise (e.g., SSE streams).

### API Principles
- RESTful design with resource-based URLs
- Zod schema validation on all inputs
- Consistent error response format
- Server-Sent Events (SSE) for real-time updates
- Cursor-based pagination for large collections
- Atomic operations with transaction support

### Authentication
**Current Version**: No authentication (single-user application)
**Future**: Optional password protection via middleware

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string           // Machine-readable error code
    message: string        // Human-readable error message
    details?: unknown      // Optional additional context
    timestamp: string      // ISO 8601 timestamp
  }
}
```

**HTTP Status Codes**:
- `400 Bad Request` - Invalid input, validation failure
- `404 Not Found` - Resource not found
- `409 Conflict` - Operation conflict (e.g., sync already running)
- `500 Internal Server Error` - Unexpected server error
- `503 Service Unavailable` - External service unavailable (iCloud, Frame TV)

---

## Configuration Management

### GET /api/configuration

**Purpose**: Retrieve current application configuration
**User Story**: US1 (Streamlined Configuration Management)

**Request**: None

**Response**: `200 OK`
```typescript
{
  icloud: {
    username: string | null
    hasPassword: boolean          // Never return actual password
    sourceAlbum: string | null
    hasActiveSession: boolean     // MFA session still valid
    connectionStatus: 'unknown' | 'connected' | 'disconnected' | 'error'
  }
  frame: {
    host: string | null
    port: number
    connectionStatus: 'unknown' | 'connected' | 'disconnected' | 'error'
  }
  sync: {
    interval: number              // seconds
    enabled: boolean
    deleteAfterSync: boolean
    maxRetries: number
  }
}
```

**Errors**:
- `500` - Database read failure

**Example**:
```bash
curl http://localhost:3000/api/configuration
```

---

### POST /api/configuration

**Purpose**: Update application configuration (full or partial)
**User Story**: US1 (Streamlined Configuration Management)

**Request Body**: (All fields optional for partial updates)
```typescript
{
  icloud?: {
    username?: string             // Email format
    password?: string             // Min 8 chars, will be encrypted
    sourceAlbum?: string
  }
  frame?: {
    host?: string                 // IP address or hostname
    port?: number                 // 1-65535
  }
  sync?: {
    interval?: number             // 30-3600 seconds
    enabled?: boolean
    deleteAfterSync?: boolean
    maxRetries?: number           // 0-10
  }
}
```

**Response**: `200 OK` (same structure as GET /api/configuration)

**Errors**:
- `400` - Validation failure (Zod error details in `error.details`)
- `500` - Database write failure or encryption failure

**Validation Rules**:
```typescript
import { z } from 'zod'

const ConfigurationUpdateSchema = z.object({
  icloud: z.object({
    username: z.string().email().optional(),
    password: z.string().min(8).optional(),
    sourceAlbum: z.string().optional(),
  }).optional(),
  frame: z.object({
    host: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9\-\.]+$/).optional(),
    port: z.number().int().min(1).max(65535).optional(),
  }).optional(),
  sync: z.object({
    interval: z.number().int().min(30).max(3600).optional(),
    enabled: z.boolean().optional(),
    deleteAfterSync: z.boolean().optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
  }).optional(),
})
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/configuration \
  -H "Content-Type: application/json" \
  -d '{
    "icloud": {
      "username": "user@example.com",
      "password": "app-specific-password"
    },
    "sync": {
      "interval": 120,
      "enabled": true
    }
  }'
```

---

### POST /api/configuration/test-icloud

**Purpose**: Test iCloud credentials without saving configuration
**User Story**: US1 (Connection validation)

**Request Body**:
```typescript
{
  username: string
  password: string
}
```

**Response**: `200 OK`
```typescript
{
  success: boolean
  message: string
  requiresMfa: boolean           // If MFA prompt triggered
  albumsCount?: number           // Number of albums found (if successful)
}
```

**Errors**:
- `400` - Invalid credentials format
- `401` - Authentication failed
- `503` - iCloud service unavailable

**Example**:
```bash
curl -X POST http://localhost:3000/api/configuration/test-icloud \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@example.com",
    "password": "app-specific-password"
  }'
```

---

### POST /api/configuration/test-frame

**Purpose**: Test Frame TV connection without saving configuration
**User Story**: US1 (Connection validation)

**Request Body**:
```typescript
{
  host: string
  port: number
}
```

**Response**: `200 OK`
```typescript
{
  success: boolean
  message: string
  frameName?: string             // TV device name if successful
  contentCount?: number          // Number of photos already on Frame
}
```

**Errors**:
- `400` - Invalid host/port format
- `503` - Frame TV unreachable

**Example**:
```bash
curl -X POST http://localhost:3000/api/configuration/test-frame \
  -H "Content-Type: application/json" \
  -d '{
    "host": "192.168.1.100",
    "port": 8002
  }'
```

---

## Sync Control

### POST /api/sync/start

**Purpose**: Start the photo synchronization process
**User Story**: US2 (Simplified Dashboard)

**Request Body**: None

**Response**: `200 OK`
```typescript
{
  success: boolean
  message: string
  sessionId: string              // Unique sync session identifier
}
```

**Errors**:
- `400` - Configuration incomplete (missing credentials or Frame host)
- `409` - Sync already running
- `500` - Failed to initialize sync service

**Preconditions**:
- Configuration must have valid iCloud credentials
- Configuration must have valid Frame TV host
- Sync state must be `idle` or `error`

**Example**:
```bash
curl -X POST http://localhost:3000/api/sync/start
```

---

### POST /api/sync/stop

**Purpose**: Stop the photo synchronization process
**User Story**: US2 (Simplified Dashboard)

**Request Body**: None

**Response**: `200 OK`
```typescript
{
  success: boolean
  message: string
  summary: {
    photosProcessed: number
    photosFailed: number
    durationMs: number
  }
}
```

**Errors**:
- `409` - No sync currently running
- `500` - Failed to stop sync service gracefully

**Behavior**:
- Completes current photo upload before stopping
- Sets sync state to `idle`
- Preserves partial progress in database

**Example**:
```bash
curl -X POST http://localhost:3000/api/sync/stop
```

---

### GET /api/sync/status

**Purpose**: Get current sync status (single poll)
**User Story**: US2 (Dashboard status display)

**Request**: None

**Response**: `200 OK`
```typescript
{
  status: 'idle' | 'running' | 'paused' | 'error'
  currentPhoto?: {
    filename: string
    progress: number             // 0-100
  }
  progress: {
    percent: number              // 0-100
    photosTotal: number
    photosProcessed: number
    photosFailed: number
    photosSkipped: number
  }
  lastError?: {
    message: string
    timestamp: string            // ISO 8601
  }
  session?: {
    startedAt: string            // ISO 8601
    estimatedTimeLeftSec: number | null
  }
}
```

**Errors**:
- `500` - Database read failure

**Example**:
```bash
curl http://localhost:3000/api/sync/status
```

---

### GET /api/sync/status/stream

**Purpose**: Real-time sync status updates via Server-Sent Events
**User Story**: US2 (Dashboard live updates)

**Request**: None

**Response**: `200 OK` (Content-Type: `text/event-stream`)

**Event Format**:
```typescript
event: status
data: {
  status: 'idle' | 'running' | 'paused' | 'error',
  progress: { ... },           // Same as GET /api/sync/status
  currentPhoto: { ... } | null,
  timestamp: string            // ISO 8601
}

event: error
data: {
  message: string,
  code: string,
  timestamp: string
}

event: complete
data: {
  summary: {
    photosProcessed: number,
    photosFailed: number,
    durationMs: number
  },
  timestamp: string
}
```

**Connection**:
- Heartbeat every 30 seconds (`event: heartbeat`)
- Auto-reconnect on disconnect (exponential backoff)
- Close connection after 1 hour of inactivity

**Example** (JavaScript):
```javascript
const eventSource = new EventSource('http://localhost:3000/api/sync/status/stream')

eventSource.addEventListener('status', (e) => {
  const data = JSON.parse(e.data)
  console.log('Sync status:', data.status, data.progress)
})

eventSource.addEventListener('error', (e) => {
  const data = JSON.parse(e.data)
  console.error('Sync error:', data.message)
})

eventSource.addEventListener('complete', (e) => {
  const data = JSON.parse(e.data)
  console.log('Sync complete:', data.summary)
  eventSource.close()
})
```

---

## Photo Gallery

### GET /api/albums

**Purpose**: List all iCloud photo albums
**User Story**: US3 (Complete Photo Gallery)

**Query Parameters**:
- `refresh` (optional): boolean - Force refresh from iCloud API

**Request**: None

**Response**: `200 OK`
```typescript
{
  albums: Array<{
    id: string                   // Database CUID
    albumId: string              // iCloud album identifier
    name: string
    photoCount: number
    lastFetchedAt: string | null // ISO 8601
  }>
  totalCount: number
}
```

**Errors**:
- `503` - iCloud service unavailable (if refresh=true)
- `500` - Database read failure

**Caching**:
- Returns cached data by default
- Set `refresh=true` to fetch from iCloud (slow, 5-30 seconds)
- Frontend should cache with React Query (staleTime: 5 minutes)

**Example**:
```bash
# Get cached albums
curl http://localhost:3000/api/albums

# Force refresh from iCloud
curl http://localhost:3000/api/albums?refresh=true
```

---

### GET /api/albums/:albumId/photos

**Purpose**: List photos in a specific album with cursor pagination
**User Story**: US3 (Complete Photo Gallery with pagination)

**Path Parameters**:
- `albumId`: string - Album ID (database CUID or iCloud albumId)

**Query Parameters**:
- `limit` (optional): number - Items per page (default: 50, max: 200)
- `cursor` (optional): string - Pagination cursor from previous response
- `status` (optional): 'pending' | 'syncing' | 'synced' | 'failed' - Filter by sync status

**Request**: None

**Response**: `200 OK`
```typescript
{
  photos: Array<{
    id: string
    checksum: string
    filename: string
    status: 'pending' | 'syncing' | 'synced' | 'failed'
    thumbnailUrl: string         // Presigned URL for thumbnail
    captureDate: string | null   // ISO 8601
    fileSize: number | null      // bytes
    width: number | null
    height: number | null
    lastSyncedAt: string | null  // ISO 8601
    errorMessage: string | null
  }>
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor: string | null
    endCursor: string | null
    totalCount: number
  }
}
```

**Errors**:
- `404` - Album not found
- `400` - Invalid cursor or limit
- `500` - Database read failure

**Pagination Logic**:
```typescript
// First page
GET /api/albums/clu123abc/photos?limit=50

// Next page
GET /api/albums/clu123abc/photos?limit=50&cursor=eyJpZCI6ImNsdTQ1NnhpeiJ9

// With filter
GET /api/albums/clu123abc/photos?limit=50&status=failed
```

**Example**:
```bash
# First page
curl http://localhost:3000/api/albums/clu123abc/photos?limit=50

# Next page
curl 'http://localhost:3000/api/albums/clu123abc/photos?limit=50&cursor=eyJpZCI6ImNsdTQ1NnhpeiJ9'
```

---

### GET /api/albums/:albumId/photos/:photoId

**Purpose**: Get detailed information about a single photo
**User Story**: US3 (Photo detail modal)

**Path Parameters**:
- `albumId`: string - Album ID
- `photoId`: string - Photo ID (database CUID)

**Request**: None

**Response**: `200 OK`
```typescript
{
  id: string
  checksum: string
  filename: string
  status: 'pending' | 'syncing' | 'synced' | 'failed'

  urls: {
    thumbnail: string            // Presigned URL
    full: string                 // Presigned URL for full resolution
  }

  metadata: {
    captureDate: string | null
    fileSize: number | null
    width: number | null
    height: number | null
    mimeType: string | null
  }

  sync: {
    lastSyncedAt: string | null
    errorMessage: string | null
    retryCount: number
    frameContentId: string | null
  }

  history: Array<{
    operation: string
    status: string
    startedAt: string
    completedAt: string | null
    errorMessage: string | null
  }>
}
```

**Errors**:
- `404` - Album or photo not found
- `500` - Database read failure

**Example**:
```bash
curl http://localhost:3000/api/albums/clu123abc/photos/clu456xyz
```

---

## Health & Diagnostics

### GET /api/health

**Purpose**: Health check endpoint for monitoring

**Request**: None

**Response**: `200 OK`
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  services: {
    database: {
      status: 'up' | 'down'
      responseTimeMs: number
    }
    icloud: {
      status: 'up' | 'down' | 'unknown'
    }
    frame: {
      status: 'up' | 'down' | 'unknown'
    }
  }
  version: string                // Application version
}
```

**Errors**: None (always returns 200, check `status` field)

**Example**:
```bash
curl http://localhost:3000/api/health
```

---

## Implementation Notes

### Zod Middleware

All endpoints use `zod-express-middleware` for validation:

```typescript
import { z } from 'zod'
import { processRequest } from 'zod-express-middleware'

const ConfigurationUpdateSchema = z.object({ /* ... */ })

router.post(
  '/configuration',
  processRequest({ body: ConfigurationUpdateSchema }),
  async (req, res) => {
    // req.body is now typed and validated
    const config = req.body
    // ...
  }
)
```

### Error Handler

Global error handler catches all errors:

```typescript
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, req }, 'Request error')

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors,
        timestamp: new Date().toISOString(),
      }
    })
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    }
  })
})
```

### SSE Implementation

Server-Sent Events for real-time updates:

```typescript
router.get('/sync/status/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Subscribe to sync state changes
  const subscription = syncService.on('statusChange', (state) => {
    sendEvent('status', state)
  })

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    sendEvent('heartbeat', { timestamp: new Date().toISOString() })
  }, 30000)

  req.on('close', () => {
    clearInterval(heartbeat)
    subscription.unsubscribe()
  })
})
```

### Cursor Pagination

Efficient pagination using Prisma cursor:

```typescript
const photos = await prisma.photoRecord.findMany({
  where: { sourceAlbumId: albumId },
  take: limit + 1,  // Fetch one extra to check hasNextPage
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: 'desc' },
})

const hasNextPage = photos.length > limit
const edges = photos.slice(0, limit)

return {
  photos: edges,
  pageInfo: {
    hasNextPage,
    endCursor: edges[edges.length - 1]?.id || null,
    startCursor: edges[0]?.id || null,
  }
}
```

## Summary

This API specification provides:
- ✅ 15 endpoints covering all user stories
- ✅ Zod validation on all inputs
- ✅ Consistent error handling
- ✅ Real-time updates via SSE
- ✅ Efficient cursor-based pagination
- ✅ Type-safe contracts with TypeScript
- ✅ Health monitoring for diagnostics

Next: Generate quickstart.md with deployment instructions.
