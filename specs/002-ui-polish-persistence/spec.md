# Feature Specification: UI Polish & Persistence Improvements

**Feature Branch**: `002-ui-polish-persistence`
**Created**: 2025-11-06
**Status**: Draft
**Input**: User description: "1. Cleanup, simplify and polish current implementation - User should be able to deploy docker image and use web ui to configure sync process and persist credentials that are used 2. Simplify UI - consolidate redundant widgets (e.g. all configuration should be done on the configuration tab) - Sync screen should be only used for status + start/stop. Separate configuration into sections, iCloud Connection, Frame Connection, Sync configuration 3. Fix other UI issues iCloud browser screen not showing all albums/photos 4. Persist sync state in database e.g. SQLLite"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Streamlined Configuration Management (Priority: P1)

A user deploys the Docker image and accesses the web UI for the first time. They navigate to a single, well-organized Configuration page where they can set up all aspects of the sync service: iCloud credentials, Frame TV connection, and sync preferences. All settings are persisted automatically, and they receive clear feedback on connection status through built-in test buttons. Once configured, credentials and settings are remembered across restarts.

**Why this priority**: This is the foundation for usability - users cannot use the application until they can successfully configure it. Consolidating configuration into one place eliminates confusion and reduces setup time. Docker deployment readiness ensures the application can be easily deployed.

**Independent Test**: Can be fully tested by deploying the Docker container, accessing the web UI, completing the configuration form with all three sections (iCloud, Frame TV, sync settings), testing connections, and verifying settings persist after container restart. Delivers complete setup capability without requiring sync to actually run.

**Acceptance Scenarios**:

1. **Given** user has deployed Docker container and accessed web UI, **When** they navigate to Configuration page, **Then** they see three clearly separated sections: iCloud Connection, Frame Connection, and Sync Configuration
2. **Given** user enters iCloud credentials in Configuration page, **When** they click "Test iCloud Connection", **Then** they receive immediate feedback on connection success/failure with clear error messages
3. **Given** user enters Frame TV IP address in Configuration page, **When** they click "Test Frame Connection", **Then** they receive immediate feedback on device discovery and connection status
4. **Given** user has completed configuration, **When** they restart the Docker container, **Then** all credentials and settings are automatically loaded without re-entering
5. **Given** user updates sync interval in Configuration page, **When** they save changes, **Then** the running sync service adopts the new interval without requiring restart

---

### User Story 2 - Simplified Dashboard & Sync Control (Priority: P2)

A user wants to monitor their photo synchronization and control when it runs. They access a clean Dashboard page that shows only essential status information: current sync state, last sync time, photos synced, and any errors. The page has prominent Start/Stop buttons for manual control and displays real-time progress during sync operations. All configuration options have been removed from this page, focusing it purely on monitoring and control.

**Why this priority**: Separates concerns between configuration (P1) and operation, making the interface more intuitive. Users don't need to hunt for start/stop controls among configuration fields. This delivers immediate value after configuration is complete.

**Independent Test**: Can be tested by accessing the Dashboard after configuration is complete, starting/stopping sync operations, and verifying status updates appear in real-time. Delivers monitoring and control capability independent of configuration changes.

**Acceptance Scenarios**:

1. **Given** user is on Dashboard page, **When** sync is running, **Then** they see real-time progress with current photo being processed, percentage complete, and ETA
2. **Given** user is on Dashboard page, **When** they click "Start Sync", **Then** synchronization begins and status updates in real-time
3. **Given** sync is currently running, **When** user clicks "Stop Sync", **Then** current operation completes gracefully and sync pauses
4. **Given** user is on Dashboard page, **When** sync encounters an error, **Then** error details are displayed prominently with suggested actions
5. **Given** user is on Dashboard page, **When** no configuration exists, **Then** they see a clear message directing them to Configuration page with a direct link

---

### User Story 3 - Complete Photo Gallery Browser (Priority: P3)

A user wants to browse all their iCloud photos and albums through the web interface to verify what content is available before syncing. They navigate to the Photo Gallery page and see a complete, paginated list of all their iCloud albums. When they select an album, they see all photos within it with thumbnails, not just a subset. They can view photo metadata and manually select specific photos to sync to their Frame TV.

**Why this priority**: Enhances user confidence and control but isn't required for basic sync functionality. Users can operate the sync service without browsing photos first, but this feature improves the experience by providing visibility and selective sync capability.

**Independent Test**: Can be tested by accessing the Photo Gallery after iCloud configuration, verifying all albums appear, selecting albums to view all contained photos, and testing pagination through large photo collections. Delivers photo browsing capability independent of actual sync operations.

**Acceptance Scenarios**:

1. **Given** user has configured iCloud credentials, **When** they navigate to Photo Gallery page, **Then** they see all available iCloud albums listed with photo counts
2. **Given** user selects an album in Photo Gallery, **When** the album contains more than the page size, **Then** pagination controls appear and allow browsing all photos
3. **Given** user is viewing photos in an album, **When** they click on a photo thumbnail, **Then** they see full metadata including filename, date, size, and dimensions
4. **Given** user is browsing Photo Gallery, **When** they select specific photos and click "Sync Selected", **Then** only those photos are queued for sync to Frame TV
5. **Given** Photo Gallery is displaying albums, **When** user adds new albums in iCloud, **Then** refreshing the gallery shows the newly added albums

---

### User Story 4 - Reliable State Persistence with Database (Priority: P4)

A system administrator wants the application to maintain reliable state across restarts, crashes, and long-running operations. The application uses a SQLite database to persist all configuration, sync history, photo tracking, and operational state. This ensures data integrity during concurrent operations and provides query capabilities for reporting and troubleshooting.

**Why this priority**: Improves reliability and maintainability but the application can function with file-based persistence. This is an architectural improvement that enables future features like sync history analysis and multi-user support.

**Independent Test**: Can be tested by performing sync operations, inspecting the SQLite database directly to verify data structure, forcing unexpected shutdowns, and confirming state is correctly restored. Delivers enhanced persistence independent of UI changes.

**Acceptance Scenarios**:

1. **Given** application is running sync operations, **When** Docker container is forcibly stopped mid-sync, **Then** on restart, sync resumes from last completed photo without data loss
2. **Given** sync has processed 1000 photos over multiple sessions, **When** user queries sync history, **Then** all operations are recorded with timestamps, outcomes, and error details
3. **Given** multiple configuration updates occur rapidly, **When** database writes are triggered, **Then** all changes are persisted atomically without corruption
4. **Given** application has accumulated 6 months of sync history, **When** database size exceeds 100MB, **Then** old records are automatically archived or purged based on retention policy (default: keep last 1000 SyncHistory records per photo, configurable via DatabaseMetadata)
5. **Given** user needs to troubleshoot sync issues, **When** they access database directly or via admin API, **Then** they can query detailed logs of all sync attempts, failures, and retries

---

### Edge Cases

- What happens when user enters invalid credentials during configuration and tries to test connection?
- How does system handle Frame TV becoming unreachable after successful configuration?
- What occurs when iCloud albums are deleted or renamed between sync operations?
- How does photo gallery handle albums with thousands of photos without performance degradation?
- What happens when SQLite database file becomes corrupted or locked by another process?
- How does system handle concurrent configuration updates from multiple browser sessions?
- What occurs when Docker container restarts during an active sync operation?
- How does photo gallery display progress when initial album list fetch takes several seconds?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide Docker image that runs web server on startup without requiring manual configuration files
- **FR-002**: Configuration page MUST consolidate all settings into three clearly labeled sections: iCloud Connection, Frame Connection, and Sync Configuration
- **FR-003**: Configuration page MUST provide "Test Connection" buttons for both iCloud and Frame TV that validate credentials and connectivity before saving
- **FR-004**: System MUST persist all configuration settings (credentials, IP addresses, sync intervals) to SQLite database automatically on save
- **FR-005**: System MUST encrypt sensitive credentials (iCloud password, session tokens) using AES-256-GCM before storing in database
- **FR-006**: Dashboard page MUST display only sync status, control buttons (Start/Stop), and real-time progress - no configuration fields
- **FR-007**: Dashboard MUST show current sync state (idle, running, paused, error), last sync timestamp, photos synced count, and active error messages
- **FR-008**: Dashboard MUST update status in real-time during sync operations without requiring page refresh
- **FR-009**: Photo Gallery page MUST display ALL available iCloud albums without arbitrary limits
- **FR-010**: Photo Gallery page MUST implement pagination for albums and photos to handle large collections efficiently
- **FR-011**: Photo Gallery page MUST load and display all photos within a selected album, not just first page
- **FR-012**: System MUST use SQLite database to persist sync state including photo checksums, last sync timestamps, error counts, and retry tracking
- **FR-013**: System MUST use SQLite database to persist sync history with timestamps, operation outcomes, and error details for troubleshooting
- **FR-014**: System MUST handle database schema migrations automatically when application version updates
- **FR-015**: System MUST ensure database transactions are atomic to prevent partial state updates during crashes
- **FR-016**: Configuration page MUST provide clear validation feedback for all input fields before allowing save
- **FR-017**: System MUST load persisted configuration from database on startup and apply settings to sync service
- **FR-018**: Photo Gallery MUST provide manual "Sync Selected" capability for user-chosen photos
- **FR-019**: Dashboard MUST provide direct link to Configuration page when no configuration exists
- **FR-020**: System MUST implement database connection pooling to handle concurrent read/write operations safely

### Key Entities

- **Configuration**: Represents all application settings including iCloud credentials (encrypted), Frame TV connection details, and sync preferences with sections for each category
- **SyncHistory**: Records of all sync operations with start/end timestamps, photos processed count, success/failure status, and error messages for audit trail
- **PhotoRecord**: Individual photo tracking entries with checksum, source path, Frame TV content ID, last sync timestamp, retry count, and current status
- **Album**: iCloud photo album metadata including name, photo count, last fetched timestamp, and visibility flag
- **SyncState**: Current operational state including active/idle status, current photo being processed, progress percentage, and error condition
- **DatabaseSchema**: Version tracking for database structure to enable automatic migrations during application updates

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete full Docker deployment and initial configuration (all three sections) in under 10 minutes
- **SC-002**: Configuration page loads and displays all three sections within 2 seconds on first access
- **SC-003**: Connection test buttons provide feedback within 5 seconds for both iCloud and Frame TV
- **SC-004**: Dashboard page updates sync status within 1 second of state changes during active sync
- **SC-005**: Photo Gallery displays all albums (up to 100) within 5 seconds of page load
- **SC-006**: Photo Gallery pagination allows browsing albums with 10,000+ photos with <200ms page transition latency and smooth scrolling without frame drops
- **SC-007**: Configuration settings persist across container restarts with 100% reliability
- **SC-008**: SQLite database handles 50 concurrent read operations without locking delays
- **SC-009**: Database schema migrations complete automatically in under 30 seconds for typical datasets
- **SC-010**: System recovers from mid-sync crashes and resumes within 10 seconds of restart without data loss
- **SC-011**: Users can identify and resolve configuration errors within 2 minutes using provided feedback messages
- **SC-012**: Dashboard provides complete visibility into sync status requiring zero context switching to other pages

## Assumptions

- Docker runtime environment is available and properly configured on deployment target
- SQLite database file storage is persistent across container restarts (volume mounted)
- iCloud credentials remain valid for session duration (app-specific passwords don't expire frequently)
- Frame TV devices remain discoverable on local network during sync operations
- Web UI users access dashboard from modern browsers supporting ES6+ JavaScript
- Configuration changes during active sync are queued and applied after current operation completes
- Database backup and recovery are handled by external tools (Docker volume backups)
- Single-user deployment model (no concurrent multi-user access requiring user authentication)
- Network bandwidth is sufficient for photo download/upload operations without causing UI timeouts
- SQLite performance is adequate for expected data volumes (thousands of photos, not millions)
