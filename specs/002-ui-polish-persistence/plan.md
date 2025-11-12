# Implementation Plan: UI Polish & Persistence Improvements

**Branch**: `002-ui-polish-persistence` | **Date**: 2025-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-ui-polish-persistence/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature improves the iCloud Frame Sync application by: (1) consolidating UI configuration into a single page with three logical sections (iCloud, Frame, Sync), (2) simplifying the dashboard to focus solely on sync status and control, (3) implementing complete photo gallery browsing with pagination for all iCloud albums, and (4) replacing JSON file-based state with a persistent SQLite database managed by Prisma ORM with Zod validation. The technical approach uses Prisma for type-safe database access, Zod for runtime validation, React Hook Form for configuration management, Server-Sent Events for real-time dashboard updates, and cursor-based pagination with react-window for efficient photo gallery rendering.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20.x
**Primary Dependencies**:
- Backend: Express.js, Prisma 5.x (ORM), Zod (validation), Pino (logging)
- Frontend: React 18.x, React Query (@tanstack/react-query), React Hook Form, react-window
- Database: SQLite 3.x (file-based)

**Storage**: SQLite database with Prisma ORM (file:./data/sync.db), replaces existing JSON files
**Testing**: Vitest (unit + integration), in-memory SQLite for test isolation
**Target Platform**: Docker container (Node.js Alpine), browser UI (modern browsers)
**Project Type**: Web application (backend API + frontend SPA)
**Performance Goals**:
- Photo gallery: <500ms initial load, smooth scrolling for 10k+ photos (via react-window)
- Real-time dashboard: <100ms SSE event delivery
- Database queries: <50ms p95 with proper indexing

**Constraints**:
- Single-user application (no multi-tenancy)
- Credentials encrypted at rest (AES-256-GCM)
- Zero data loss during JSON-to-SQLite migration
- Docker image <500MB compressed

**Scale/Scope**:
- ~2500 lines of new code (backend + frontend)
- Support for 100k+ photos across unlimited albums
- 6 new database tables (Prisma models)
- 15 API endpoints (10 new, 5 modified)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Type Safety First ✅
- **Status**: PASS
- **Validation**:
  - Prisma generates TypeScript types from schema
  - Zod provides runtime validation with type inference
  - No `any` types introduced
  - Strict TypeScript mode maintained

### Service-Oriented Architecture ✅
- **Status**: PASS
- **Validation**:
  - Clear separation: Database layer (Prisma) → Service layer → API layer
  - Existing services (PhotoSyncService, FrameManager) augmented, not replaced
  - New services: ConfigurationService, SyncStateService
  - Dependency injection maintained

### Test-Driven Development ✅
- **Status**: PASS
- **Validation**:
  - Separate test database (in-memory SQLite)
  - Unit tests for all new services
  - Integration tests for API endpoints
  - Migration script tested with real JSON fixtures

### Dual Interface Pattern ✅
- **Status**: PASS
- **Validation**:
  - Prisma client accessible programmatically
  - REST API for web UI
  - CLI commands for admin tasks (migration, reset)
  - Prisma Studio for manual inspection

### Structured Observability ✅
- **Status**: PASS
- **Validation**:
  - Pino logging maintained throughout
  - Prisma query logging in development
  - SSE events for real-time monitoring
  - Health check endpoint for diagnostics

**Overall**: All constitution gates passed. No violations to track.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
# Backend (Node.js + Express)
src/
├── services/
│   ├── PhotoSyncService.ts      # [MODIFIED] Use Prisma instead of JSON
│   ├── FrameManager.ts          # [MODIFIED] Use Prisma for photo tracking
│   ├── SyncScheduler.ts         # [MODIFIED] Use Prisma for state
│   ├── ConfigurationService.ts  # [NEW] Manage configuration via Prisma
│   └── SyncStateService.ts      # [NEW] Real-time sync state with SSE
├── schemas/
│   ├── configuration.schema.ts  # [NEW] Zod validation schemas
│   ├── photo.schema.ts          # [NEW] Zod validation schemas
│   └── sync.schema.ts           # [NEW] Zod validation schemas
├── lib/
│   ├── prisma.ts               # [NEW] Prisma client singleton
│   ├── encryption.ts           # [NEW] AES-256-GCM credential encryption
│   └── validation.ts           # [NEW] Zod middleware for Express
├── scripts/
│   └── migrate-json-to-sqlite.ts # [NEW] One-time migration script
└── web-server.ts               # [MODIFIED] Add new API routes

# Database
prisma/
├── schema.prisma               # [NEW] Prisma schema definition
└── migrations/
    └── 0001_init.sql           # [NEW] Initial migration

# Frontend (React + Vite)
web/src/
├── pages/
│   ├── Configuration.tsx       # [MODIFIED] Single-page config form
│   ├── Dashboard.tsx           # [MODIFIED] Status only, remove config
│   └── PhotoGallery.tsx        # [MODIFIED] Full album + photo browsing
├── components/
│   ├── ConfigurationForm.tsx   # [NEW] Three-section form with validation
│   ├── SyncStatusCard.tsx      # [NEW] Real-time sync status via SSE
│   └── PhotoGrid.tsx           # [NEW] Virtual scrolling photo grid
└── services/
    └── api.ts                  # [MODIFIED] Add new API endpoints

# Tests
test/
├── unit/
│   ├── ConfigurationService.test.ts  # [NEW]
│   ├── SyncStateService.test.ts      # [NEW]
│   ├── encryption.test.ts            # [NEW]
│   └── migration.test.ts             # [NEW]
└── integration/
    ├── configuration-api.test.ts     # [NEW]
    ├── sync-api.test.ts              # [NEW]
    └── photo-gallery-api.test.ts     # [NEW]

# Docker
Dockerfile                      # [MODIFIED] Multi-stage with Prisma
docker-compose.yml              # [MODIFIED] Add volume mounts
docker-entrypoint.sh            # [NEW] Run migrations + migration script

# Configuration
.env.example                    # [MODIFIED] Add DATABASE_URL, ENCRYPTION_KEY
```

**Structure Decision**: Web application structure (Option 2) with backend API in `src/` and frontend SPA in `web/src/`. This matches the existing project structure. New files focus on database layer (Prisma, schemas), configuration management, and UI consolidation. Existing service files are modified to use Prisma instead of JSON state.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

**No violations detected.** All constitution principles are satisfied by the proposed design.
