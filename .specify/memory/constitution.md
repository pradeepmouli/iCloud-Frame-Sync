<!--
Sync Impact Report:
- Version change: INITIAL → 1.0.0
- Modified principles: Initial creation based on main.instructions.md
- Added sections: All sections (new constitution)
- Removed sections: None (new constitution)
- Templates requiring updates: ✅ All existing templates compatible
- Follow-up TODOs: None
-->

# iCloud Frame Sync Constitution

## Core Principles

### I. Service-Oriented Architecture

Every major feature MUST be implemented as an independent service with clear boundaries. Services MUST be self-contained, independently testable, and documented with explicit interfaces. No service dependencies allowed except through defined contracts (TypeScript interfaces). All services MUST expose functionality through both programmatic APIs and CLI interfaces where applicable.

**Rationale**: Enables independent development, testing, and maintenance of photo sync, Frame TV management, and web UI components while maintaining system coherence.

### II. Type Safety First (NON-NEGOTIABLE)

All code MUST be written in TypeScript with strict type checking enabled. No `any` types except in rare, documented cases with explicit TODO comments. All public APIs MUST have complete TypeScript interfaces. Generated code MUST pass type checking and linting without exceptions.

**Rationale**: Prevents runtime errors in photo synchronization operations where data integrity is critical, and ensures maintainable code as the system scales.

### III. Test-Driven Development

TDD mandatory for all new features: Tests written → User approval → Tests fail → Then implement. Red-Green-Refactor cycle strictly enforced. Both unit tests (individual services) and integration tests (service interactions, external API communication) required.

**Rationale**: Photo synchronization involves destructive operations (deleting from iCloud) that require absolute reliability and correctness.

### IV. Dual Interface Pattern

Every service MUST provide both CLI and programmatic interfaces. CLI interfaces follow stdin/args → stdout pattern with structured logging to stderr. Web UI communicates with services via REST API, never directly with business logic.

**Rationale**: Supports both automated operation and interactive web-based management while maintaining clear separation of concerns.

### V. Structured Observability

All operations MUST use structured logging (Pino) with appropriate log levels. Critical operations (photo download, upload, deletion) MUST be logged with correlation IDs. Error handling MUST include context and be user-actionable. All async operations MUST include proper error boundaries.

**Rationale**: Essential for debugging synchronization issues and monitoring automated operations running unattended.

## Code Quality Standards

### TypeScript & Formatting Requirements

- **Prettier** for code formatting (NON-NEGOTIABLE)
- **ESLint** with Airbnb style guide and TypeScript rules
- **No unused variables or imports** - must pass linting
- **No console statements** in production code - use structured logging
- **camelCase** for variables/functions, **PascalCase** for classes/components, **UPPER_SNAKE_CASE** for constants

### Documentation Standards

- **JSDoc comments** required for all public functions and classes
- **TypeDoc** for generating API documentation
- **Clear commit messages** in present tense (e.g., "Fixes sync timing issue")
- **README updates** required for any new configuration or usage patterns

### Dependency Management

- **npm** for package management with locked versions
- **Security audits** required before dependency updates
- **No deprecated packages** - must have active maintenance
- **Minimal dependencies** - justify each addition

## Development Workflow

### Branch Strategy & Reviews

- **Feature branches** for all changes (`feature/###-description`)
- **Pull requests** required for all changes to main
- **Code review** mandatory with focus on type safety and test coverage
- **Integration tests** must pass before merge

### Quality Gates

- **TypeScript compilation** with zero errors
- **ESLint** with zero warnings
- **Test coverage** maintained (unit + integration)
- **Security audit** clean (npm audit)

### Performance & Security

- **Response times** < 200ms for web UI operations
- **Photo processing** must handle large files efficiently
- **Credential security** via app-specific passwords and secure storage
- **HTTPS enforcement** for all web interfaces

## Governance

This constitution supersedes all other development practices. All pull requests and code reviews MUST verify compliance with these principles. Any complexity that violates simplicity principles MUST be explicitly justified in design documents.

Amendments require:

1. Documentation of rationale and impact
2. Approval from project maintainers
3. Migration plan for existing code
4. Update of related templates and documentation

Use `.github/instructions/main.instructions.md` for detailed implementation guidance and coding standards.

**Version**: 1.0.0 | **Ratified**: 2024-10-19 | **Last Amended**: 2024-10-19
