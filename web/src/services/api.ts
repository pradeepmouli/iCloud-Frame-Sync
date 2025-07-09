// Frame art interface
export interface FrameArt {
  id: string;
  name: string;
  dimensions: {
    width: number;
    height: number;
  };
  dateAdded: Date | string;
  categoryId?: string;
  slideshow?: boolean;
  matte?: {
    type: string;
    color: string;
  };
  portraitMatte?: {
    type: string;
    color: string;
  };
  thumbnail?: string; // Base64 data URL or URL
}

// Unified Photo and Album types for n-way sync endpoints
export interface Photo {
  id: string;
  filename: string;
  dimensions: { width: number; height: number };
  size: number;
  thumbnailUrl?: string;
  // Optionally, add more fields as needed
}

export interface Album {
  id: string;
  name: string;
  photos: Photo[];
}

const API_BASE = '/api';

export interface AppStatus {
  isRunning: boolean;
  syncStatus: boolean;
  syncInProgress: boolean;
  syncInterval: number;
}

export interface SyncStatus {
  isRunning: boolean;
  inProgress: boolean;
  intervalSeconds: number;
}

export interface FrameStatus {
  isOn: boolean;
  inArtMode: boolean;
  deviceInfo: any;
}

export interface Config {
  iCloud: {
    username: string;
    sourceAlbum: string;
  };
  frame: {
    host: string;
  };
  syncIntervalSeconds: number;
  logLevel: string;
}

class ApiService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getConfig(): Promise<Config> {
    return this.request<Config>('/config');
  }

  async updateConfig(config: Partial<Config>): Promise<{ success: boolean }> {
    return this.request('/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async testICloudConnection(credentials: {
    username: string;
    password: string;
  }): Promise<{ success: boolean; status?: string; error?: string }> {
    return this.request('/config/test-icloud', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async testFrameConnection(frameConfig: {
    host: string;
  }): Promise<{ success: boolean; deviceInfo?: any; error?: string }> {
    return this.request('/config/test-frame', {
      method: 'POST',
      body: JSON.stringify(frameConfig),
    });
  }

  // iCloud Authentication API
  async authenticateICloud(credentials: {
    username: string;
    password: string;
    mfaCallback?: () => Promise<string>;
  }): Promise<{
    success: boolean;
    status?: string;
    error?: string;
    userInfo?: {
      fullName: string;
      appleId: string;
    };
  }> {
    // Initial authentication request
    const response = await this.request<{
      success: boolean;
      requiresMfa?: boolean;
      mfaRequestId?: string;
      status?: string;
      error?: string;
      message?: string;
      userInfo?: {
        fullName: string;
        appleId: string;
      };
    }>('/auth/icloud', {
      method: 'POST',
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
      }),
    });

    // If MFA is required, handle it
    if (
      response.requiresMfa &&
      response.mfaRequestId &&
      credentials.mfaCallback
    ) {
      try {
        // Get MFA code from callback
        const mfaCode = await credentials.mfaCallback();

        if (!mfaCode) {
          throw new Error('MFA cancelled by user');
        }

        // Submit MFA code
        await this.request('/auth/mfa', {
          method: 'POST',
          body: JSON.stringify({
            mfaRequestId: response.mfaRequestId,
            mfaCode,
          }),
        });

        // Poll for authentication completion
        return await this.pollAuthenticationResult(response.mfaRequestId, 30); // 30 second timeout
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'MFA authentication failed',
        };
      }
    }

    return response;
  }

  private async pollAuthenticationResult(
    mfaRequestId: string,
    timeoutSeconds: number,
  ): Promise<{
    success: boolean;
    status?: string;
    error?: string;
    userInfo?: {
      fullName: string;
      appleId: string;
    };
  }> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getAuthStatus();
        if (status.isAuthenticated) {
          return {
            success: true,
            status: status.status,
            userInfo: status.userInfo,
          };
        }
      } catch (error) {
        // Continue polling on error
      }

      // Wait 1 second before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return {
      success: false,
      error: 'Authentication timeout - please try again',
    };
  }

  async logoutICloud(): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/icloud/logout', {
      method: 'POST',
    });
  }

  async getAuthStatus(): Promise<{
    isAuthenticated: boolean;
    status: string;
    userInfo?: {
      fullName: string;
      appleId: string;
    };
  }> {
    return this.request('/auth/status');
  }

  // Application control API
  async startApp(): Promise<{ success: boolean; message: string }> {
    return this.request('/app/start', { method: 'POST' });
  }

  async stopApp(): Promise<{ success: boolean; message: string }> {
    return this.request('/app/stop', { method: 'POST' });
  }

  async getAppStatus(): Promise<AppStatus> {
    return this.request<AppStatus>('/app/status');
  }

  // Sync control API
  async startSync(): Promise<{ success: boolean; message: string }> {
    return this.request('/sync/start', { method: 'POST' });
  }

  async stopSync(): Promise<{ success: boolean; message: string }> {
    return this.request('/sync/stop', { method: 'POST' });
  }

  async runSyncOnce(): Promise<{ success: boolean; message: string }> {
    return this.request('/sync/run-once', { method: 'POST' });
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return this.request<SyncStatus>('/sync/status');
  }

  // Photo management API
  async getAlbums(): Promise<{ albums: string[] }> {
    return this.request<{ albums: string[] }>('/photos/albums');
  }

  async getPhotosInAlbum(albumName: string): Promise<{ photos: Photo[] }> {
    return this.request<{ photos: Photo[] }>(
      `/photos/${encodeURIComponent(albumName)}`,
    );
  }

  async sendPhotoToFrame(
    photoId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/photos/${photoId}/send-to-frame`, { method: 'POST' });
  }

  async deletePhotoFromICloud(
    photoId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/photos/${photoId}/from-icloud`, { method: 'DELETE' });
  }

  // Frame management API
  async getFrameStatus(): Promise<FrameStatus> {
    return this.request<FrameStatus>('/frame/status');
  }

  async getFrameArt(): Promise<{ art: FrameArt[] }> {
    return this.request<{ art: FrameArt[] }>('/frame/art');
  }

  async deleteFrameArt(
    artId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/frame/art/${artId}`, { method: 'DELETE' });
  }

  // EXIF data API
  async getFrameArtExif(
    artId: string,
  ): Promise<{ success: boolean; exif: any; message?: string }> {
    return this.request(`/frame/art/${artId}/exif`);
  }

  async getPhotoExif(
    photoId: string,
  ): Promise<{ success: boolean; exif: any; message?: string }> {
    return this.request(`/photos/${photoId}/exif`);
  }
}

export const api = new ApiService();
