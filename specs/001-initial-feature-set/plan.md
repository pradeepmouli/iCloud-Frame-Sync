# Implementation Plan: iCloud Frame Sync Initial Feature Set

**Branch**: `001-initial-feature-set` | **Date**: 2024-10-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-initial-feature-set/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Deliver the first production-ready release of iCloud Frame Sync. The plan covers
end-to-end automation that monitors an iCloud Photos album, uploads new photos
to Samsung Frame TVs, deletes the originals from iCloud, and exposes both CLI
and web dashboard controls. The architecture keeps PhotoSyncService, Frame
management, iCloud access, and web API/UI as collaborating services with
shared TypeScript contracts and structured observability. Research resolves
storage of sync metadata, retry strategies, and operational best practices for
`icloudjs` and `samsung-frame-connect`.

## Technical Context

**Language/Version**: TypeScript 5.9 + Node.js 20 (runtime target ≥ 18)
**Primary Dependencies**: `icloudjs`, `samsung-frame-connect`, `express`,
`@emotion/*`, `@mui/*`, `react`, `pino`, `concurrently`
**Storage**: Local JSON config + cached credentials on disk; in-memory sync
state persisted via structured logs (no external DB)
**Testing**: Mocha + Chai + Sinon for services; React Testing Library for web
components; integration tests via Mocha suites
**Target Platform**: Headless Node.js service (CLI + API) and browser-based
React dashboard accessed via modern desktop browsers
**Project Type**: Web application with shared backend + frontend workspaces
**Performance Goals**: New photos rendered on Frame TV within 60 seconds;
dashboard responses under 2 seconds; per-photo processing under 30 seconds
**Constraints**: Strict TypeScript types; structured logging with correlation
IDs; retry failed sync within 5 minutes; maintain secure handling of secrets
**Scale/Scope**: Single household deployment (1-3 Frame TVs, <5 concurrent
users) with ability to batch up to 50 photos per sync window

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Service-Oriented Architecture**: Maintain clear module boundaries across
  PhotoSyncService, FrameManager, Web API, and frontend. No hidden couplings.
- **Type Safety First**: Enforce `tsconfig` strict mode, no `any`, shared
  interfaces for API contracts, and typed logging helpers.
- **Test-Driven Development**: Author failing unit + integration tests before
  implementing sync flows; ensure CLI and REST interfaces each have coverage.
- **Dual Interface Pattern**: Ensure CLI commands mirror REST capabilities and
  share core services. Use adapters rather than duplicating business logic.
- **Structured Observability**: Use Pino with correlation IDs, structured
  fields for photo IDs, device IDs, and sync status. No bare `console` calls.

Gate evaluation: No violations anticipated. All principles map directly to
existing architecture and planned deliverables. Compliance tasks are included
in Phase 0/1 outputs and test suites.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (created by `/speckit.tasks`)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/
├── app.ts
├── web-app.ts
├── Application.ts
├── services/
│   ├── FrameEndpoint.ts
│   ├── FrameManager.ts
│   ├── iCloudEndpoint.ts
│   ├── PhotoSyncService.ts
│   ├── SyncScheduler.ts
│   └── syncUtils.ts
├── web-server.ts
└── types/
  ├── endpoint.ts
  ├── icloud.d.ts
  └── index.d.ts

web/
├── index.html
└── src/
  ├── main.tsx
  ├── App.tsx
  ├── components/
  ├── pages/
  ├── services/
  ├── theme/
  └── types/

test/
├── helpers/
├── integration/
├── unit/
└── photo-sync-workflow.test.ts
```

**Structure Decision**: Retain shared monorepo with `src/` for backend/CLI
services, `web/` for React client, and `test/` for Mocha suites. All new work
must respect these folders and avoid cross-layer imports that violate service
boundaries.

## Complexity Tracking

No additional complexity items identified. Track deviations here if future
decisions require them.
