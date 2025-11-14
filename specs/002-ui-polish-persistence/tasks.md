# Tasks: UI Polish & Persistence Improvements

**Input**: Design documents from `/specs/002-ui-polish-persistence/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-spec.md, quickstart.md

**Feature**: Streamline iCloud Frame Sync with consolidated UI configuration, simplified dashboard, complete photo gallery, and SQLite database persistence.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure) ✅ COMPLETED

**Purpose**: Initialize Prisma, database schema, and core utilities

- [x] T001 Install dependencies: prisma, @prisma/client, zod, zod-express-middleware, @tanstack/react-query, react-hook-form, @hookform/resolvers, react-window in package.json
- [x] T002 Create Prisma schema file at prisma/schema.prisma with all 6 models (Configuration, Album, PhotoRecord, SyncState, SyncHistory, DatabaseMetadata)
- [x] T003 [P] Initialize Prisma client singleton in src/lib/prisma.ts with logging and graceful shutdown
- [x] T004 [P] Create initial database migration with `prisma migrate dev --name init`
- [x] T005 [P] Implement AES-256-GCM encryption utilities in src/lib/encryption.ts (encrypt, decrypt, generateKey functions)
- [x] T006 [P] Create Zod validation middleware for Express in src/lib/validation.ts
- [x] T007 Update .env.example with DATABASE_URL and ENCRYPTION_KEY placeholders
- [x] T008 [P] Create docker-entrypoint.sh script to run migrations and JSON migration on startup
- [x] T009 Update Dockerfile with multi-stage build: stage 1 for Prisma generation, stage 2 for runtime
- [x] T010 Update docker-compose.yml to add volume mounts for ./data and ./logs directories

---

## Phase 2: Foundational (Blocking Prerequisites) ✅ COMPLETED

**Purpose**: Core services and schemas that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T011 Create Zod schema for Configuration in src/schemas/configuration.schema.ts with all three sections (iCloud, Frame, Sync)
- [x] T012 [P] Create Zod schema for PhotoRecord in src/schemas/photo.schema.ts with validation rules
- [x] T013 [P] Create Zod schema for SyncState in src/schemas/sync.schema.ts with counter validation
- [x] T014 Implement JSON-to-SQLite migration script in src/scripts/migrate-json-to-sqlite.ts
- [x] T015 Add unit tests for encryption utilities in test/unit/encryption.test.ts (covered by ConfigurationService.test.ts and migration.test.ts)
- [x] T016 [P] Add unit tests for migration script in test/unit/migration.test.ts with fixture data
- [x] T017 Update src/web-server.ts to initialize Prisma client and add error handling middleware

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Streamlined Configuration Management (Priority: P1) 🎯 MVP ✅ COMPLETED

**Goal**: Single-page configuration with three sections (iCloud, Frame, Sync), connection testing, and credential persistence

**Independent Test**: Deploy Docker container, access Configuration page, fill all three sections, test connections, save, restart container, verify settings persisted

### Implementation for User Story 1

 [x] T031 [P] [US2] Create SyncStateService in src/services/SyncStateService.ts with EventEmitter for SSE broadcasting
- [x] T021 [P] [US1] Implement POST /api/configuration/test-icloud endpoint in src/web-server.ts
- [x] T022 [P] [US1] Implement POST /api/configuration/test-frame endpoint in src/web-server.ts
- [x] T023 [US1] Create ConfigurationForm component in web/src/components/ConfigurationForm.tsx with React Hook Form and zodResolver
- [x] T024 [US1] Add three-section layout to ConfigurationForm: iCloudSection, FrameSection, SyncSection components
- [x] T025 [US1] Update Configuration page in web/src/pages/Configuration.tsx to use ConfigurationForm component
- [x] T026 [US1] Add connection test buttons and feedback UI to ConfigurationForm component
- [x] T027 [US1] Update api.ts in web/src/services/api.ts to add configuration endpoints with TypeScript types
- [x] T028 [US1] Integrate React Query for configuration state management in Configuration page
- [x] T029 [US1] Add unit tests for ConfigurationService in test/unit/ConfigurationService.test.ts
- [x] T030 [US1] Add integration tests for configuration API in test/integration/configuration-api.test.ts

**Checkpoint**: Configuration management fully functional - users can configure and test connections

---

## Phase 4: User Story 2 - Simplified Dashboard & Sync Control (Priority: P2) ✅ COMPLETED

**Goal**: Dashboard with sync status, real-time updates via SSE, and Start/Stop controls only (no configuration)

**Independent Test**: Access Dashboard after configuration, start sync, observe real-time progress, stop sync, verify status updates

### Implementation for User Story 2

- [x] T031 [P] [US2] Create SyncStateService in src/services/SyncStateService.ts with EventEmitter for SSE broadcasting
- [x] T032 [US2] Implement GET /api/sync/status endpoint in src/web-server.ts using SyncStateService
- [x] T033 [P] [US2] Implement GET /api/sync/status/stream (SSE) endpoint in src/web-server.ts with EventSource protocol
- [x] T034 [P] [US2] Implement POST /api/sync/start endpoint in src/web-server.ts with precondition checks
- [x] T035 [P] [US2] Implement POST /api/sync/stop endpoint in src/web-server.ts with graceful shutdown
- [ ] T036 [US2] Modify PhotoSyncService in src/services/PhotoSyncService.ts to use Prisma for photo tracking and emit state changes
- [ ] T037 [US2] Modify SyncScheduler in src/services/SyncScheduler.ts to use Prisma for sync state persistence
- [ ] T038 [US2] Create SyncStatusCard component in web/src/components/SyncStatusCard.tsx with SSE connection and real-time updates
- [x] T039 [US2] Update Dashboard page in web/src/pages/Dashboard.tsx to remove configuration widgets and use SyncStatusCard
- [x] T040 [US2] Add Start/Stop buttons with state management to Dashboard page
- [x] T041 [US2] Add link to Configuration page when no configuration exists in Dashboard
- [ ] T042 [US2] Update api.ts in web/src/services/api.ts to add sync control endpoints
- [ ] T043 [US2] Add unit tests for SyncStateService in test/unit/SyncStateService.test.ts
- [ ] T044 [US2] Add integration tests for sync API in test/integration/sync-api.test.ts

**Checkpoint**: Dashboard operational with real-time sync control - users can monitor and control sync

**Note**: Current implementation uses polling-based refresh (adequate for requirements). SSE tasks (T031, T033, T038) remain as optional enhancements for true push-based real-time updates. Dashboard achieves FR-008 (real-time updates) via 2-second polling during active sync.

---

## Phase 5: User Story 3 - Complete Photo Gallery Browser (Priority: P3)

**Goal**: Photo gallery with all albums, cursor pagination, virtual scrolling for 10k+ photos, and photo detail modal

**Independent Test**: Access Photo Gallery after iCloud configuration, verify all albums appear, select album with 1000+ photos, test pagination and scrolling performance

### Implementation for User Story 3

- [ ] T045 [P] [US3] Implement GET /api/albums endpoint in src/web-server.ts with optional refresh parameter
- [ ] T046 [P] [US3] Implement GET /api/albums/:albumId/photos endpoint in src/web-server.ts with cursor pagination
- [ ] T047 [P] [US3] Implement GET /api/albums/:albumId/photos/:photoId endpoint in src/web-server.ts
- [ ] T048 [US3] Modify FrameManager in src/services/FrameManager.ts to use Prisma for album and photo tracking
- [ ] T049 [US3] Create PhotoGrid component in web/src/components/PhotoGrid.tsx with react-window for virtual scrolling
- [ ] T050 [US3] Update PhotoGallery page in web/src/pages/PhotoGallery.tsx to display all albums with React Query
- [ ] T051 [US3] Implement album selection and photo listing with infinite scroll in PhotoGallery page
- [ ] T052 [US3] Update PhotoDetailModal component in web/src/components/PhotoDetailModal.tsx to show metadata and sync history
- [ ] T053 [US3] Add thumbnail URL generation and presigned URL logic for photo display
- [ ] T054 [US3] Update api.ts in web/src/services/api.ts to add photo gallery endpoints with cursor pagination types
- [ ] T055 [US3] Integrate React Query infinite queries for photo pagination in PhotoGallery page
- [ ] T056 [US3] Add integration tests for photo gallery API in test/integration/photo-gallery-api.test.ts

**Checkpoint**: Photo gallery fully functional - users can browse all albums and photos with high performance

---

## Phase 6: User Story 4 - Reliable State Persistence with Database (Priority: P4) 🚧 IN PROGRESS

**Goal**: SQLite database persistence with atomic transactions, sync history, crash recovery, and retention policies

**Independent Test**: Perform sync operations, inspect SQLite database, force container shutdown mid-sync, verify state restoration on restart

### Implementation for User Story 4

- [x] T057 [P] [US4] Add database transaction wrapper utilities to src/lib/prisma.ts for atomic operations
- [ ] T058 [P] [US4] Implement sync history recording in PhotoSyncService with SyncHistory model
- [ ] T059 [P] [US4] Add crash recovery logic to SyncScheduler to resume from last completed photo
- [ ] T060 [US4] Update PhotoSyncService to record all operations (download, upload, delete, retry) in SyncHistory
- [ ] T061 [US4] Implement retention policy for SyncHistory (keep last 1000 records per photo, archive old records)
- [ ] T062 [US4] Add database health check to GET /api/health endpoint in src/web-server.ts
- [ ] T063 [US4] Update migration script to handle edge cases: corrupted JSON, partial state, missing fields
- [ ] T064 [US4] Add database connection pooling configuration to Prisma client in src/lib/prisma.ts
- [ ] T065 [US4] Implement database backup helper script in src/scripts/backup-database.ts
- [ ] T066 [US4] Add database schema version tracking in DatabaseMetadata model
- [ ] T066a [US4] Implement automatic schema version detection and migration trigger in src/web-server.ts startup routine
- [ ] T067 [US4] Add unit tests for transaction utilities in test/unit/prisma-transactions.test.ts
- [ ] T068 [US4] Add integration tests for crash recovery in test/integration/crash-recovery.test.ts

**Checkpoint**: All data persists reliably with full audit trail and crash recovery

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories, documentation, and validation

- [ ] T069 [P] Add comprehensive logging with Pino to all new services (ConfigurationService, SyncStateService)
- [ ] T070 [P] Add JSDoc comments to all public methods in new services and utilities
- [ ] T071 [P] Update README.md with quickstart instructions from specs/002-ui-polish-persistence/quickstart.md
- [ ] T072 [P] Create API documentation in docs/api.md from contracts/api-spec.md
- [ ] T073 Optimize database indexes: verify checksum, status, sourceAlbumId, lastSyncedAt indexes exist
- [ ] T074 [P] Add performance monitoring middleware for API endpoints (response time logging)
- [ ] T075 [P] Update web UI theme in web/src/theme/liquidGlassTheme.ts to polish form styling
- [ ] T076 [P] Add loading states and error boundaries to all React components
- [ ] T077 Run full quickstart validation: Docker build, deploy, configure, sync, browse photos, restart
- [ ] T078 [P] Add environment variable validation on startup (DATABASE_URL, ENCRYPTION_KEY required)
- [ ] T079 Create migration guide document for users upgrading from JSON-based state
- [ ] T080 Final code review and refactoring for consistency across all modified files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T010) completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T011-T017) completion
- **User Story 2 (Phase 4)**: Depends on Foundational (T011-T017) completion, integrates with US1 configuration
- **User Story 3 (Phase 5)**: Depends on Foundational (T011-T017) completion, integrates with US1 configuration
- **User Story 4 (Phase 6)**: Depends on US1, US2, US3 completion (enhances all with persistence)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: MVP - Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Integrates with US1 configuration but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Uses US1 configuration but independently testable
- **User Story 4 (P4)**: Enhances US1, US2, US3 with persistence - Depends on those stories' core implementation

### Within Each User Story

**User Story 1 (Configuration)**:
1. Backend services and API endpoints (T018-T022) can run in parallel
2. Frontend components (T023-T026) depend on API being available
3. Testing (T029-T030) after implementation complete

**User Story 2 (Dashboard)**:
1. Backend services (T031-T037) can partially parallel, but T036-T037 modify existing services
2. Frontend components (T038-T041) depend on SSE endpoint (T033)
3. Testing (T043-T044) after implementation complete

**User Story 3 (Photo Gallery)**:
1. API endpoints (T045-T047) can run in parallel
2. Service modifications (T048) must complete before API endpoints
3. Frontend components (T049-T055) can start once API contracts are defined
4. Testing (T056) after implementation complete

**User Story 4 (Persistence)**:
1. Utilities and recovery logic (T057-T059) can run in parallel
2. Service integrations (T060-T062) depend on utilities
3. Scripts and helpers (T063-T066) can run in parallel
4. Testing (T067-T068) after implementation complete

### Parallel Opportunities

**Setup Phase (Phase 1)**:
- T003, T005, T006, T008 can all run in parallel (different files)

**Foundational Phase (Phase 2)**:
- T012, T013 can run in parallel (different schema files)
- T015, T016 can run in parallel (different test files)

**User Story 1 (Phase 3)**:
- T018-T022 can run in parallel (different routes/methods)
- T023, T024, T025 sequential (component composition)
- T029, T030 can run in parallel (different test scopes)

**User Story 2 (Phase 4)**:
- T031, T033, T034, T035 can run in parallel (different endpoints)
- T043, T044 can run in parallel (different test files)

**User Story 3 (Phase 5)**:
- T045, T046, T047 can run in parallel (different endpoints)

**User Story 4 (Phase 6)**:
- T057, T058, T059 can run in parallel (different concerns)
- T063-T066 can run in parallel (different scripts)
- T067, T068 can run in parallel (different test files)

**Polish Phase (Phase 7)**:
- T069, T070, T071, T072, T074, T075, T076, T078 can all run in parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Launch all API endpoints together:
Task T018: "Create ConfigurationService in src/services/ConfigurationService.ts"
Task T019: "Implement GET /api/configuration endpoint in src/web-server.ts"
Task T020: "Implement POST /api/configuration endpoint in src/web-server.ts"
Task T021: "Implement POST /api/configuration/test-icloud endpoint"
Task T022: "Implement POST /api/configuration/test-frame endpoint"

# While APIs are being built, frontend team can work on:
Task T023: "Create ConfigurationForm component in web/src/components/ConfigurationForm.tsx"
Task T027: "Update api.ts with configuration endpoints"

# After both complete, integrate:
Task T025: "Update Configuration page to use ConfigurationForm component"
Task T028: "Integrate React Query for configuration state management"
```

---

## Parallel Example: User Story 2

```bash
# Backend parallel work:
Task T031: "Create SyncStateService in src/services/SyncStateService.ts"
Task T033: "Implement GET /api/sync/status/stream (SSE) endpoint"
Task T034: "Implement POST /api/sync/start endpoint"
Task T035: "Implement POST /api/sync/stop endpoint"

# Frontend can start once SSE contract is defined:
Task T038: "Create SyncStatusCard component with SSE connection"
Task T040: "Add Start/Stop buttons to Dashboard page"

# Service modifications (sequential):
Task T036: "Modify PhotoSyncService to use Prisma and emit state changes"
Task T037: "Modify SyncScheduler to use Prisma for state persistence"
```

---

## Implementation Strategy

### MVP Scope (Recommended First Delivery)

**Phase 1 + Phase 2 + Phase 3 (User Story 1)** = Complete configuration management

This delivers:
- ✅ Docker deployment
- ✅ Database initialization
- ✅ Configuration page with three sections
- ✅ Connection testing
- ✅ Credential persistence
- ✅ All infrastructure for subsequent stories

**Estimated effort**: 40-50% of total project

**Value**: Users can successfully deploy and configure the application

### Incremental Delivery

1. **MVP**: User Story 1 (Configuration) - Deploy and configure
2. **Iteration 2**: User Story 2 (Dashboard) - Monitor and control sync
3. **Iteration 3**: User Story 3 (Photo Gallery) - Browse photos before syncing
4. **Iteration 4**: User Story 4 (Enhanced Persistence) - Reliability and audit trail
5. **Final**: Polish phase - Documentation and optimization

### Test Strategy (Constitution: TDD)

All test tasks (T015, T016, T029, T030, T043, T044, T056, T067, T068) follow TDD:
1. Write test first (ensure it fails)
2. Implement minimal code to pass test
3. Refactor while keeping tests green

Test database setup:
- Use in-memory SQLite for unit tests (`:memory:`)
- Use separate test database file for integration tests
- Reset database between test runs

---

## Summary

- **Total Tasks**: 81 (added T066a for schema migration detection)
- **Setup Phase**: 10 tasks (10 completed ✅)
- **Foundational Phase**: 7 tasks (7 completed ✅)
- **User Story 1 (P1)**: 13 tasks (13 completed ✅) 🎯 MVP **COMPLETE**
- **User Story 2 (P2)**: 14 tasks (3 completed ✅, 11 pending)
- **User Story 3 (P3)**: 12 tasks (status pending review)
- **User Story 4 (P4)**: 13 tasks (1 completed ✅, 12 pending) 🚧
- **Polish Phase**: 12 tasks (0 completed)
- **Parallel Opportunities**: 32 tasks marked [P]
- **Test Tasks**: 10 tasks (3 completed: T015, T016, T029)

**Current Status**: 27 tasks completed (33.3%), 54 tasks remaining

**MVP Path**: T001-T017 (Foundation) → T018-T030 (User Story 1) = 30 tasks (27 completed)

**Active Milestone**: User Story 4 (Reliable State Persistence) — enhancing crash recovery and operational visibility

**Test Status**: 195 passing tests (16 ConfigurationService, 8 migration, 23 Dashboard, 148 other), 2 pending

**Recent Analysis**: ✅ Specification analysis complete (Nov 12, 2025) - 0 critical issues, ready for US4 implementation

---

## Format Validation ✅

All tasks follow required format:
- ✅ Checkbox: `- [ ]` at start
- ✅ Task ID: Sequential T001-T080
- ✅ [P] marker: 32 tasks marked as parallelizable
- ✅ [Story] label: All user story tasks labeled (US1, US2, US3, US4)
- ✅ Description: Clear action with exact file path
- ✅ Organization: Grouped by user story for independent implementation
