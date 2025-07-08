import type {
  iCloudPhotoAlbum,
  iCloudPhotoAsset,
  iCloudPhotosService,
} from 'icloudjs';
import iCloudService, * as iCloud from 'icloudjs';
import type { Logger } from 'pino';
import type { iCloudConfig } from 'types/endpoint.js';
import type {
  Album,
  Endpoint,
  EndpointConfig,
  Photo,
} from '../types/endpoint.js';

import exifparser from 'exif-parser';
import exif from 'exif';

type t = exif.ExifData;

export class iCloudPhoto implements Photo {
  id: string;
  filename: string;
  dimensions: { width: number; height: number };
  size: number;
  private asset: iCloudPhotoAsset;

  constructor(asset: iCloudPhotoAsset) {
    exif.ExifImage;
    this.asset = asset;
    this.id = asset.filename; // fallback to filename as id
    this.filename = asset.filename;
    // Try to extract dimensions from asset.dimension (array or object)
    if (Array.isArray(asset.dimension) && asset.dimension.length === 2) {
      this.dimensions = {
        width: asset.dimension[0],
        height: asset.dimension[1],
      };
    } else if (
      typeof asset.dimension === 'object' &&
      asset.dimension &&
      'width' in asset.dimension &&
      'height' in asset.dimension
    ) {
      this.dimensions = asset.dimension as { width: number; height: number };
    } else {
      this.dimensions = { width: 0, height: 0 };
    }
    this.size = (asset as any).size || 0;
  }

  async download(): Promise<Uint8Array> {
    const data = await this.asset.download('original');
    // icloudjs may return ArrayBuffer, convert to Uint8Array if needed
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    // fallback
    return new Uint8Array();
  }

  async delete(): Promise<boolean> {
    if (typeof this.asset.delete === 'function') {
      return await this.asset.delete();
    }
    return false;
  }

  get thumbnailUrl(): string | undefined {
    return (this.asset as any)._versions?.thumb?.url;
  }
}

export class iCloudEndpoint implements Endpoint {
  private logger: Logger;
  private config: iCloudConfig;
  private iCloudClient: iCloudService.default;
  private photosService: iCloudPhotosService;
  private _photos: iCloudPhoto[] = [];
  private _albums: Album[] = [];

  public get status(): keyof typeof iCloudService.iCloudServiceStatus {
    return this.iCloudClient.status;
  }

  public get accountInfo(): iCloudService.AccountInfo {
    return this.iCloudClient.accountInfo;
  }

  constructor(config: iCloudConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.iCloudClient = new iCloudService.default({
      dataDirectory: config.dataDirectory || './data',
      username: config.username,
      password: config.password,
      saveCredentials: true,
      trustDevice: true,
      authMethod: 'srp',
      logger: (level: number, ...args: any[]) => {
        switch (level) {
          case iCloudService.LogLevel.Debug:
            this.logger.debug(args.join(' '));
            break;
          case iCloudService.LogLevel.Info:
            this.logger.info(args.join(' '));
            break;
          case iCloudService.LogLevel.Warning:
            this.logger.warn(args.join(' '));
            break;
          case iCloudService.LogLevel.Error:
            this.logger.error(args.join(' '));
            break;
          default:
            this.logger.info(args.join(' '));
            break;
        }
      },
    });
  }

  async authenticate(
    username: string,
    password: string,
    mfaCallback?: () => Promise<string>,
  ): Promise<void> {
    if (this.iCloudClient.status !== 'Ready') {
      if (this.iCloudClient.status !== 'Authenticated') {
        this.logger.info('Authenticating...');
        await this.iCloudClient.authenticate(username, password);

        if (this.iCloudClient.status === 'MfaRequested') {
          this.logger.info(
            'MFA requested, please check your device for the code',
          );
          mfaCallback = mfaCallback || this.config.requestMfaCallback;

          const mfaCode = await mfaCallback();
          this.logger.info('Received MFA code:', mfaCode);
          await this.iCloudClient.provideMfaCode(mfaCode);
        }
      }

      await this.iCloudClient.awaitReady;
      this.logger.info(this.iCloudClient.status);
      this.logger.info(
        'Hello, ' + this.iCloudClient.accountInfo.dsInfo.fullName,
      );
    }
  }

  async initialize(): Promise<void> {
    await this.authenticate(this.config.username, this.config.password);
    await this.iCloudClient.awaitReady;
    this.photosService = this.iCloudClient.getService(
      'photos',
    ) as iCloudPhotosService;
    const albumsMap = await this.photosService.getAlbums();
    this._albums = Array.from(albumsMap.entries()).map(([key, album]) => ({
      id: key,
      name: key,
      // Type workaround: album.getPhotos() returns a promise of iCloudPhotoAsset[]
      photos: (album as unknown as iCloudPhotoAlbum)
        .getPhotos()
        .then((photos: any[]) => photos.map((p) => new iCloudPhoto(p))),
    }));
    this.logger.info(
      `Found ${this._albums.length} albums in iCloud: ${this._albums
        .map((a) => a.name)
        .join(', ')}`,
    );

    // Default to first album or config.albums
    const album = albumsMap.get(this.config.sourceAlbum);
    album;

    if (album) {
      const photos = await album.getPhotos();
      this._photos = photos.map(
        (p) => new iCloudPhoto(p as unknown as iCloudPhotoAsset),
      );
    }
  }

  async upload(photo: Photo): Promise<string> {
    // iCloud does not support uploading to albums via icloudjs (stub)
    throw new Error('Upload not implemented for iCloudEndpoint');
  }

  async close(): Promise<void> {
    // No explicit close needed for icloudjs
  }

  get photos(): Promise<Photo[]> {
    return Promise.resolve(this._photos);
  }

  get albums(): Promise<Album[]> {
    return Promise.resolve(this._albums);
  }
}
