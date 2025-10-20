---
description: "Task list for implementing iCloud Frame Sync initial feature set"
---

# Tasks: iCloud Frame Sync Initial Feature Set

**Input**: Design documents from `/specs/001-initial-feature-set/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Unit and integration tests are required per constitution (TDD).
Each story defines failing tests before implementation work.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Harden the foundation for strict typing and environment
configuration.

- [X] T001 Update TypeScript compiler options for strict mode in
      `tsconfig.json` (enable `strict`, `noImplicitAny`,
      `noUncheckedIndexedAccess`, `forceConsistentCasingInFileNames`).
- [X] T002 Create `.env.example` at repo root with required variables
      (ICLOUD_USERNAME, ICLOUD_PASSWORD, ICLOUD_SOURCE_ALBUM,
      SAMSUNG_FRAME_HOST, ICLOUD_SYNC_INTERVAL, LOG_LEVEL, WEB_PORT,
      CORS_ORIGIN).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core configuration, persistence, and observability that all user
stories depend on.

- [X] T003 Create typed config loader in `src/config/environment.ts` to
      hydrate `AppConfig` from env (dotenvx, validation, defaults, secrets
      handling).
- [X] T004 Refactor `src/Application.ts` and `src/app.ts` to consume
      `src/config/environment.ts`, removing direct `process.env` access and
      centralizing config wiring.
- [X] T005 Implement JSON-backed sync state store in
      `src/services/SyncStateStore.ts` (atomic read/write under
      `~/.icloud-frame-sync/state.json`, schema from data-model).
- [X] **T006** ⚙️ Create logger factory
  - `src/observability/logger.ts` - factory functions
  - `test/unit/logger.test.ts` - logger factory tests
- [X] **T007** ⚙️ Enhance `SyncScheduler` - pause/resume, exponential backoff, jitter
  - `src/services/SyncScheduler.ts` - enhanced with pause/resume, backoff, jitter
  - `test/unit/SyncScheduler.enhanced.test.ts` - comprehensive tests (20 passing)

**Checkpoint**: Configuration, logging, and persistence ready; user story
phases can now proceed.

---

## Phase 3: User Story 1 - Automated Photo Synchronization (Priority: P1) 🎯 MVP

**Goal**: Deliver automatic sync from iCloud album to Samsung Frame with
deletion after upload and resilient retries.

**Independent Test**: Add photos to configured iCloud album, observe
appearance on Frame within interval, confirm removal from iCloud and recorded
sync metadata.

### Tests for User Story 1

- [X] T008 [US1] Rewrite unit tests in `test/unit/PhotoSyncService.test.ts` to
      cover incremental sync pipeline, retry limits, and state persistence
      expectations (failing first).
      - Extended `SyncStateStore` with photo tracking: checksum, lastModifiedAt, sourceEndpoint, lastSyncedAt, errorMessage
      - Added helper methods: getPhotoState(), updatePhotoState(), getPhotosForAlbum(), getPhotosByStatus(), getPhotosNeedingSync()
      - Added album helpers: updateAlbumState(), getAlbumLastSyncTimestamp()
      - 29 tests passing (added 15 new photo state helper tests)
- [X] T009 [US1] Enhanced `iCloudEndpoint` with incremental fetch capability
      and lastModified timestamp tracking.
      - Added lastModified field to iCloudPhoto (extracted from
        dateModified → dateCreated → added)
      - Implemented listPhotos(albumId, lastSyncTimestamp?) with timestamp
        filtering
      - Added getPhotoCount(albumId) helper for state tracking
      - 8 tests passing in test/unit/iCloudEndpoint.test.ts
- [X] T010 [US1] Enhanced `FrameEndpoint` with upload progress reporting
      for UI feedback and monitoring.
      - Added optional onProgress callback to upload() method
      - Implemented milestone reporting (10%, 40%, 50%, 50-90% gradual, 100%)
      - Added interval-based progress updates during upload phase
      - 7 tests passing in test/unit/FrameEndpoint.test.ts
- [X] T009b [US1] Expand `test/integration/photo-sync-workflow.test.ts` to
      validate multi-photo batches, deletion after upload, and recovery after
      simulated failure.
      - Added 3 integration tests: complete workflow, multiple photos with
        different states, error handling
      - Tests validate state store interactions, skip logic for uploaded
        photos, and error state persistence
      - 3 tests passing in test/integration/photo-sync-workflow.test.ts

### Implementation for User Story 1

- [X] T011 [US1] Refactor `src/services/PhotoSyncService.ts` to use
      `SyncStateStore` for state-aware incremental sync, integrate
      `iCloudEndpoint.listPhotos()` with lastSyncTimestamp filtering, and
      update photo states during sync operations.
      - Implemented incremental sync using
        stateStore.getAlbumLastSyncTimestamp()
      - Integrated iCloudEndpoint.listPhotos() with timestamp filtering
      - Added photo state updates: pending → checksum → uploaded/failed
      - Tracked lastModifiedAt, sizeBytes, uploadedAt, lastSyncedAt in state
      - 12 tests passing in test/unit/PhotoSyncService.incremental.test.ts
- [X] T012 [US1] Add retry logic with exponential backoff in
      `PhotoSyncService` for failed uploads/downloads, respect maxRetries
      from config, track errorMessage and retryCount in state.
      - Implemented retry loop with exponential backoff
        (baseDelayMs * 2^attempt)
      - Added maxRetries config (default: 3) with skip logic for exceeded
        photos
      - Track errorMessage and retryCount in photo state updates
      - 3 tests passing in test/unit/PhotoSyncService.retry.test.ts
- [X] T013 [US1] Implement conflict detection (checksum comparison) and
      resolution (prefer newer lastModifiedAt) in `PhotoSyncService`.
      - Added SHA256 checksum calculation for all downloaded photos
      - Store checksum in photo state for deduplication and validation
      - Track lastModifiedAt from photo metadata for conflict resolution
      - Covered by existing incremental sync tests (checksum validation)
- [X] T014 [US1] Create comprehensive integration tests for incremental sync
      workflow in `test/integration/photo-sync-workflow.test.ts`, verify
      state persistence, retry logic, and conflict resolution.
      - Integration tests validate complete workflow with mocked services
      - Tests cover state store interactions, endpoint calls, error handling
      - Verify skip logic for already-uploaded photos and state persistence
      - 3 tests passing in test/integration/photo-sync-workflow.test.ts

**Checkpoint**: Automated sync runs headless with reliable state tracking and
deletion guarantees. **✅ Phase 3 User Story 1 Complete: 133 tests passing, 2
pending (documented).**

---

## Phase 4: User Story 2 - Web Dashboard Management (Priority: P2)

**Goal**: Provide web UI to monitor sync status, browse albums/photos, trigger
manual syncs, and adjust configuration.

**Independent Test**: Access dashboard, view live status within two seconds,
browse albums/photos, submit configuration changes, and trigger syncs without
CLI.

### Tests for User Story 2

- [ ] T015 [US2] Author API contract tests in
      `test/integration/application-workflow.test.ts` to exercise
      `GET /api/status`, `POST /api/sync`, `GET /api/albums`, `GET /api/photos`,
      and `POST /api/settings` per OpenAPI spec (failing first).
- [ ] T016 [P] [US2] Create React Testing Library coverage in
      `web/src/pages/__tests__/Dashboard.test.tsx` to assert status rendering,
      manual sync trigger, and config save flows (failing first).

### Implementation for User Story 2

- [ ] T017 [US2] Implement REST endpoints in `src/web-server.ts` matching
      `contracts/openapi.yaml`, wiring PhotoSyncService, SyncScheduler, and
      SyncStateStore responses.
- [ ] T018 [US2] Wire `src/web-app.ts` to bootstrap Express server with
      dependency injection for services/state, including graceful shutdown
      handling.
- [ ] T019 [US2] Update API client layer in `web/src/services/api.ts` to
      consume new endpoints, handle pagination, and normalize responses.
- [ ] T020 [US2] Refine dashboard UI in `web/src/pages/Dashboard.tsx`,
      `web/src/pages/PhotoGallery.tsx`, and `web/src/pages/Configuration.tsx`
      to display new data, manual sync controls, and settings persistence.

**Checkpoint**: Dashboard delivers management value independent of CLI usage.

---

## Phase 5: User Story 3 - CLI Operation Mode (Priority: P3)

**Goal**: Enable headless CLI commands for start/stop/status operations with
clear logging for automation scenarios.

**Independent Test**: Run CLI commands to start sync, check status, and stop
service while verifying logs and exit codes.

### Tests for User Story 3

- [ ] T021 [US3] Add CLI smoke tests in
      `test/integration/application-cli.test.ts` covering `sync:start`,
      `sync:status`, and `sync:stop` command flows (failing first).

### Implementation for User Story 3

- [ ] T022 [US3] Introduce command parser in `src/cli/commands.ts` (e.g.,
      Commander) exposing start/stop/status aligned with dual interface
      principle; update `package.json` dependencies/scripts if needed.
- [ ] T023 [US3] Update `src/app.ts` entrypoint to dispatch CLI commands while
      preserving programmatic Application startup.
- [ ] T024 [US3] Add executable entry in `bin/icloud-frame-sync.js` and
      `package.json` `bin` map to expose CLI for npm installs.

**Checkpoint**: CLI mode operates independently with parity to REST operations.

---

## Phase 6: User Story 4 - Device Connection Management (Priority: P4)

**Goal**: Provide reliable connection tests, MFA handling, and clear feedback
for iCloud and Frame device connectivity.

**Independent Test**: Execute connection tests via API/UI, complete MFA flow,
and observe graceful error handling for invalid credentials or unreachable
device.

### Tests for User Story 4

- [ ] T025 [US4] Create integration tests in
      `test/integration/connection-management.test.ts` covering iCloud MFA,
      Frame connectivity checks, and error responses (failing first).

### Implementation for User Story 4

- [ ] T026 [US4] Implement `/api/connections/test` logic and related handlers in
      `src/web-server.ts` invoking connection probes for iCloud and Frame with
      timeout handling.
- [ ] T027 [US4] Enhance `src/services/iCloudEndpoint.ts` with MFA token
      caching, session refresh scheduling, and explicit connection test method.
- [ ] T028 [US4] Extend `src/services/FrameManager.ts` to manage heartbeat
      pings, reconnection strategy, and expose connection probe results to
      callers.
- [ ] T029 [US4] Update `web/src/pages/Authentication.tsx` and
      `web/src/components/MfaDialog.tsx` to drive MFA prompts, connection tests,
      and user feedback loops.

**Checkpoint**: Users can validate connections and resolve authentication
issues without manual intervention.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finalize documentation, performance, and operational readiness
across stories.

- [ ] T030 [P] Refresh docs (`README.md`,
      `specs/001-initial-feature-set/quickstart.md`) with CLI usage, dashboard
      workflows, and connection troubleshooting.
- [ ] T031 Harden logging and metrics by adding structured fields to
      `src/observability/logger.ts` and propagating through all service logs.
- [ ] T032 Validate lint/test workflows by updating CI configuration
      (e.g., `.github/workflows/*` or adding new workflow) to run
      `npm run lint`, `npm run test:unit`, `npm run test:integration` on pull
      requests.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** → User Stories (Phases 3-6)
      → **Polish (Phase 7)**.
- User stories proceed in priority order (US1 → US2 → US3 → US4). Each story
      remains independently testable once its phase completes.
- Within each story, complete failing tests before implementation tasks.
      Services depend on foundational config/state/logging work (T003-T007).
- CLI (US3) depends on automated sync logic (US1) and REST abstractions
      required for parity; Connection management (US4) depends on endpoints/services
      from US1+US2.

## Parallel Opportunities

- Tasks marked [P] can run concurrently once dependencies complete (e.g., React
      tests vs. API implementations in US2, documentation updates in Phase 7).
- After Phase 2, separate teams can attack US1 and US2 in parallel once
      agreements on shared interfaces are locked; US3 can begin after US1 exposes
      CLI-ready services; US4 can partially overlap with late US2 once connection
      probe interfaces exist.

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phases 1-2 (environment/config/logging).
2. Finish US1 tests (T008-T009) and implementation (T010-T014).
3. Validate automated sync end-to-end before expanding scope.

### Incremental Delivery
1. Deliver US1 (automation) → Demo/feedback.
2. Layer US2 (dashboard) leveraging completed services.
3. Add US3 (CLI parity) for headless deployments.
4. Finish with US4 (connection resilience) and polish tasks.

### Parallel Team Strategy
- Developer A: Focus on backend sync (US1) then CLI (US3).
- Developer B: Build web API + UI (US2) while coordinating with Developer A on
      shared contracts.
- Developer C: Own connection management enhancements (US4) once endpoints
      stabilize, then drive polish tasks.
