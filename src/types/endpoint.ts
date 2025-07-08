// Common Endpoint and Photo interfaces for n-way sync

export interface Photo {
  id: string;
  filename: string;
  dimensions: { width: number; height: number };
  size: number;
  download(): Promise<Uint8Array | Buffer>;
  thumbnailUrl?: string;
  delete(): Promise<boolean>;
}

export interface iCloudConfig {
  username: string;
  password: string;
  sourceAlbum: string;
  dataDirectory?: string;
  requestMfaCallback?: () => Promise<string>;
  logLevel?: string; // Optional log level for iCloud endpoint
}

export interface EndpointConfig {
  [key: string]: any;
}

export interface Endpoint {
  // Optionally accept config in constructor
  // constructor(config?: EndpointConfig)
  initialize(): Promise<void>;
  upload(photo: Photo): Promise<string>;
  close(): Promise<void>;
  // For iCloud: albums property, for others can be undefined/null
  albums?: Promise<any[]>;
  // Photos property returns Photo[] (FramePhoto or iCloudPhoto)
  photos: Promise<Photo[]>;
}

// Optionally, Album interface for iCloud
export interface Album {
  id: string;
  name: string;
  photos: Promise<Photo[]>;
}
export interface iCloudConfig {
  username: string;
  password: string;
  sourceAlbum: string;
  dataDirectory?: string;
  requestMfaCallback?: () => Promise<string>;
}
export interface FrameConfig {
  host: string;
  name?: string;
  services?: string[];
  verbosity?: number;

  logLevel?: string; // Optional log level for Frame endpoint
}
