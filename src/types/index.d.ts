declare module 'samsung-frame-connect' {
  import { EventEmitter } from 'events';
  import { ConditionalPick, Schema, type ConditionalKeys } from 'type-fest';

  // Options for SamsungFrameClient
  export interface SamsungFrameClientOptions<T extends ServicesSchema> {
    host: string;
    name?: string;
    services?: ConditionalKeys<T, boolean>[];
    verbosity?: number;
  }

  type ServicesSchema = Record<Services, boolean>;

  type Services = 'art-mode' | 'remote-control' | 'device';
  // Art Mode Endpoint
  export interface ArtModeEndpoint {
    deleteArt(ids: string | string[]): Promise<{ id: string }[]>;
    getAPIVersion(): Promise<string>;
    getArtModeInfo(): Promise<any>;
    getAvailableArt(): Promise<ArtContentItem[]>;
    getBrightness(): Promise<number>;
    getCurrentArt(): Promise<ArtContentItem>;
    getMatteColors(): Promise<string[]>;
    getMatteTypes(): Promise<string[]>;
    inArtMode(): Promise<boolean>;
    setBrightness(value: number): Promise<void>;
    setCurrentArt(options: { id: string; category?: string }): Promise<void>;
    setMatte(options: {
      id: string;
      type: string;
      color: string;
    }): Promise<void>;
    upload(
      buffer: Buffer,
      options: { fileType?: string; matteType?: string; matteColor?: string },
    ): Promise<string>;
  }

  export interface ArtContentItem {
    id: string;
    date?: Date;
    categoryId?: string;
    slideshow?: boolean;
    matte?: Matte | null;
    portraitMatte?: Matte | null;
    width?: number;
    height?: number;
  }

  export interface Matte {
    type: string;
    color: string;
  }

  // Device Endpoint
  export interface DeviceEndpoint {
    getDeviceInfo(): Promise<any>;
    isOn(): Promise<boolean>;
  }

  // Remote Control Endpoint
  export interface RemoteControlEndpoint {
    togglePower(): Promise<void>;
  }

  // SamsungFrameClient
  export class SamsungFrameClient<
    T extends ServicesSchema,
  > extends EventEmitter {
    constructor(options: SamsungFrameClientOptions<T>);

    connect(): Promise<void>;
    close(): Promise<void>;

    // Delegated methods from endpoints
    deleteArt(
      ids: string | string[],
    ): T['art-mode'] extends true ? Promise<{ id: string }[]> : undefined;
    getAPIVersion(): Promise<string>;
    getArtModeInfo(): Promise<any>;
    getAvailableArt(): Promise<ArtContentItem[]>;
    getBrightness(): Promise<number>;
    getCurrentArt(): Promise<ArtContentItem>;
    getMatteColors(): Promise<string[]>;
    getMatteTypes(): Promise<string[]>;
    inArtMode(): Promise<boolean>;
    setBrightness(value: number): Promise<void>;
    setCurrentArt(options: { id: string; category?: string }): Promise<void>;
    setMatte(options: {
      id: string;
      type: string;
      color: string;
    }): Promise<void>;
    upload(
      buffer: Buffer,
      options: { fileType?: string; matteType?: string; matteColor?: string },
    ): Promise<string>;
    getDeviceInfo(): Promise<any>;
    isOn(): Promise<boolean>;
    togglePower(): Promise<void>;
  }

  export type SamsungFrameClientType<T extends ServicesSchema> =
    (T['art-mode'] extends true ? ArtModeEndpoint : undefined) &
      (T['device'] extends true ? DeviceEndpoint : undefined) &
      (T['remote-control'] extends true ? RemoteControlEndpoint : undefined) &
      Omit<
        SamsungFrameClient<T>,
        | keyof ArtModeEndpoint
        | keyof DeviceEndpoint
        | keyof RemoteControlEndpoint
      > &
      SamsungFrameClient<T> &
      (new (...args: any[]) => SamsungFrameClient<T>);
}
