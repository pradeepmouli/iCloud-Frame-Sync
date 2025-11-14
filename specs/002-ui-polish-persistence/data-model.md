# Data Model: UI Polish & Persistence Improvements

**Feature**: 002-ui-polish-persistence
**Date**: 2025-11-06
**Purpose**: Define database schema using Prisma for SQLite persistence

## Overview

This data model replaces the existing JSON-based state storage with a relational SQLite database managed by Prisma ORM. All entities support the functional requirements for configuration persistence, sync state tracking, and operation history.

## Prisma Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// ============================================================================
// Configuration Management (US1: Streamlined Configuration)
// ============================================================================

model Configuration {
  id                String   @id @default(cuid())

  // iCloud Connection Section
  icloudUsername    String?
  icloudPassword    String?  // Encrypted with AES-256-GCM
  icloudSourceAlbum String?
  icloudSessionToken String? @db.Text // Encrypted, for MFA sessions

  // Frame Connection Section
  frameHost         String?
  framePort         Int      @default(8002)
  frameConnectionStatus String @default("unknown") // unknown, connected, disconnected, error

  // Sync Configuration Section
  syncInterval      Int      @default(60) // seconds
  syncEnabled       Boolean  @default(false)
  deleteAfterSync   Boolean  @default(true)
  maxRetries        Int      @default(3)

  // Metadata
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  version           Int      @default(1) // For schema migrations

  @@map("configuration")
}

// ============================================================================
// Photo Tracking (US3: Photo Gallery, US4: Persistence)
// ============================================================================

model Album {
  id              String   @id @default(cuid())
  albumId         String   @unique // iCloud album identifier
  name            String
  photoCount      Int      @default(0)
  lastFetchedAt   DateTime?
  isVisible       Boolean  @default(true)

  // Relationships
  photos          PhotoRecord[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([albumId])
  @@index([lastFetchedAt])
  @@map("albums")
}

model PhotoRecord {
  id                String   @id @default(cuid())

  // Photo identification
  checksum          String   @unique // SHA-256 of file content
  filename          String
  sourceAlbumId     String   // FK to Album
  sourcePhotoId     String   // iCloud photo identifier

  // Storage locations
  sourcePath        String?  // Path in iCloud
  frameContentId    String?  // Content ID on Frame TV (MY_xxxxx format)

  // Sync tracking
  status            String   @default("pending") // pending, syncing, synced, failed
  lastSyncedAt      DateTime?
  lastErrorAt       DateTime?
  errorMessage      String?
  errorCount        Int      @default(0)
  retryCount        Int      @default(0)

  // Photo metadata
  captureDate       DateTime?
  fileSize          Int?     // bytes
  width             Int?
  height            Int?
  mimeType          String?

  // Relationships
  album             Album    @relation(fields: [sourceAlbumId], references: [id], onDelete: Cascade)
  syncHistory       SyncHistory[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([checksum])
  @@index([sourceAlbumId])
  @@index([status])
  @@index([lastSyncedAt])
  @@index([frameContentId])
  @@map("photo_records")
}

// ============================================================================
// Sync Operations (US2: Dashboard, US4: Persistence)
// ============================================================================

model SyncState {
  id                String   @id @default(cuid())

  // Current operation state
  status            String   @default("idle") // idle, running, paused, error
  currentPhotoId    String?  // FK to PhotoRecord
  progressPercent   Int      @default(0)
  estimatedTimeLeft Int?     // seconds

  // Operation counters
  photosTotal       Int      @default(0)
  photosProcessed   Int      @default(0)
  photosFailed      Int      @default(0)
  photosSkipped     Int      @default(0)

  // Current error state
  lastError         String?
  lastErrorAt       DateTime?

  // Session tracking
  sessionStartedAt  DateTime?
  sessionEndedAt    DateTime?

  updatedAt         DateTime @updatedAt

  @@map("sync_state")
}

model SyncHistory {
  id                String   @id @default(cuid())

  // Operation details
  photoRecordId     String   // FK to PhotoRecord
  operation         String   // download, upload, delete, retry
  status            String   // started, completed, failed

  // Timing
  startedAt         DateTime @default(now())
  completedAt       DateTime?
  durationMs        Int?

  // Outcome
  success           Boolean  @default(false)
  errorMessage      String?
  errorCode         String?

  // Context
  retryAttempt      Int      @default(0)
  fileSize          Int?     // bytes transferred

  // Relationships
  photoRecord       PhotoRecord @relation(fields: [photoRecordId], references: [id], onDelete: Cascade)

  @@index([photoRecordId])
  @@index([startedAt])
  @@index([status])
  @@map("sync_history")
}

// ============================================================================
// System Metadata
// ============================================================================

model DatabaseMetadata {
  id                String   @id @default(cuid())
  key               String   @unique
  value             String

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("database_metadata")
}
```

## Entity Descriptions

### Configuration
**Purpose**: Single-row table storing all application configuration
**Key Fields**:
- Encrypted credentials (icloudPassword, icloudSessionToken)
- Connection settings split into three logical sections
- Sync behavior configuration

**Validation Rules** (Zod):
- `icloudUsername`: Must be valid email format
- `icloudPassword`: Minimum 8 characters (app-specific password)
- `frameHost`: Valid IP address or hostname
- `syncInterval`: 30-3600 seconds
- `maxRetries`: 0-10 attempts

**State Transitions**: N/A (configuration is updated, not state machine)

### Album
**Purpose**: Tracks iCloud photo albums for gallery browsing
**Key Fields**:
- `albumId`: Unique identifier from iCloud API
- `photoCount`: Cached count for UI display
- `lastFetchedAt`: Timestamp for refresh logic

**Validation Rules** (Zod):
- `name`: Non-empty string, max 255 characters
- `photoCount`: Non-negative integer
- `isVisible`: Boolean for soft-delete

**Relationships**:
- One-to-many with PhotoRecord (CASCADE delete)

### PhotoRecord
**Purpose**: Individual photo tracking with sync status
**Key Fields**:
- `checksum`: SHA-256 hash for duplicate detection (unique index)
- `status`: Current sync state (see state machine below)
- `retryCount`: Exponential backoff tracking
- `frameContentId`: Content ID once uploaded to Frame TV

**Validation Rules** (Zod):
- `checksum`: 64-character hex string (SHA-256)
- `filename`: Non-empty, valid filename characters
- `status`: Enum of allowed values
- `fileSize`: Positive integer if present
- `retryCount`: 0 <= retryCount <= maxRetries from config

**State Transitions**:
```
pending → syncing → synced
  ↓         ↓
failed ← ←←
```

### SyncState
**Purpose**: Single-row table tracking current sync operation
**Key Fields**:
- `status`: Overall sync service state
- `currentPhotoId`: Photo being processed (FK to PhotoRecord)
- `progressPercent`: 0-100 for UI progress bar

**Validation Rules** (Zod):
- `status`: Enum of {idle, running, paused, error}
- `progressPercent`: 0-100 integer
- `photosTotal`: Non-negative integer
- Counters: processed + failed + skipped <= total

**State Transitions**:
```
idle → running → idle
 ↓       ↓
paused ←
 ↓
running (resume)

running → error → idle (reset)
```

### SyncHistory
**Purpose**: Audit log of all sync operations
**Key Fields**:
- `operation`: Type of operation performed
- `status`: Lifecycle of single operation
- `durationMs`: Performance tracking

**Validation Rules** (Zod):
- `operation`: Enum of {download, upload, delete, retry}
- `status`: Enum of {started, completed, failed}
- `durationMs`: Positive integer if completedAt present
- `retryAttempt`: 0-indexed retry number

**Retention Policy**:
- Keep last 1000 records per photo
- Archive records older than 6 months (if > 100MB total)

### DatabaseMetadata
**Purpose**: System-level key-value storage
**Key Fields**:
- `key`: Unique identifier (e.g., "schema_version", "encryption_key_salt")
- `value`: JSON-encoded or plain text value

**Usage**:
- Schema migration tracking
- Encryption key derivation salt
- Last migration timestamp
- Feature flags

## Indexes

Performance-critical indexes:

```prisma
// PhotoRecord lookups
@@index([checksum])           // Duplicate detection O(log n)
@@index([sourceAlbumId])      // Album filtering O(log n)
@@index([status])             // Pending photos query O(log n)
@@index([lastSyncedAt])       // Incremental sync O(log n)
@@index([frameContentId])     // Frame TV content lookup O(log n)

// SyncHistory queries
@@index([photoRecordId])      // Photo history O(log n)
@@index([startedAt])          // Time-range queries O(log n)
@@index([status])             // Failed operation queries O(log n)

// Album browsing
@@index([albumId])            // iCloud ID lookup O(log n)
@@index([lastFetchedAt])      // Stale album detection O(log n)
```

## Data Migration

### From JSON State File

```typescript
// Migration script: scripts/migrate-json-to-sqlite.ts
import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'
import path from 'path'

async function migrateJsonState() {
  const prisma = new PrismaClient()
  const jsonPath = path.join(os.homedir(), '.icloud-frame-sync', 'state.json')

  if (!await fs.access(jsonPath).then(() => true).catch(() => false)) {
    return // No JSON file to migrate
  }

  const jsonState = JSON.parse(await fs.readFile(jsonPath, 'utf-8'))

  await prisma.$transaction(async (tx) => {
    // Migrate configuration
    await tx.configuration.create({
      data: {
        icloudUsername: jsonState.config?.icloudUsername,
        icloudPassword: encrypt(jsonState.config?.icloudPassword),
        frameHost: jsonState.config?.frameHost,
        syncInterval: jsonState.config?.syncInterval || 60,
        syncEnabled: jsonState.config?.syncEnabled ?? false,
      }
    })

    // Migrate photo records
    const albums = new Map<string, string>() // albumName -> albumId

    for (const [checksum, photo] of Object.entries(jsonState.photos || {})) {
      // Create album if not exists
      if (!albums.has(photo.sourceAlbum)) {
        const album = await tx.album.upsert({
          where: { albumId: photo.sourceAlbumId },
          create: {
            albumId: photo.sourceAlbumId,
            name: photo.sourceAlbum,
            photoCount: 0,
          },
          update: {},
        })
        albums.set(photo.sourceAlbum, album.id)
      }

      // Create photo record
      await tx.photoRecord.create({
        data: {
          checksum,
          filename: photo.filename,
          sourceAlbumId: albums.get(photo.sourceAlbum)!,
          sourcePhotoId: photo.sourcePhotoId,
          frameContentId: photo.frameContentId,
          status: photo.uploaded ? 'synced' : 'pending',
          lastSyncedAt: photo.lastSyncedAt ? new Date(photo.lastSyncedAt) : null,
          errorCount: photo.errorCount || 0,
          fileSize: photo.fileSize,
        }
      })
    }
  })

  // Backup original
  await fs.copyFile(jsonPath, `${jsonPath}.backup.${Date.now()}`)
  console.log('✅ Migration complete. JSON backup created.')
}
```

## Zod Schemas

```typescript
// src/schemas/configuration.schema.ts
import { z } from 'zod'

export const ConfigurationSchema = z.object({
  icloudUsername: z.string().email().optional(),
  icloudPassword: z.string().min(8).optional(),
  icloudSourceAlbum: z.string().optional(),
  frameHost: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9\-\.]+$/).optional(),
  framePort: z.number().int().min(1).max(65535).default(8002),
  syncInterval: z.number().int().min(30).max(3600).default(60),
  syncEnabled: z.boolean().default(false),
  deleteAfterSync: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(10).default(3),
})

export const PhotoRecordSchema = z.object({
  checksum: z.string().length(64).regex(/^[a-f0-9]+$/),
  filename: z.string().min(1).max(255),
  sourceAlbumId: z.string().cuid(),
  sourcePhotoId: z.string(),
  status: z.enum(['pending', 'syncing', 'synced', 'failed']),
  fileSize: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

export const SyncStateSchema = z.object({
  status: z.enum(['idle', 'running', 'paused', 'error']),
  progressPercent: z.number().int().min(0).max(100),
  photosTotal: z.number().int().nonnegative(),
  photosProcessed: z.number().int().nonnegative(),
  photosFailed: z.number().int().nonnegative(),
  photosSkipped: z.number().int().nonnegative(),
}).refine(
  (data) => data.photosProcessed + data.photosFailed + data.photosSkipped <= data.photosTotal,
  { message: 'Sum of counters cannot exceed total' }
)
```

## Database Setup

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./data/sync.db'
    }
  }
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
```

## Environment Configuration

```env
# .env
DATABASE_URL="file:./data/sync.db"
ENCRYPTION_KEY="generate-with-openssl-rand-hex-32"
```

## Summary

This data model provides:
- ✅ Type-safe database access via Prisma client
- ✅ Efficient queries with strategic indexes
- ✅ Encrypted credential storage
- ✅ Complete audit trail via SyncHistory
- ✅ Migration path from existing JSON state
- ✅ Runtime validation with Zod schemas
- ✅ Atomic transactions for data integrity

Next: Generate API contracts in `/contracts` directory.
