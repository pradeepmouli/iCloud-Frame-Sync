-- CreateTable
CREATE TABLE "configuration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icloudUsername" TEXT,
    "icloudPassword" TEXT,
    "icloudSourceAlbum" TEXT,
    "icloudSessionToken" TEXT,
    "frameHost" TEXT,
    "framePort" INTEGER NOT NULL DEFAULT 8002,
    "frameConnectionStatus" TEXT NOT NULL DEFAULT 'unknown',
    "syncInterval" INTEGER NOT NULL DEFAULT 60,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "deleteAfterSync" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "albumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "lastFetchedAt" DATETIME,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "photo_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sourceAlbumId" TEXT NOT NULL,
    "sourcePhotoId" TEXT NOT NULL,
    "sourcePath" TEXT,
    "frameContentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncedAt" DATETIME,
    "lastErrorAt" DATETIME,
    "errorMessage" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "captureDate" DATETIME,
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "mimeType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "photo_records_sourceAlbumId_fkey" FOREIGN KEY ("sourceAlbumId") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "currentPhotoId" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "estimatedTimeLeft" INTEGER,
    "photosTotal" INTEGER NOT NULL DEFAULT 0,
    "photosProcessed" INTEGER NOT NULL DEFAULT 0,
    "photosFailed" INTEGER NOT NULL DEFAULT 0,
    "photosSkipped" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorAt" DATETIME,
    "sessionStartedAt" DATETIME,
    "sessionEndedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "sync_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoRecordId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "retryAttempt" INTEGER NOT NULL DEFAULT 0,
    "fileSize" INTEGER,
    CONSTRAINT "sync_history_photoRecordId_fkey" FOREIGN KEY ("photoRecordId") REFERENCES "photo_records" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "database_metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "albums_albumId_key" ON "albums"("albumId");

-- CreateIndex
CREATE INDEX "albums_albumId_idx" ON "albums"("albumId");

-- CreateIndex
CREATE INDEX "albums_lastFetchedAt_idx" ON "albums"("lastFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "photo_records_checksum_key" ON "photo_records"("checksum");

-- CreateIndex
CREATE INDEX "photo_records_checksum_idx" ON "photo_records"("checksum");

-- CreateIndex
CREATE INDEX "photo_records_sourceAlbumId_idx" ON "photo_records"("sourceAlbumId");

-- CreateIndex
CREATE INDEX "photo_records_status_idx" ON "photo_records"("status");

-- CreateIndex
CREATE INDEX "photo_records_lastSyncedAt_idx" ON "photo_records"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "photo_records_frameContentId_idx" ON "photo_records"("frameContentId");

-- CreateIndex
CREATE INDEX "sync_history_photoRecordId_idx" ON "sync_history"("photoRecordId");

-- CreateIndex
CREATE INDEX "sync_history_startedAt_idx" ON "sync_history"("startedAt");

-- CreateIndex
CREATE INDEX "sync_history_status_idx" ON "sync_history"("status");

-- CreateIndex
CREATE UNIQUE INDEX "database_metadata_key_key" ON "database_metadata"("key");
