#!/bin/sh
set -e

echo "🚀 Starting iCloud Frame Sync..."

# Check for required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL not set, using default: file:./data/sync.db"
    export DATABASE_URL="file:./data/sync.db"
fi

if [ -z "$ENCRYPTION_KEY" ]; then
    echo "❌ ERROR: ENCRYPTION_KEY environment variable is required"
    exit 1
fi

# Create data directory if it doesn't exist
mkdir -p /app/data /app/logs

echo "🔄 Running database migrations..."
pnpm prisma migrate deploy

# Check for JSON state migration
if [ -f "/app/.icloud-frame-sync/state.json" ] || [ -f "$HOME/.icloud-frame-sync/state.json" ]; then
    echo "🔍 Found existing JSON state file, running migration..."
    node dist/scripts/migrate-json-to-sqlite.js || echo "⚠️  Migration script not found or failed, continuing..."
else
    echo "✅ No JSON state file found, skipping migration"
fi

echo "✅ Database ready"
echo "🚀 Starting application..."

# Execute the main command
exec "$@"
