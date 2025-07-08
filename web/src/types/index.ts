export interface Photo {
  id: string;
  filename: string;
  dimensions: { width: number; height: number };
  size: number;
  dateCreated: string;
  thumbnailUrl?: string;
}

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
