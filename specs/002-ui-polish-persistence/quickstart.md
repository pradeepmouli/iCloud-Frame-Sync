# Quickstart Guide: iCloud Frame Sync

**Feature**: 002-ui-polish-persistence
**Date**: 2025-11-06

## Overview

This guide walks you through deploying the iCloud Frame Sync application with Docker, setting up the database, configuring your credentials, and starting your first sync.

**What You'll Need**:
- Docker and Docker Compose installed
- iCloud account with app-specific password ([generate here](https://appleid.apple.com/))
- Samsung Frame TV on your local network
- ~10 minutes

---

## Quick Start (Docker)

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/yourusername/icloud-frame-sync.git
cd icloud-frame-sync

# Create environment file
cp .env.example .env

# Generate encryption key
openssl rand -hex 32 > .encryption_key
```

Edit `.env`:
```env
# Database
DATABASE_URL="file:/app/data/sync.db"

# Encryption
ENCRYPTION_KEY="paste-key-from-encryption_key-file"

# Server
PORT=3000
NODE_ENV=production

# Logging
LOG_LEVEL=info
```

### 2. Launch with Docker Compose

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f

# Expected output:
# ✅ Database initialized
# ✅ Migration complete (if JSON state exists)
# 🚀 Server listening on http://localhost:3000
# 📊 Web UI available at http://localhost:3000
```

Your application is now running at **http://localhost:3000**

### 3. Configure via Web UI

1. **Open Configuration Page**
   Navigate to http://localhost:3000/configuration

2. **iCloud Connection Section**
   - Username: Your Apple ID email
   - Password: App-specific password ([generate here](https://appleid.apple.com/account/manage))
   - Source Album: Select album from dropdown
   - Click **Test Connection** to verify

3. **Frame Connection Section**
   - Host: Your Frame TV IP address (e.g., `192.168.1.100`)
   - Port: Usually `8002` (default)
   - Click **Test Connection** to verify

4. **Sync Configuration Section**
   - Sync Interval: How often to check for new photos (60-3600 seconds)
   - Delete After Sync: Remove photos from Frame before uploading new ones
   - Max Retries: Number of retry attempts for failed uploads (0-10)
   - Enable Sync: Toggle on when ready

5. **Save Configuration**
   Click **Save** button at bottom of page

### 4. Start Syncing

1. Navigate to **Dashboard** page
2. Review sync status (should show "Idle")
3. Click **Start Sync** button
4. Watch real-time progress bar and logs
5. Click **Stop Sync** when needed

### 5. Browse Photos

1. Navigate to **Photo Gallery** page
2. Browse albums loaded from iCloud
3. Click album to view photos
4. View sync status for each photo
5. Click photo for detailed information

---

## Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data              # Database persistence
      - ./logs:/app/logs              # Log files
    environment:
      - DATABASE_URL=file:/app/data/sync.db
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - PORT=3000
      - NODE_ENV=production
      - LOG_LEVEL=info
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

**Volume Mounts**:
- `/app/data` - SQLite database file persists across container restarts
- `/app/logs` - Application logs for debugging

**Health Check**:
- Polls `/api/health` every 30 seconds
- Container marked unhealthy after 3 failures
- Useful for orchestration (Kubernetes, Docker Swarm)

---

## Multi-Stage Dockerfile

```dockerfile
# Dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build application
RUN pnpm build

# Stage 2: Production
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Create data directory
RUN mkdir -p /app/data /app/logs

# Run migrations and start server
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/web-server.js"]
```

**Entrypoint Script** (`docker-entrypoint.sh`):
```bash
#!/bin/sh
set -e

echo "🔄 Running database migrations..."
pnpm prisma migrate deploy

echo "🔍 Checking for JSON state migration..."
node dist/scripts/migrate-json-to-sqlite.js

echo "🚀 Starting application..."
exec "$@"
```

---

## Database Setup

### Initial Migration

The first time you run the application, Prisma will create the SQLite database:

```bash
# Inside container
pnpm prisma migrate deploy

# Expected output:
# ✅ 0001_init.sql applied
# ✅ Database schema is up to date
```

### JSON State Migration

If you have an existing JSON state file (`~/.icloud-frame-sync/state.json`), it will be automatically migrated on first startup:

```bash
# Migration runs automatically via entrypoint script
# Check logs for confirmation:
# ✅ Found existing JSON state file
# 🔄 Migrating 1234 photos...
# 📦 Created 5 albums
# ✅ Migration complete. Backup saved to state.json.backup.1731024000000
```

**Manual Migration** (if needed):
```bash
docker exec -it icloud-frame-sync pnpm migrate-json
```

### Database Inspection

Use Prisma Studio to inspect database contents:

```bash
# From host
docker exec -it icloud-frame-sync pnpm prisma studio

# Opens browser at http://localhost:5555
```

**Views Available**:
- Configuration (single row)
- Albums (all iCloud albums)
- PhotoRecords (all photos with sync status)
- SyncHistory (audit log)
- SyncState (current operation state)

---

## Development Setup

For local development without Docker:

### 1. Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install project dependencies
pnpm install

# Generate Prisma client
pnpm prisma generate
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
DATABASE_URL="file:./data/sync.db"
ENCRYPTION_KEY="generate-with-openssl-rand-hex-32"
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

### 3. Initialize Database

```bash
# Create migration
pnpm prisma migrate dev --name init

# Expected output:
# ✅ Migration 0001_init.sql applied
# ✅ Generated Prisma Client
# ✅ Database is ready
```

### 4. Start Development Servers

```bash
# Terminal 1: Backend server (with hot reload)
pnpm dev

# Terminal 2: Frontend dev server (Vite)
cd web && pnpm dev

# Backend: http://localhost:3000/api
# Frontend: http://localhost:5173 (proxies to :3000/api)
```

### 5. Run Tests

```bash
# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests
pnpm test:integration

# With coverage
pnpm test:coverage
```

---

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./data/sync.db` | SQLite database path |
| `ENCRYPTION_KEY` | *(required)* | 32-byte hex key for credential encryption |
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Logging verbosity (trace, debug, info, warn, error) |
| `SYNC_INTERVAL_MIN` | `30` | Minimum sync interval (seconds) |
| `SYNC_INTERVAL_MAX` | `3600` | Maximum sync interval (seconds) |
| `MAX_RETRIES` | `3` | Default max retry attempts |

### Volume Mounts

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `./data` | `/app/data` | SQLite database persistence |
| `./logs` | `/app/logs` | Application logs |
| `~/.icloud-frame-sync` | `/app/.icloud-frame-sync` | Legacy JSON state (for migration) |

---

## Troubleshooting

### Database Issues

**Problem**: `Database not found` error

```bash
# Check database file exists
docker exec icloud-frame-sync ls -lh /app/data/sync.db

# Recreate database
docker exec icloud-frame-sync pnpm prisma migrate deploy
```

**Problem**: `Migration failed` error

```bash
# Reset database (⚠️ destroys all data)
docker exec icloud-frame-sync pnpm prisma migrate reset

# Or manually delete and recreate
docker exec icloud-frame-sync rm /app/data/sync.db
docker exec icloud-frame-sync pnpm prisma migrate deploy
```

### Connection Issues

**Problem**: Cannot connect to iCloud

- Verify username is correct Apple ID email
- Ensure password is **app-specific password** (not account password)
- Generate new app-specific password at https://appleid.apple.com/
- Check 2FA/MFA is enabled on Apple ID account
- Try test connection from Configuration page

**Problem**: Cannot connect to Frame TV

- Verify Frame TV IP address (check router DHCP leases)
- Ensure Frame TV is on same network as Docker host
- Check Frame TV Art Mode is enabled
- Verify port 8002 is open (default Frame API port)
- Try manual connection: `curl http://FRAME_IP:8002/api/v1/devices`

### Sync Issues

**Problem**: Sync starts but no photos upload

```bash
# Check sync status
curl http://localhost:3000/api/sync/status

# View sync logs
docker-compose logs -f app | grep -i sync

# Check database for failed photos
docker exec icloud-frame-sync pnpm prisma studio
# Navigate to PhotoRecords, filter status=failed
```

**Problem**: Photos stuck in "syncing" status

```bash
# Stop sync
curl -X POST http://localhost:3000/api/sync/stop

# Reset stuck photos
docker exec icloud-frame-sync pnpm reset-stuck-photos

# Restart sync
curl -X POST http://localhost:3000/api/sync/start
```

### Performance Issues

**Problem**: Slow photo gallery loading

- Check album photo count (> 10,000 photos may need indexing)
- Increase pagination limit (default 50, max 200)
- Verify indexes exist:
  ```bash
  docker exec icloud-frame-sync pnpm prisma db execute \
    --sql "SELECT * FROM sqlite_master WHERE type='index';"
  ```

**Problem**: High memory usage

- Check Prisma connection pool settings
- Reduce pagination limit
- Enable query logging to find slow queries:
  ```env
  DATABASE_URL="file:/app/data/sync.db?connection_limit=5"
  LOG_LEVEL=debug
  ```

---

## Monitoring & Logs

### Health Check

```bash
# Basic health check
curl http://localhost:3000/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-11-06T12:00:00.000Z",
  "services": {
    "database": { "status": "up", "responseTimeMs": 5 },
    "icloud": { "status": "up" },
    "frame": { "status": "up" }
  },
  "version": "1.0.0"
}
```

### Log Files

```bash
# View all logs
docker-compose logs -f

# Filter by service
docker-compose logs -f app

# View last 100 lines
docker-compose logs --tail=100 app

# Follow specific log level
docker-compose logs -f app | grep -i error
```

**Log Files** (if volume mounted):
- `./logs/app.log` - All application logs
- `./logs/error.log` - Error-level logs only
- `./logs/sync.log` - Sync operation logs

### Metrics

Access Prisma metrics (if enabled):

```bash
# Query metrics endpoint
curl http://localhost:3000/api/metrics

# Returns Prometheus-formatted metrics
```

---

## Backup & Restore

### Backup Database

```bash
# Stop sync to ensure consistency
curl -X POST http://localhost:3000/api/sync/stop

# Copy database file
docker cp icloud-frame-sync:/app/data/sync.db ./backups/sync-$(date +%Y%m%d).db

# Restart sync if needed
curl -X POST http://localhost:3000/api/sync/start
```

### Restore Database

```bash
# Stop container
docker-compose down

# Restore backup
cp ./backups/sync-20250106.db ./data/sync.db

# Restart container
docker-compose up -d

# Verify restoration
curl http://localhost:3000/api/configuration
```

### Automated Backups

Add to `docker-compose.yml`:

```yaml
services:
  backup:
    image: alpine:latest
    volumes:
      - ./data:/data
      - ./backups:/backups
    entrypoint: >
      sh -c "
      while true; do
        echo 'Creating backup...'
        cp /data/sync.db /backups/sync-$$(date +%Y%m%d-%H%M%S).db
        find /backups -name 'sync-*.db' -mtime +30 -delete
        sleep 86400
      done
      "
```

---

## Upgrading

### Docker Image

```bash
# Pull latest image
docker-compose pull

# Stop and remove old container
docker-compose down

# Start new container (runs migrations automatically)
docker-compose up -d

# Verify upgrade
docker-compose logs -f app
curl http://localhost:3000/api/health
```

### Database Migration

Migrations run automatically on container start via `docker-entrypoint.sh`:

```bash
# Manual migration (if needed)
docker exec icloud-frame-sync pnpm prisma migrate deploy

# Check migration status
docker exec icloud-frame-sync pnpm prisma migrate status
```

---

## Next Steps

After completing this quickstart:

1. **Schedule Regular Backups**: Set up automated database backups
2. **Configure Monitoring**: Set up alerts for health check failures
3. **Review Logs**: Check logs for any errors or warnings
4. **Optimize Sync Interval**: Adjust based on photo upload frequency
5. **Explore Photo Gallery**: Browse albums and view sync history

## Getting Help

- **Documentation**: [Full API Reference](./contracts/api-spec.md)
- **Issues**: [GitHub Issues](https://github.com/yourusername/icloud-frame-sync/issues)
- **Logs**: Run `docker-compose logs -f` for real-time debugging

---

**Congratulations!** 🎉 Your iCloud Frame Sync is now running. Photos will automatically sync from your iCloud album to your Samsung Frame TV based on your configured schedule.
