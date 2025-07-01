import type { Logger } from 'pino';
import {
  SamsungFrameClient,
  type SamsungFrameClientOptions,
  type SamsungFrameClientType,
  type ServicesSchema,
} from 'samsung-frame-connect';

export class FrameManager<
  T extends ServicesSchema = {
    'art-mode': true;
    device: true;
    'remote-control': true;
  },
> {
  private client: SamsungFrameClientType<T>;
  private logger: Logger;

  constructor(config: SamsungFrameClientOptions<T>, logger: Logger) {
    this.logger = logger;
    this.client = new SamsungFrameClient({
      host: config.host,
      name: config.name || 'SamsungTv',
      services: config.services,
      verbosity: config.verbosity || 0,
    }) as SamsungFrameClientType<T>;
  }

  async initialize(): Promise<void> {
    const deviceInfo = await this.client.getDeviceInfo();
    this.logger.info(`Device Info: ${JSON.stringify(deviceInfo, null, 2)}`);

    const isOn = await this.client.isOn();
    this.logger.info(`Is On: ${isOn}`);

    if (!isOn) {
      this.logger.info('Device is off, turning it on...');
      await this.client.togglePower();
      this.logger.info('Device is on');
    }

    await this.client.connect();

    const inArtMode = await this.client.inArtMode();
    this.logger.info(`In Art Mode: ${inArtMode}`);

    const artModeInfo = await this.client.getArtModeInfo();
    this.logger.info(`Art Mode Info: ${JSON.stringify(artModeInfo, null, 2)}`);

    await this.client.getAvailableArt();
    this.logger.info(`Available Art: ${JSON.stringify(artModeInfo, null, 2)}`);
  }

  async isOn(): Promise<boolean> {
    return await this.client.isOn();
  }

  async togglePower(): Promise<void> {
    await this.client.togglePower();
  }

  async inArtMode(): Promise<boolean> {
    return await this.client.inArtMode();
  }

  async getDeviceInfo(): Promise<any> {
    return await this.client.getDeviceInfo();
  }

  async getArtModeInfo(): Promise<any> {
    return await this.client.getArtModeInfo();
  }

  async upload(buffer: Buffer, options: { fileType: string }): Promise<string> {
    return await this.client.upload(buffer, options);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  getClient(): SamsungFrameClientType<T> {
    return this.client;
  }
}
