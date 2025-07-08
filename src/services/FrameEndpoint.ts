import exif from 'exif-parser';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import * as tls from 'node:tls';
import type { Logger } from 'pino';
import {
  SamsungFrameClient,
  type ArtContentItem,
  type SamsungFrameClientOptions,
  type SamsungFrameClientType,
  type ServicesSchema,
} from 'samsung-frame-connect';
import type { Endpoint, FrameConfig, Photo } from '../types/endpoint.js';

export class FramePhoto implements Photo {
  id: string;
  filename: string;
  dimensions: { width: number; height: number };
  size: number;
  private buffer: Buffer;
  client: SamsungFrameClientType<{
    'art-mode': true;
    device: true;
    'remote-control': true;
  }> = undefined;

  constructor(
    sourceObj: ArtContentItem,

    client?: SamsungFrameClientType<{
      'art-mode': true;
      device: true;
      'remote-control': true;
    }>,
  ) {
    this.id = sourceObj.id;
    this.filename = sourceObj.id;
    this.dimensions = {
      width: sourceObj.width || 0,
      height: sourceObj.height || 0,
    };
    this.client = client;
  }
  async download(): Promise<Buffer> {
    return this.buffer;
  }

  /**
   * Extract EXIF data from the photo buffer (if available)
   */
  async getExifData(): Promise<any> {
    if (!this.buffer) return null;
    try {
      const parser = exif.create(this.buffer);
      const result = parser.parse();
      return result.tags;
    } catch (err) {
      // Could not parse EXIF
      return null;
    }
  }
  async delete(): Promise<boolean> {
    // Frame photos are not deleted
    this.client.deleteArt([this.id]);

    return false;
  }
}
export class FrameEndpoint implements Endpoint {
  initialized = false;
  private client: SamsungFrameClientType<any>;
  private logger: Logger;
  config: SamsungFrameClientOptions<any>;
  private _photos: FramePhoto[] = [];

  constructor(config: FrameConfig, logger: Logger) {
    this.logger = logger;
    this.client = new SamsungFrameClient({
      host: config.host,
      name: config.name || 'SamsungTv',
      services: ['art-mode', 'device'],
      verbosity: config.verbosity || 0,
    }) as SamsungFrameClientType<any>;
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      this.logger.info('Initializing Samsung Frame Endpoint...');
      this.logger.info(`Connecting to Samsung Frame at ${this.config.host}...`);
      const deviceInfo = await this.client.getDeviceInfo();
      this.logger.info(`Device Info: ${JSON.stringify(deviceInfo, null, 2)}`);
      await this.client.connect();
      try {
        const artModeInfo = await this.client.getArtModeInfo();
        this.logger.info(
          `Art Mode Info: ${JSON.stringify(artModeInfo, null, 2)}`,
        );
        const availableArt = await this.client.getAvailableArt();
        this.logger.info(
          `Available Art: ${JSON.stringify(availableArt, null, 2)}`,
        );
        // TODO: Populate this._photos from Frame if possible
        this._photos = [];
        this.initialized = true;
      } catch (error) {
        this.logger.error(
          `Error initializing Samsung Frame Endpoint: ${error}`,
        );
      }
    }
  }

  async populatePhotos(): Promise<void> {
    try {
      const availableArt = await this.client.getAvailableArt();
      this._photos = availableArt.map(
        (art) => new FramePhoto(art, this.client),
      );
      this.logger.info(
        `Populated ${this._photos.length} photos from Samsung Frame.`,
      );
    } catch (error) {
      this.logger.error(`Failed to populate photos: ${error.message}`);
    }
  }

  getAvailableArt() {
    return this.client.getAvailableArt().then((art) => {
      this._photos = art.map((a) => new FramePhoto(a, this.client));
      return this._photos;
    });
  }

  async getAvailableArtByCategory(
    category?: string,
    timeout: number = 4,
  ): Promise<ArtContentItem[]> {
    try {
      const response = await this.client.request({
        request: 'get_content_list',
        category: category,
      });

      const contentList = JSON.parse(response.content_list);
      return category
        ? contentList.filter((v: any) => v.category_id === category)
        : contentList;
    } catch (error) {
      this.logger.error(
        `Failed to get available art by category: ${error.message}`,
      );
      return [];
    }
  }

  getPhotos(): Promise<Photo[]> {
    return Promise.resolve(this._photos);
  }
  async getThumbnail(photoId: string): Promise<Buffer> {
    try {
      this.logger.debug(`Requesting thumbnail for photo ID: ${photoId}`);

      // First, try to check if the art exists in the available art list
      const availableArt = await this.client.getAvailableArt();
      const artExists = availableArt.some((art) => art.id === photoId);

      if (!artExists) {
        this.logger.warn(
          `Art with ID ${photoId} not found in available art list`,
        );
        return Buffer.alloc(0);
      }

      // Primary method: socket-based thumbnail retrieval
      try {
        const response = await this.client.request({
          request: 'get_thumbnail',
          content_id: photoId,
          conn_info: {
            d2d_mode: 'socket',
            connection_id: Math.floor(Math.random() * 4 * 1024 * 1024 * 1024),
            id: this.generateUUID(),
          },
        });

        this.logger.debug(
          `Got response for thumbnail request: ${JSON.stringify(response)}`,
        );

        if (!response || !response.conn_info) {
          throw new Error('Invalid response: missing conn_info');
        }

        const connInfo = JSON.parse(response.conn_info);
        this.logger.debug(`Connection info: ${JSON.stringify(connInfo)}`);

        const thumbnailData = await this.readThumbnailData(connInfo);

        if (thumbnailData.length > 0) {
          this.logger.debug(
            `Successfully retrieved thumbnail for ${photoId}, size: ${thumbnailData.length} bytes`,
          );
          return thumbnailData;
        }
      } catch (socketError) {
        this.logger.warn(`Socket-based thumbnail retrieval failed for ${photoId}, trying alternative method`);
      }
      
      // Fallback method: try alternative approach
      const fallbackThumbnail = await this.getThumbnailAlternative(photoId);
      if (fallbackThumbnail.length > 0) {
        this.logger.debug(`Successfully retrieved thumbnail using alternative method for ${photoId}`);
        return fallbackThumbnail;
      }
      
      this.logger.warn(`All thumbnail retrieval methods failed for ${photoId}`);
      return Buffer.alloc(0);

    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get thumbnail for photo ID ${photoId}: ${errorMessage}`,
      );
      this.logger.error(`Error details:`, error);
      return Buffer.alloc(0);
    }
  }

  async getThumbnailList(photoIds: string[]): Promise<Buffer[]> {
    try {
      const contentIdList = photoIds.map((id) => ({ content_id: id }));
      const response = await this.client.request({
        request: 'get_thumbnail_list',
        content_id_list: contentIdList,
        conn_info: {
          d2d_mode: 'socket',
          connection_id: Math.floor(Math.random() * 4 * 1024 * 1024 * 1024),
          id: this.generateUUID(),
        },
      });

      const connInfo = JSON.parse(response.conn_info);
      const thumbnails = await this.readThumbnailList(connInfo);

      return thumbnails;
    } catch (error) {
      this.logger.error(`Failed to get thumbnail list: ${error.message}`);
      return [];
    }
  }

  private generateUUID(): string {
    return randomBytes(16).toString('hex');
  }

  private async readThumbnailData(connInfo: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.logger.debug(
        `Connecting to ${connInfo.ip}:${connInfo.port} for thumbnail data`,
      );

      const socket = tls.connect(
        {
          host: connInfo.ip,
          port: parseInt(connInfo.port),
          rejectUnauthorized: false,
        },
        async () => {
          try {
            this.logger.debug(
              'TLS connection established, reading thumbnail data',
            );

            // Read header length (4 bytes)
            const headerLenBuffer = await this.readExactly(socket, 4);
            const headerLen = headerLenBuffer.readUInt32BE(0);
            this.logger.debug(`Header length: ${headerLen}`);

            // Read header
            const headerBuffer = await this.readExactly(socket, headerLen);
            const header = JSON.parse(headerBuffer.toString());
            this.logger.debug(`Header: ${JSON.stringify(header)}`);

            // Read thumbnail data
            const thumbnailDataLen = parseInt(header.fileLength);
            this.logger.debug(`Thumbnail data length: ${thumbnailDataLen}`);

            if (thumbnailDataLen <= 0) {
              throw new Error(
                `Invalid thumbnail data length: ${thumbnailDataLen}`,
              );
            }

            const thumbnailData = await this.readExactly(
              socket,
              thumbnailDataLen,
            );

            socket.end();
            this.logger.debug(
              `Successfully read ${thumbnailData.length} bytes of thumbnail data`,
            );
            resolve(thumbnailData);
          } catch (error) {
            socket.end();
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.logger.error(`Error reading thumbnail data: ${errorMessage}`);
            reject(error);
          }
        },
      );

      socket.on('error', (error) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Socket error: ${errorMessage}`);
        reject(error);
      });

      socket.on('timeout', () => {
        this.logger.error('Socket timeout');
        socket.destroy();
        reject(new Error('Socket timeout'));
      });

      // Set a timeout for the connection
      socket.setTimeout(10000); // 10 seconds
    });
  }

  private async readThumbnailList(connInfo: any): Promise<Buffer[]> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host: connInfo.ip,
          port: parseInt(connInfo.port),
          rejectUnauthorized: false,
        },
        async () => {
          try {
            const thumbnails: Buffer[] = [];
            let totalNumThumbnails = 1;
            let currentThumb = -1;

            while (currentThumb + 1 < totalNumThumbnails) {
              // Read header length (4 bytes)
              const headerLenBuffer = await this.readExactly(socket, 4);
              const headerLen = headerLenBuffer.readUInt32BE(0);

              // Read header
              const headerBuffer = await this.readExactly(socket, headerLen);
              const header = JSON.parse(headerBuffer.toString());

              // Read thumbnail data
              const thumbnailDataLen = parseInt(header.fileLength);
              const thumbnailData = await this.readExactly(
                socket,
                thumbnailDataLen,
              );

              thumbnails.push(thumbnailData);
              currentThumb = parseInt(header.num);
              totalNumThumbnails = parseInt(header.total);
            }

            socket.end();
            resolve(thumbnails);
          } catch (error) {
            socket.end();
            reject(error);
          }
        },
      );

      socket.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async readExactly(
    socket: tls.TLSSocket,
    length: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (length <= 0) {
        resolve(Buffer.alloc(0));
        return;
      }

      const chunks: Buffer[] = [];
      let totalLength = 0;
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
        if (timeoutId) clearTimeout(timeoutId);
      };

      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        totalLength += chunk.length;

        if (totalLength >= length) {
          cleanup();
          const result = Buffer.concat(chunks);
          resolve(result.subarray(0, length));
        }
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        if (totalLength < length) {
          reject(
            new Error(
              `Socket closed before reading ${length} bytes (got ${totalLength})`,
            ),
          );
        }
      };

      const onTimeout = () => {
        cleanup();
        reject(
          new Error(`Timeout reading ${length} bytes (got ${totalLength})`),
        );
      };

      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('close', onClose);

      // Set a timeout for reading data
      timeoutId = setTimeout(onTimeout, 5000); // 5 seconds
    });
  }

  async upload(photo: Photo): Promise<string> {
    if (photo instanceof FramePhoto) {
      throw new Error('Object is already a FramePhoto, cannot upload again');
    }
    const buffer = await photo.download();
    const fileType = path.extname(photo?.filename) || '.jpg';
    let id = await this.client.upload(Buffer.from(buffer), { fileType });
    return id;
  }

  async close(): Promise<void> {
    await this.client?.close();
  }

  get photos(): Promise<Photo[]> {
    // Return FramePhoto[]
    return Promise.resolve(this._photos);
  }

  // Additional art management methods
  async getCurrentArt(): Promise<ArtContentItem | null> {
    try {
      return await this.client.getCurrentArt();
    } catch (error) {
      this.logger.error(`Failed to get current art: ${error.message}`);
      return null;
    }
  }

  async setCurrentArt(artId: string, category?: string): Promise<boolean> {
    try {
      await this.client.setCurrentArt({ id: artId, category });
      return true;
    } catch (error) {
      this.logger.error(`Failed to set current art: ${error.message}`);
      return false;
    }
  }

  async deleteArt(artIds: string | string[]): Promise<boolean> {
    try {
      await this.client.deleteArt(artIds);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete art: ${error.message}`);
      return false;
    }
  }

  async getBrightness(): Promise<number> {
    try {
      return await this.client.getBrightness();
    } catch (error) {
      this.logger.error(`Failed to get brightness: ${error.message}`);
      return 0;
    }
  }

  async setBrightness(value: number): Promise<boolean> {
    try {
      await this.client.setBrightness(value);
      return true;
    } catch (error) {
      this.logger.error(`Failed to set brightness: ${error.message}`);
      return false;
    }
  }

  async inArtMode(): Promise<boolean> {
    try {
      return await this.client.inArtMode();
    } catch (error) {
      this.logger.error(`Failed to check art mode: ${error.message}`);
      return false;
    }
  }

  async getMatteColors(): Promise<string[]> {
    try {
      return await this.client.getMatteColors();
    } catch (error) {
      this.logger.error(`Failed to get matte colors: ${error.message}`);
      return [];
    }
  }

  async getMatteTypes(): Promise<string[]> {
    try {
      return await this.client.getMatteTypes();
    } catch (error) {
      this.logger.error(`Failed to get matte types: ${error.message}`);
      return [];
    }
  }

  async setMatte(artId: string, type: string, color: string): Promise<boolean> {
    try {
      await this.client.setMatte({ id: artId, type, color });
      return true;
    } catch (error) {
      this.logger.error(`Failed to set matte: ${error.message}`);
      return false;
    }
  }

  // Additional art management methods based on Python reference
  async setFavourite(
    contentId: string,
    status: 'on' | 'off' = 'on',
  ): Promise<boolean> {
    try {
      await this.client.request({
        request: 'change_favorite',
        content_id: contentId,
        status: status,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to set favourite: ${error.message}`);
      return false;
    }
  }

  async getArtModeSettings(setting?: string): Promise<any> {
    try {
      const response = await this.client.request({
        request: 'get_artmode_settings',
      });
      const data = JSON.parse(response.data);
      return setting
        ? data.find((item: any) => item.item === setting) || data
        : data;
    } catch (error) {
      this.logger.error(`Failed to get art mode settings: ${error.message}`);
      return null;
    }
  }

  async getAutoRotationStatus(): Promise<any> {
    try {
      return await this.client.request({
        request: 'get_auto_rotation_status',
      });
    } catch (error) {
      this.logger.error(`Failed to get auto rotation status: ${error.message}`);
      return null;
    }
  }

  async setAutoRotationStatus(
    duration: number = 0,
    type: boolean = true,
    category: number = 2,
  ): Promise<boolean> {
    try {
      await this.client.request({
        request: 'set_auto_rotation_status',
        value: duration > 0 ? duration.toString() : 'off',
        category_id: `MY-C000${category}`,
        type: type ? 'shuffleslideshow' : 'slideshow',
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to set auto rotation status: ${error.message}`);
      return false;
    }
  }

  async getSlideshowStatus(): Promise<any> {
    try {
      return await this.client.request({
        request: 'get_slideshow_status',
      });
    } catch (error) {
      this.logger.error(`Failed to get slideshow status: ${error.message}`);
      return null;
    }
  }

  async setSlideshowStatus(
    duration: number = 0,
    type: boolean = true,
    category: number = 2,
  ): Promise<boolean> {
    try {
      await this.client.request({
        request: 'set_slideshow_status',
        value: duration > 0 ? duration.toString() : 'off',
        category_id: `MY-C000${category}`,
        type: type ? 'shuffleslideshow' : 'slideshow',
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to set slideshow status: ${error.message}`);
      return false;
    }
  }

  async getColorTemperature(): Promise<any> {
    try {
      let response = await this.client.request({
        request: 'get_color_temperature',
      });
      if (!response) {
        response = await this.getArtModeSettings('color_temperature');
      }
      return response;
    } catch (error) {
      this.logger.error(`Failed to get color temperature: ${error.message}`);
      return null;
    }
  }

  async setColorTemperature(value: number): Promise<boolean> {
    try {
      await this.client.request({
        request: 'set_color_temperature',
        value: value,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to set color temperature: ${error.message}`);
      return false;
    }
  }

  async getCurrentRotation(): Promise<number> {
    try {
      const response = await this.client.request({
        request: 'get_current_rotation',
      });
      return response.current_rotation_status || 0;
    } catch (error) {
      this.logger.error(`Failed to get current rotation: ${error.message}`);
      return 0;
    }
  }

  async getPhotoFilterList(): Promise<any[]> {
    try {
      const response = await this.client.request({
        request: 'get_photo_filter_list',
      });
      return JSON.parse(response.filter_list);
    } catch (error) {
      this.logger.error(`Failed to get photo filter list: ${error.message}`);
      return [];
    }
  }

  async setPhotoFilter(contentId: string, filterId: string): Promise<boolean> {
    try {
      await this.client.request({
        request: 'set_photo_filter',
        content_id: contentId,
        filter_id: filterId,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to set photo filter: ${error.message}`);
      return false;
    }
  }

  async getMatteList(includeColor: boolean = false): Promise<any> {
    try {
      const response = await this.client.request({
        request: 'get_matte_list',
      });
      const matteTypes = JSON.parse(response.matte_type_list);
      if (includeColor) {
        const matteColors = JSON.parse(response.matte_color_list || '[]');
        return { types: matteTypes, colors: matteColors };
      }
      return matteTypes;
    } catch (error) {
      this.logger.error(`Failed to get matte list: ${error.message}`);
      return includeColor ? { types: [], colors: [] } : [];
    }
  }

  async changeMatte(
    contentId: string,
    matteId?: string,
    portraitMatte?: string,
  ): Promise<boolean> {
    try {
      const request: any = {
        request: 'change_matte',
        content_id: contentId,
        matte_id: matteId || 'none',
      };

      if (portraitMatte) {
        request.portrait_matte_id = portraitMatte;
      }

      await this.client.request(request);
      return true;
    } catch (error) {
      this.logger.error(`Failed to change matte: ${error.message}`);
      return false;
    }
  }

  async selectImage(
    contentId: string,
    category?: string,
    show: boolean = true,
  ): Promise<boolean> {
    try {
      await this.client.request({
        request: 'select_image',
        category_id: category,
        content_id: contentId,
        show: show,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to select image: ${error.message}`);
      return false;
    }
  }

  async getArtModeStatus(): Promise<string> {
    try {
      const response = await this.client.request({
        request: 'get_artmode_status',
      });
      return response.value;
    } catch (error) {
      this.logger.error(`Failed to get art mode status: ${error.message}`);
      return 'off';
    }
  }

  async setArtModeStatus(mode: 'on' | 'off'): Promise<boolean> {
    try {
      await this.client.request({
        request: 'set_artmode_status',
        value: mode,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to set art mode status: ${error.message}`);
      return false;
    }
  }

  async getRawAvailableArt(): Promise<ArtContentItem[]> {
    try {
      return await this.client.getAvailableArt();
    } catch (error) {
      this.logger.error(`Failed to get raw available art: ${error.message}`);
      return [];
    }
  }

  /**
   * Fallback method to get basic art information without thumbnails
   * Useful when thumbnail retrieval fails
   */
  async getArtInfo(photoId: string): Promise<any> {
    try {
      const response = await this.client.request({
        request: 'get_artmode_status',
      });

      // Get current art and check if it matches the requested ID
      const currentArt = await this.getCurrentArt();
      if (currentArt && currentArt.id === photoId) {
        return {
          id: photoId,
          isCurrent: true,
          ...currentArt,
        };
      }

      return { id: photoId, isCurrent: false };
    } catch (error) {
      this.logger.error(`Failed to get art info for ${photoId}: ${error.message}`);
      return { id: photoId, isCurrent: false };
    }
  }

  /**
   * Alternative thumbnail method that might work better for some Frame models
   */
  async getThumbnailAlternative(photoId: string): Promise<Buffer> {
    try {
      // Try using a different approach - get content directly
      const response = await this.client.request({
        request: 'get_content',
        content_id: photoId,
        // Request a smaller version/thumbnail
        version: 'thumb',
      });

      if (response && response.content) {
        // If the response contains base64 data
        if (typeof response.content === 'string') {
          return Buffer.from(response.content, 'base64');
        }
      }

      return Buffer.alloc(0);
    } catch (error) {
      this.logger.debug(`Alternative thumbnail method failed for ${photoId}: ${error.message}`);
      return Buffer.alloc(0);
    }
  }
}
