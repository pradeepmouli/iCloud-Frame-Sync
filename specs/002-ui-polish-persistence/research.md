# Research: UI Polish & Persistence Improvements

**Feature**: 002-ui-polish-persistence
**Date**: 2025-11-06
**Purpose**: Research technical approaches for UI consolidation, SQLite persistence with Prisma, and Zod schema validation

## 1. Database Migration: JSON to SQLite with Prisma

### Decision: Prisma ORM with SQLite

**Rationale**:
- Type-safe database client generation matching TypeScript-first constitution
- Built-in migration system for schema evolution (addresses FR-014)
- Connection pooling and transaction support (addresses FR-015, FR-020)
- Works seamlessly with SQLite for single-user deployment model
- Auto-generates TypeScript types from schema, maintaining type safety

**Alternatives Considered**:
1. **Better-SQLite3**: Lower-level, more control but requires manual type definitions and migration management
2. **TypeORM**: More complex, better for multi-database support but overkill for SQLite-only requirement
3. **Kysely**: Type-safe query builder but still requires manual migrations and more boilerplate

**Implementation Approach**:
```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL") // file:./data/sync.db
}

generator client {
  provider = "prisma-client-js"
}
```

### Decision: Zod for Runtime Validation

**Rationale**:
- Runtime validation of API inputs and configuration data
- Type inference from Zod schemas generates TypeScript types
- Integrates well with Prisma models via `zod-prisma-types` or manual schemas
- Express middleware available (`zod-express-middleware`)
- Validation errors provide user-friendly messages

**Alternatives Considered**:
1. **Joi**: Popular but less TypeScript-friendly, no type inference
2. **Yup**: React-focused, less suitable for backend validation
3. **Class-validator**: Requires decorators, conflicts with functional approach

**Implementation Approach**:
```typescript
// Define Zod schema alongside Prisma model
const ConfigurationSchema = z.object({
  icloudUsername: z.string().email(),
  icloudPassword: z.string().min(8),
  frameHost: z.string().ip().or(z.string().regex(/^[a-z0-9\-\.]+$/)),
  syncInterval: z.number().int().min(30).max(3600),
})

// Use for validation before database operations
const validatedConfig = ConfigurationSchema.parse(userInput)
```

### Decision: Credential Encryption with crypto module

**Rationale**:
- Node.js built-in `crypto` module for AES-256-GCM encryption (addresses FR-005)
- No external dependencies for encryption
- Encryption key derived from environment variable or generated on first run
- Encrypted fields stored as TEXT in SQLite

**Alternatives Considered**:
1. **bcrypt**: One-way hashing, not suitable for retrievable credentials
2. **keytar**: System keychain integration, adds platform dependency
3. **node-vault**: External service dependency, overcomplicated

**Implementation Approach**:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// Encrypt before storing
function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}
```

## 2. UI Consolidation Strategy

### Decision: Configuration Page Sections with React Hook Form

**Rationale**:
- React Hook Form provides form state management with minimal re-renders
- Built-in validation integration with Zod via `@hookform/resolvers`
- Section-based form matches spec requirement (iCloud, Frame, Sync sections)
- Controlled components with TypeScript types from Zod schemas

**Alternatives Considered**:
1. **Formik**: More mature but heavier, slower performance with large forms
2. **Plain React state**: Too much boilerplate, no validation integration
3. **Material-UI forms**: Component library lock-in, not flexible enough

**Implementation Approach**:
```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

const ConfigurationPage = () => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(ConfigurationSchema),
    defaultValues: async () => api.getConfiguration()
  })

  // Three accordion sections: iCloud, Frame TV, Sync Settings
}
```

### Decision: Dashboard Simplification with Real-time Updates

**Rationale**:
- Remove all configuration fields from Dashboard
- Server-Sent Events (SSE) for real-time status updates (addresses FR-008)
- Simpler than WebSockets for unidirectional server→client updates
- EventSource API built into browsers, no external library needed

**Alternatives Considered**:
1. **Polling**: Simple but inefficient, delays up to 1 second (violates SC-004)
2. **WebSockets**: Bidirectional overhead not needed, requires socket.io dependency
3. **Long polling**: More complex than SSE, no browser API support

**Implementation Approach**:
```typescript
// Server
app.get('/api/sync/status/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')

  const sendUpdate = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  syncService.on('statusChange', sendUpdate)
})

// Client
const eventSource = new EventSource('/api/sync/status/stream')
eventSource.onmessage = (event) => setStatus(JSON.parse(event.data))
```

## 3. Photo Gallery Pagination

### Decision: Cursor-based Pagination with Virtual Scrolling

**Rationale**:
- Handles large photo collections efficiently (addresses SC-006)
- Cursor-based pagination more reliable than offset with changing data
- React-window for virtual scrolling reduces DOM nodes (addresses FR-010)
- Maintains scroll position during navigation

**Alternatives Considered**:
1. **Offset pagination**: Page drift issues when photos added/deleted
2. **Load all at once**: Memory issues with 10,000+ photos
3. **Infinite scroll without virtualization**: DOM performance degrades

**Implementation Approach**:
```typescript
import { FixedSizeGrid } from 'react-window'

// API returns cursor for next page
type PhotoPage = {
  photos: Photo[]
  nextCursor: string | null
  hasMore: boolean
}

// Virtual grid for thumbnail display
<FixedSizeGrid
  columnCount={4}
  columnWidth={200}
  height={600}
  rowCount={Math.ceil(photos.length / 4)}
  rowHeight={200}
  width={800}
>
  {({ columnIndex, rowIndex, style }) => (
    <PhotoThumbnail photo={photos[rowIndex * 4 + columnIndex]} style={style} />
  )}
</FixedSizeGrid>
```

### Decision: Album Fetching with Incremental Loading

**Rationale**:
- Fetch all albums on initial load (typically < 100 albums per user)
- Cache album list in React Query with 5-minute stale time
- Photos fetched per-album on-demand with cursor pagination
- Addresses FR-009 (display ALL albums) and FR-011 (all photos in album)

**Implementation Approach**:
```typescript
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'

// Albums: fetch once, cache
const { data: albums } = useQuery({
  queryKey: ['albums'],
  queryFn: () => api.getAllAlbums(),
  staleTime: 5 * 60 * 1000, // 5 minutes
})

// Photos: paginated by album
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['photos', albumId],
  queryFn: ({ pageParam }) => api.getPhotos(albumId, pageParam),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})
```

## 4. Docker Deployment Optimization

### Decision: Multi-stage Dockerfile with Prisma Generation

**Rationale**:
- Build stage generates Prisma client before copying to runtime
- Minimizes final image size by excluding dev dependencies
- Database migrations run on container startup via entrypoint script
- Volume mount for SQLite database ensures persistence (addresses SC-007)

**Implementation Approach**:
```dockerfile
# Build stage
FROM node:slim AS builder
WORKDIR /app
COPY package*.json prisma ./
RUN npm ci && npx prisma generate
COPY . .
RUN npm run build

# Runtime stage
FROM node:slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/web-app.js"]
```

**Entrypoint Script**:
```bash
#!/bin/sh
set -e

# Run migrations
npx prisma migrate deploy

# Start application
exec "$@"
```

## 5. State Migration Strategy

### Decision: Automatic JSON to SQLite Migration

**Rationale**:
- Detect existing JSON state file on startup
- Parse and import into SQLite database
- Backup original JSON file, don't delete (safety)
- One-time migration, subsequent starts use SQLite only

**Implementation Approach**:
```typescript
async function migrateFromJsonIfNeeded() {
  const jsonPath = '~/.icloud-frame-sync/state.json'
  const dbPath = './data/sync.db'

  if (fs.existsSync(jsonPath) && !fs.existsSync(dbPath)) {
    const jsonState = JSON.parse(fs.readFileSync(jsonPath))
    await prisma.$transaction(async (tx) => {
      // Import configuration
      await tx.configuration.create({ data: jsonState.config })
      // Import photo records
      await tx.photoRecord.createMany({ data: jsonState.photos })
    })
    fs.copyFileSync(jsonPath, `${jsonPath}.backup`)
  }
}
```

## 6. Testing Strategy

### Decision: Prisma Test Database with Cleanup

**Rationale**:
- Separate test database prevents pollution of dev data
- Each test suite gets fresh database from schema
- Fast reset with `prisma migrate reset --skip-seed`
- In-memory SQLite for unit tests (`:memory:`)

**Implementation Approach**:
```typescript
// test/helpers/db.ts
export async function setupTestDatabase() {
  process.env.DATABASE_URL = ':memory:'
  await prisma.$connect()
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')
  // Apply migrations
  execSync('npx prisma migrate deploy', { stdio: 'ignore' })
}

export async function cleanupTestDatabase() {
  await prisma.$disconnect()
}

// In test files
beforeAll(setupTestDatabase)
afterAll(cleanupTestDatabase)
afterEach(async () => {
  // Clear all tables
  await prisma.photoRecord.deleteMany()
  await prisma.configuration.deleteMany()
})
```

## 7. Performance Considerations

### Decision: Database Indexing and Query Optimization

**Rationale**:
- Index frequently queried fields (photo checksums, sync timestamps)
- Use Prisma's includeRelations sparingly to avoid N+1 queries
- Batch operations with `createMany`, `updateMany`
- Connection pooling configured for concurrent web requests

**Implementation Approach**:
```prisma
model PhotoRecord {
  id            String   @id @default(cuid())
  checksum      String   @unique // Index for duplicate detection
  lastSyncedAt  DateTime? @index // Index for query filters
  // ... other fields
}

// Configure connection pool
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error', 'warn'],
  // SQLite connection pooling
})
```

## Summary of Technology Stack

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Database | SQLite | Single-user, file-based, zero config |
| ORM | Prisma | Type-safe, migrations, client generation |
| Validation | Zod | Runtime validation, type inference |
| Encryption | Node crypto | Built-in, no dependencies, AES-256-GCM |
| UI Forms | React Hook Form | Performance, Zod integration |
| Real-time | Server-Sent Events | Unidirectional, browser native |
| Pagination | Cursor-based | Reliable with changing data |
| Virtual Scrolling | react-window | DOM performance for large lists |
| State Management | React Query | Server state caching, deduplication |
| Docker | Multi-stage build | Size optimization, security |

All decisions align with constitution principles:
- ✅ Type Safety First: Prisma + Zod provide end-to-end types
- ✅ Service-Oriented: Clear data layer separation
- ✅ Dual Interface: Database accessible via API and direct Prisma client
- ✅ Performance: Indexing, pooling, virtual scrolling, cursor pagination
- ✅ Testing: Isolated test databases, fast resets

## Next Phase

Proceed to Phase 1: Generate data-model.md with Prisma schema definitions and contracts/ with API specifications.
