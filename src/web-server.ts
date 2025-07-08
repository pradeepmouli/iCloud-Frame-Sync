import cors from 'cors';
import express, { type Request, type Response } from 'express';
import path from 'node:path/win32';
import { pino, type Logger } from 'pino';
import { Application, type AppConfig } from './Application.js';
import { FrameEndpoint } from './services/FrameEndpoint.js';
import { iCloudEndpoint } from './services/iCloudEndpoint.js';
import type { SyncScheduler } from './services/SyncScheduler.js';
import { syncPhotosBetweenEndpoints } from './services/syncUtils.js';
import type { Album, Endpoint, Photo } from './types/endpoint.js';

export interface WebServerConfig {
  port: number;
  corsOrigin?: string;

  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

export class WebServer {
  private app = express();
  private logger: Logger;
  private config: WebServerConfig;
  // Remove syncApp, use endpoints directly
  private frameEndpoint: Endpoint | null = null;
  private iCloudEndpoint: Endpoint | null = null;
  private pendingMfaRequests = new Map<
    string,
    {
      resolve: (code: string) => void;
      reject: (error: Error) => void;
      timestamp: number;
    }
  >();

  constructor(config: WebServerConfig) {
    this.config = config;
    this.logger = pino({
      transport: { target: 'pino-pretty', options: { colorize: true } },
      level: config.logLevel || 'info',
    }).child({ name: 'WebServer' });
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors({ origin: 'http://localhost:3000' }));
    this.app.use(express.json());
    this.app.use(express.static('dist/web'));
  }

  private setupRoutes(): void {
    // Configuration routes
    this.app.post(
      '/api/config/test-icloud',
      this.testICloudConnection.bind(this),
    );
    this.app.post(
      '/api/config/test-frame',
      this.testFrameConnection.bind(this),
    );
    this.app.get('/api/config', this.getConfig.bind(this));
    this.app.post('/api/config', this.updateConfig.bind(this));

    // Authentication routes
    this.app.post('/api/auth/icloud', this.authenticateICloud.bind(this));
    this.app.post('/api/auth/icloud/logout', this.logoutICloud.bind(this));
    this.app.get('/api/auth/status', this.getAuthStatus.bind(this));
    this.app.post('/api/auth/mfa', this.submitMfaCode.bind(this));

    // Application control routes
    this.app.post('/api/app/start', this.startApp.bind(this));
    this.app.post('/api/app/stop', this.stopApp.bind(this));
    this.app.get('/api/app/status', this.getAppStatus.bind(this));

    // Sync control routes
    this.app.post('/api/sync/start', this.startSync.bind(this));
    this.app.post('/api/sync/stop', this.stopSync.bind(this));
    this.app.post('/api/sync/run-once', this.runSyncOnce.bind(this));
    this.app.get('/api/sync/status', this.getSyncStatus.bind(this));

    // Photo management routes
    this.app.get('/api/photos/albums', this.getAlbums.bind(this));
    this.app.get('/api/photos/:albumName', this.getPhotosInAlbum.bind(this));
    this.app.post(
      '/api/photos/:photoId/send-to-frame',
      this.sendPhotoToFrame.bind(this),
    );
    this.app.delete(
      '/api/photos/:photoId/from-icloud',
      this.deletePhotoFromICloud.bind(this),
    );

    // Frame management routes
    this.app.get('/api/frame/status', this.getFrameStatus.bind(this));
    this.app.get('/api/frame/art', this.getFrameArt.bind(this));
    this.app.delete('/api/frame/art/:artId', this.deleteFrameArt.bind(this));

    // Serve React app for all other routes
    this.app.get('/', (req, res) => {
      res.sendFile('index.html', { root: 'dist/web' });
    });
  }

  // Configuration handlers
  private async testICloudConnection(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { username, password } = req.body;

      // For now, just return success - actual testing would require full service setup
      res.json({
        success: true,
        status: 'Test connection functionality not yet implemented',
        message: 'Please use the full application to test iCloud connection',
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  private async testFrameConnection(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { host } = req.body;

      // For now, just return success - actual testing would require full service setup
      res.json({
        success: true,
        message: 'Test connection functionality not yet implemented',
        note: 'Please use the full application to test Frame connection',
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  private getConfig(req: Request, res: Response): void {
    const config = {
      iCloud: {
        username: process.env.ICLOUD_USERNAME || '',
        sourceAlbum: process.env.ICLOUD_SOURCE_ALBUM || 'Frame Sync',
      },
      frame: {
        host: process.env.SAMSUNG_FRAME_HOST || '',
      },
      syncIntervalSeconds: Number(process.env.ICLOUD_SYNC_INTERVAL || 60),
      logLevel: process.env.LOG_LEVEL || 'info',
    };
    res.json(config);
  }

  private updateConfig(req: Request, res: Response): void {
    // In a real implementation, you'd want to update environment variables
    // or a configuration file. For now, we'll just return success.
    res.json({ success: true, message: 'Configuration updated' });
  }

  // Authentication handlers
  private async authenticateICloud(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({
          success: false,
          error: 'Username and password are required',
        });
        return;
      }

      // Create MFA callback that communicates with the frontend
      const mfaCallback = (): Promise<string> => {
        return new Promise((resolve, reject) => {
          const requestId = Math.random().toString(36).substr(2, 9);

          // Store the request with a timeout
          this.pendingMfaRequests.set(requestId, {
            resolve,
            reject,
            timestamp: Date.now(),
          });

          // Send response indicating MFA is needed
          res.json({
            success: false,
            requiresMfa: true,
            mfaRequestId: requestId,
            message: 'MFA code required. Please check your Apple device.',
          });

          // Clean up after 5 minutes
          setTimeout(
            () => {
              const request = this.pendingMfaRequests.get(requestId);
              if (request) {
                this.pendingMfaRequests.delete(requestId);
                request.reject(new Error('MFA request timeout'));
              }
            },
            5 * 60 * 1000,
          );
        });
      };

      // Get or create PhotoSyncService with provided credentials
      const { PhotoSyncService } = await import(
        './services/PhotoSyncService.js'
      );

      // Create temporary config for authentication
      const authConfig = {
        iCloud: {
          username,
          password,
          sourceAlbum: 'temp',
          dataDirectory: path.resolve('./data'),
          requestMfaCallback: mfaCallback,
        },
        frame: { host: 'temp' },
        syncIntervalSeconds: 60,
        logLevel: 'info',
      };

      const authService = new iCloudEndpoint(authConfig.iCloud, this.logger);

      // Attempt authentication
      await authService.initialize();

      // If we get here, authentication was successful
      const userInfo = authService.accountInfo;

      res.json({
        success: true,
        status: authService.status,
        userInfo: {
          fullName: userInfo?.dsInfo?.fullName || 'Unknown User',
          appleId: username,
        },
      });
    } catch (error: any) {
      this.logger.error(`iCloud authentication error: ${error}`, error);
      /*res.status(500).json({
        success: false,
        error: error.message || 'Authentication failed',
      });*/
    }
  }

  private async submitMfaCode(req: Request, res: Response): Promise<void> {
    try {
      const { mfaRequestId, mfaCode } = req.body;

      if (!mfaRequestId || !mfaCode) {
        res.status(400).json({
          success: false,
          error: 'MFA request ID and code are required',
        });
        return;
      }

      const request = this.pendingMfaRequests.get(mfaRequestId);
      if (!request) {
        res.status(404).json({
          success: false,
          error: 'MFA request not found or expired',
        });
        return;
      }

      // Remove the request
      this.pendingMfaRequests.delete(mfaRequestId);

      // Resolve the MFA promise
      request.resolve(mfaCode);

      res.json({ success: true, message: 'MFA code submitted' });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to submit MFA code',
      });
    }
  }

  private async logoutICloud(req: Request, res: Response): Promise<void> {
    try {
      // Clear any pending MFA requests
      this.pendingMfaRequests.clear();

      // In a real implementation, you would clear stored credentials
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Logout failed',
      });
    }
  }

  private async getAuthStatus(req: Request, res: Response): Promise<void> {
    try {
      // In a real implementation, check if there's a valid authentication
      res.json({
        isAuthenticated: false,
        status: 'Not authenticated',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get auth status',
      });
    }
  }

  // Application control handlers
  private async startApp(req: Request, res: Response): Promise<void> {
    try {
      if (this.frameEndpoint || this.iCloudEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application already running' });
        return;
      }
      // Use environment/config for endpoint setup
      const logger = this.logger.child({ name: 'Endpoints' });
      const frameConfig = {
        host: process.env.SAMSUNG_FRAME_HOST || '',
        name: 'SamsungTv',
        verbosity: Number(process.env.SAMSUNG_FRAME_VERBOSITY || 2),
      };
      const iCloudConfig = {
        username: process.env.ICLOUD_USERNAME || '',
        password: process.env.ICLOUD_PASSWORD || '',
        sourceAlbum: process.env.ICLOUD_SOURCE_ALBUM || 'Frame Sync',
        dataDirectory: process.env.ICLOUD_DATA_DIRECTORY || './data',
      };
      this.frameEndpoint = new FrameEndpoint(
        frameConfig,
        logger.child({ name: 'Frame' }),
      );
      this.iCloudEndpoint = new iCloudEndpoint(
        iCloudConfig,
        logger.child({ name: 'iCloud' }),
      );
      await this.frameEndpoint.initialize();
      await this.iCloudEndpoint.initialize();
      res.json({ success: true, message: 'Application started' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async stopApp(req: Request, res: Response): Promise<void> {
    try {
      if (!this.frameEndpoint && !this.iCloudEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application not running' });
        return;
      }
      await this.frameEndpoint?.close();
      await this.iCloudEndpoint?.close();
      this.frameEndpoint = null;
      this.iCloudEndpoint = null;
      res.json({ success: true, message: 'Application stopped' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private getAppStatus(req: Request, res: Response): void {
    const isRunning = !!(this.frameEndpoint && this.iCloudEndpoint);
    // No scheduler in new model, so just return running status
    res.json({
      isRunning,
      syncStatus: isRunning,
      syncInProgress: false,
      syncInterval: Number(process.env.ICLOUD_SYNC_INTERVAL || 60),
    });
  }

  // Sync control handlers
  private async startSync(req: Request, res: Response): Promise<void> {
    if (!this.iCloudEndpoint || !this.frameEndpoint) {
      res
        .status(400)
        .json({ success: false, error: 'Application not running' });
      return;
    }
    // For now, just run sync once (no scheduler)
    try {
      await syncPhotosBetweenEndpoints(
        this.iCloudEndpoint,
        this.frameEndpoint,
        this.logger,
      );
      res.json({ success: true, message: 'Sync completed' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private stopSync(req: Request, res: Response): void {
    // No-op in new model (no scheduler)
    res.json({ success: true, message: 'Sync stopped (no scheduler)' });
  }

  private async runSyncOnce(req: Request, res: Response): Promise<void> {
    // Alias for startSync
    await this.startSync(req, res);
  }

  private getSyncStatus(req: Request, res: Response): void {
    const isRunning = !!(this.frameEndpoint && this.iCloudEndpoint);
    res.json({
      isRunning,
      inProgress: false,
      intervalSeconds: Number(process.env.ICLOUD_SYNC_INTERVAL || 60),
    });
  }

  // Photo management handlers
  private async getAlbums(req: Request, res: Response): Promise<void> {
    try {
      if (!this.iCloudEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application not running' });
        return;
      }
      // Use albums from iCloudEndpoint
      const albums =
        (await (this.iCloudEndpoint.albums || Promise.resolve([]))) || [];
      res.json({ albums: albums.map((a: any) => a.name) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async getPhotosInAlbum(req: Request, res: Response): Promise<void> {
    try {
      const { albumName } = req.params;
      if (!this.iCloudEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application not running' });
        return;
      }
      const albums =
        (await (this.iCloudEndpoint.albums || Promise.resolve([]))) || [];
      const album = albums.find((a: any) => a.name === albumName);
      const photos = album ? await album.photos : [];
      res.json({ photos });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async sendPhotoToFrame(req: Request, res: Response): Promise<void> {
    try {
      const { photoId } = req.params;
      if (!this.iCloudEndpoint || !this.frameEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application not running' });
        return;
      }
      // Find photo in iCloudEndpoint
      const photos = await this.iCloudEndpoint.photos;
      const photo = photos.find((p: any) => p.id === photoId);
      if (!photo) {
        res.status(404).json({ success: false, error: 'Photo not found' });
        return;
      }
      await this.frameEndpoint.upload(photo);
      res.json({ success: true, message: `Photo ${photoId} sent to frame` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async deletePhotoFromICloud(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { photoId } = req.params;
      if (!this.iCloudEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application not running' });
        return;
      }
      const photos = await this.iCloudEndpoint.photos;
      const photo = photos.find((p: any) => p.id === photoId);
      if (!photo) {
        res.status(404).json({ success: false, error: 'Photo not found' });
        return;
      }
      await photo.delete();
      res.json({
        success: true,
        message: `Photo ${photoId} deleted from iCloud`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Frame management handlers
  private async getFrameStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!this.frameEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application not running' });
        return;
      }
      // Optionally, add more frame info if available
      res.json({ isOn: true, inArtMode: true, deviceInfo: {} });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async getFrameArt(req: Request, res: Response): Promise<void> {
    try {
      if (!this.frameEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application not running' });
        return;
      }

      // Cast to FrameEndpoint to access Frame-specific methods
      const frameEndpoint = this.frameEndpoint as FrameEndpoint;

      // Get available art raw data using the new method
      const artItems = await frameEndpoint.getRawAvailableArt();

      // Enhance art items with thumbnail data
      const artWithThumbnails = await Promise.allSettled(
        artItems.map(async (art) => {
          try {
            const thumbnail = await frameEndpoint.getThumbnail(art.id);
            return {
              id: art.id,
              name: art.id, // Use ID as name for now
              dimensions: {
                width: art.width || 0,
                height: art.height || 0,
              },
              dateAdded: art.date || new Date(),
              categoryId: art.categoryId,
              slideshow: art.slideshow,
              matte: art.matte,
              portraitMatte: art.portraitMatte,
              thumbnail:
                thumbnail.length > 0
                  ? `data:image/jpeg;base64,${thumbnail.toString('base64')}`
                  : null,
            };
          } catch (error) {
            this.logger.warn(
              `Failed to get thumbnail for art ${art.id}: ${error.message}`,
            );
            return {
              id: art.id,
              name: art.id,
              dimensions: {
                width: art.width || 0,
                height: art.height || 0,
              },
              dateAdded: art.date || new Date(),
              categoryId: art.categoryId,
              slideshow: art.slideshow,
              matte: art.matte,
              portraitMatte: art.portraitMatte,
              thumbnail: null,
            };
          }
        }),
      );

      // Filter out rejected promises and extract values
      const processedArt = artWithThumbnails
        .filter(
          (result): result is PromiseFulfilledResult<any> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value);

      res.json({ art: processedArt });
    } catch (error: any) {
      this.logger.error(`Failed to get frame art: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async deleteFrameArt(req: Request, res: Response): Promise<void> {
    try {
      const { artId } = req.params;
      if (!this.frameEndpoint) {
        res
          .status(400)
          .json({ success: false, error: 'Application not running' });
        return;
      }

      // Cast to FrameEndpoint to access Frame-specific methods
      const frameEndpoint = this.frameEndpoint as FrameEndpoint;

      // Delete the art from the Frame
      const success = await frameEndpoint.deleteArt(artId);

      if (success) {
        res.json({
          success: true,
          message: `Art ${artId} deleted successfully`,
        });
      } else {
        res.status(500).json({
          success: false,
          error: `Failed to delete art ${artId}`,
        });
      }
    } catch (error: any) {
      this.logger.error(`Failed to delete frame art: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  start(): void {
    this.app.listen(this.config.port, () => {
      this.logger.info(`Web server running on port ${this.config.port}`);
    });
  }
}
