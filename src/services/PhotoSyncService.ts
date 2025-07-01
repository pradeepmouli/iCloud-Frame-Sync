import iCloud, {
  LogLevel,
  type iCloudPhotoAsset,
  type iCloudPhotosService,
} from 'icloudjs';
import path from 'node:path';
import type { Logger } from 'pino';
import type {
  SamsungFrameClientType,
  ServicesSchema,
} from 'samsung-frame-connect';
import { FrameManager } from './FrameManager.js';

export interface iCloudConfig {
  username: string;
  password: string;
  sourceAlbum: string;
  dataDirectory?: string;
}

export interface FrameConfig {
  host: string;
  name?: string;
  services?: [keyof ServicesSchema];
  verbosity?: number;
}

export interface PhotoSyncConfig {
  iCloud: iCloudConfig;
  frame: FrameConfig;
  syncIntervalSeconds: number;
  logLevel: string;
}

export class PhotoSyncService {
  private iCloudClient: iCloud.default;
  private photosService: iCloudPhotosService | null = null;
  private album: any = null;
  private handledPhotos = new Set<string>();
  private logger: Logger;

  private iCloudLogger: Logger;
  private frameLogger: Logger;
  private frameClient: FrameManager<{
    'art-mode': true;
    device: true;
    'remote-control': false;
  }>;

  constructor(config: PhotoSyncConfig, logger: Logger) {
    this.logger = logger;
    if (this.logger) {
      this.iCloudLogger = this.logger.child({ service: 'iCloud' });
      this.frameLogger = this.logger.child({ service: 'Samsung Frame' });
    }

    this.frameClient = new FrameManager(config.frame, this.frameLogger);

    this.iCloudClient = new iCloud.default({
      dataDirectory: config.iCloud.dataDirectory || './data',
      username: config.iCloud.username,
      password: config.iCloud.password,
      saveCredentials: true,
      trustDevice: true,
      authMethod: 'srp',
      logger: (level, ...args: any[]) => {
        switch (level) {
          case LogLevel.Error:
            this.logger.error(args);
            break;
          case LogLevel.Info:
            this.logger.info(args);
            break;
          case LogLevel.Debug:
            this.logger.debug(args);
            break;
          case LogLevel.Silent:
            this.logger.trace(args);
            break;
          case LogLevel.Warning:
            this.logger.warn(args);
            break;
          default:
            this.logger.info(args);
            break;
        }
      },
    });
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing iCloud Photo Sync Service...');
    await this.frameClient.initialize();
    await this.iCloudClient.authenticate();
  }

  async authenticate(): Promise<void> {
    this.logger.info('Authenticating...');
    await this.iCloudClient.authenticate();

    if (this.iCloudClient.status === 'MfaRequested') {
      this.logger.info('MFA requested, please check your device for the code');
      const mfaCode = await new Promise<string>((resolve) => {
        process.stdin.once('data', (data) => {
          resolve(data.toString().trim());
        });
      });
      await this.iCloudClient.provideMfaCode(mfaCode);
    }

    await this.iCloudClient.awaitReady;
    this.logger.info(this.iCloudClient.status);
    this.logger.info('Hello, ' + this.iCloudClient.accountInfo.dsInfo.fullName);
  }

  async initializeiCloudPhotosService(albumName: string): Promise<void> {
    this.photosService = this.iCloudClient.getService(
      'photos',
    ) as iCloudPhotosService;
    const albums = await this.photosService.getAlbums();

    this.logger.info(
      `Available Albums: ${Array.from(albums.keys()).join(', ')}`,
    );
    this.album = albums.get(albumName);

    if (!this.album) {
      throw new Error(`Album not found: ${albumName}`);
    }

    this.logger.info(`Using album: ${albumName}`);
  }

  async syncPhotos(): Promise<void> {
    if (!this.album) {
      throw new Error(
        'Photos service not initialized. Call initializePhotosService first.',
      );
    }

    const photos = await this.album.getPhotos();

    if (photos.length === 0) {
      this.logger.info('No photos to sync');
      return;
    }

    this.logger.info(`Found ${photos.length} photos to sync`);
    this.logger.info(
      `Photos: ${JSON.stringify(
        photos.map((p: iCloudPhotoAsset) => p.filename),
        null,
        2,
      )}`,
    );

    this.logger.info('Syncing photos...');
    let count = 1;

    for (const photo of photos) {
      await this.processPhoto(photo, count, photos.length);
      count++;
    }

    this.logger.info('Photos synced');
  }

  private async processPhoto(
    photo: iCloudPhotoAsset,
    count: number,
    total: number,
  ): Promise<void> {
    this.logger.info(`Syncing photo: ${photo.filename} (${count}/${total})`);

    // @ts-ignore
    if (photo.masterRecord.deleted) {
      this.logger.info(`Photo deleted: ${photo.filename}`);
      return;
    }

    if (this.handledPhotos.has(photo.filename)) {
      this.logger.info(`Photo already synced: ${photo.filename}`);
      return;
    }

    this.logger.info(
      `Photo: ${JSON.stringify({ filename: photo.filename, dimensions: photo.dimension }, null, 2)}`,
    );

    const imageData = await photo.download('original');
    this.logger.debug(`Photo: ${JSON.stringify(photo, null, 2)}`);

    const uploadResult = await this.frameClient.upload(Buffer.from(imageData), {
      fileType: path.extname(photo.filename),
    });

    this.logger.info(`Photo uploaded - id: ${uploadResult}`);

    if (await photo.delete()) {
      this.logger.info(`Photo deleted: ${photo.filename}`);
    }

    this.handledPhotos.add(photo.filename);
  }

  getHandledPhotos(): Set<string> {
    return new Set(this.handledPhotos);
  }

  clearHandledPhotos(): void {
    this.handledPhotos.clear();
  }

  get status(): string {
    return this.iCloudClient.status;
  }

  get accountInfo(): any {
    return this.iCloudClient.accountInfo;
  }
}
