import path from 'node:path';
import type { Logger } from 'pino';
import { FrameEndpoint } from './FrameEndpoint.js';
import { iCloudEndpoint } from './iCloudEndpoint.js';
import type {
  Endpoint,
  FrameConfig,
  iCloudConfig,
  Photo,
} from '../types/endpoint.js';

export interface PhotoSyncServiceDeps {
  logger: Logger;
}

export class PhotoSyncService {
  private logger: Logger;
  private frameEndpoint: FrameEndpoint;
  private iCloudEndpoint: iCloudEndpoint;
  private handledPhotos = new Set<string>();

  public get frame() {
    return this.frameEndpoint;
  }

  public get iCloud() {
    return this.iCloudEndpoint;
  }

  constructor(
    config: { frame: FrameConfig; iCloud: iCloudConfig },
    logger: Logger,
  ) {
    this.logger = logger;
    const frameConfig = {
      ...config.frame,
      services: (config.frame.services || []).map(String),
    };
    this.frameEndpoint = new FrameEndpoint(
      frameConfig,
      this.logger.child({ name: 'Frame' }),
    );
    this.iCloudEndpoint = new iCloudEndpoint(
      {
        ...config.iCloud,
        dataDirectory: config.iCloud.dataDirectory || path.resolve('data'),
      },
      this.logger.child({ name: 'iCloud' }),
    );
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Photo Sync Service...');
    await this.iCloudEndpoint.initialize();
    await this.frameEndpoint.initialize();
    this.logger.info('Photo Sync Service initialized');
  }

  async close(): Promise<void> {
    this.logger.info('Closing Photo Sync Service...');
    await this.frameEndpoint?.close();
    await this.iCloudEndpoint?.close();
    this.logger.info('Photo Sync Service closed');
  }

  // Example: n-way sync using the new endpoint abstraction
  async syncPhotos(): Promise<void> {
    this.logger.info(
      'Starting n-way sync between iCloud and Frame endpoints...',
    );
    const sourcePhotos = await this.iCloudEndpoint.photos;
    const destPhotos = await this.frameEndpoint.photos;
    const destPhotoIds = new Set(destPhotos.map((p) => p.id));
    let uploaded = 0;
    for (const photo of sourcePhotos) {
      if (destPhotoIds.has(photo.id)) {
        this.logger.info(
          `Photo already exists in destination: ${photo.filename}`,
        );
        continue;
      }
      try {
        this.logger.info(`Uploading photo: ${photo.filename}`);
        await this.frameEndpoint.upload(photo);
        uploaded++;
      } catch (err) {
        this.logger.error(`Failed to upload photo ${photo.filename}:`, err);
      }
    }
    this.logger.info(`Sync complete. Uploaded ${uploaded} new photos.`);
  }

  // Optionally, add handledPhotos tracking if needed for deduplication, etc.
}

// Remove duplicate/old class definition and members below:
// ...existing code...
