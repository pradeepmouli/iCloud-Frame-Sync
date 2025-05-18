/**
 * The following lines intialize dotenv,
 * so that env vars from the .env file are present in process.env
 */

import { config } from '@dotenvx/dotenvx';
import iCloud, {
  LogLevel,
  type iCloudPhotoAsset,
  type iCloudPhotosService,
} from 'icloudjs';

import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { P, pino } from 'pino';
import {
  SamsungFrameClient,
  type SamsungFrameClientType,
  type ServicesSchema,
} from 'samsung-frame-connect';
config();

const logger = pino({
  transport: { target: 'pino-pretty', options: { colorize: true } },
  level: process.env.LOG_LEVEL ?? 'info',
});
const bindings = {
  name: 'Samsung Frame Client',
};

const frameLogger = logger.child({ name: 'Samsung Frame Client' });
const iCloudLogger = logger.child({ name: 'iCloud Client' });

const frameClient = new SamsungFrameClient({
  host: process.env.SAMSUNG_FRAME_HOST,
  name: 'SamsungTv',
  services: ['art-mode', 'device'],
  verbosity: Number(process.env.SAMSUNG_FRAME_VERBOSITY ?? 0),
});

process.once('SIGINT', async () => {
  logger.info('SIGINT received, closing connection...');
  setTimeout(5000, () => {
    logger.info('Force closing connection...');
    process.exit(1);
  });
  await frameClient.close();
  logger.info('Connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing connection...');
  await frameClient.close();
  logger.info('Connection closed');
  process.exit(0);
});

let deviceInfo = await frameClient.getDeviceInfo();

frameLogger.info(`Device Info: ${JSON.stringify(deviceInfo, null, 2)}`);

let b = await frameClient.isOn();

frameLogger.info(`Is On: ${await frameClient.isOn()}`);

if (!b) {
  logger.info('Device is off, turning it on...');
  await frameClient.togglePower();
  frameLogger.info('Device is on');
}

await frameClient.connect();
let k = await frameClient.inArtMode();

frameLogger.info(`In Art Mode: ${k}`);

let a = await frameClient.getArtModeInfo();

frameLogger.info(`Art Mode Info: ${JSON.stringify(a, null, 2)}`);

await frameClient.getAvailableArt();
frameLogger.info(`Available Art: ${JSON.stringify(a, null, 2)}`);

const iCloudClient = new iCloud.default({
  dataDirectory: './data',
  username: process.env.ICLOUD_USERNAME,
  password: process.env.ICLOUD_PASSWORD,
  saveCredentials: true,
  trustDevice: true,
  authMethod: 'srp',
  logger: (level, ...args: any[]) => {
    switch (level) {
      case LogLevel.Error:
        iCloudLogger.error(args);
        break;
      case LogLevel.Info:
        iCloudLogger.info(args);
        break;
      case LogLevel.Debug:
        iCloudLogger.debug(args);
        break;
      case LogLevel.Silent:
        iCloudLogger.trace(args);
        break;
      case LogLevel.Warning:
        iCloudLogger.warn(args);
        break;
      default:
        iCloudLogger.info(args);
        break;
    }
  },
});

iCloudLogger.info('Starting iCloud client...');
iCloudLogger.info('Authenticating...');

await iCloudClient.authenticate();

if (iCloudClient.status === 'MfaRequested') {
  // Handle MFA
  iCloudLogger.info('MFA requested, please check your device for the code');
  let mfaCode = await new Promise<string>((resolve) => {
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
  await iCloudClient.provideMfaCode(mfaCode);
}

await iCloudClient.awaitReady;
iCloudLogger.info(iCloudClient.status);
iCloudLogger.info('Hello, ' + iCloudClient.accountInfo.dsInfo.fullName);

let p = iCloudClient.getService('photos') as iCloudPhotosService;

let albums = await p.getAlbums();
iCloudLogger.info(`Available Albums: ${Array.from(albums.keys()).join(', ')}`);
//logger.info(`Albums: ${JSON.stringify(new Array(albums.values()), null, 2)}`);
let m = albums.get(process.env.ICLOUD_SOURCE_ALBUM ?? 'Frame Sync');

if (!m) {
  iCloudLogger.error(
    `Album not found: ${process.env.ICLOUD_SOURCE_ALBUM ?? 'Frame Sync'}`,
  );
  process.exit(0);
} else {
  iCloudLogger.info(
    `Using album: ${process.env.ICLOUD_SOURCE_ALBUM ?? 'Frame Sync'}`,
  );
}

const handledPhotos = new Set<string>();

async function syncPhotos() {
  let photos = await m.getPhotos();

  if (photos.length === 0) {
    iCloudLogger.info('No photos to sync');
  } else {
    iCloudLogger.info(`Found ${photos.length} photos to sync`);
    iCloudLogger.info(
      `Photos: ${JSON.stringify(
        photos.map((p) => p.filename),
        null,
        2,
      )}`,
    );

    iCloudLogger.info('Syncing photos...');
    let count = 1;

    for (const p of photos) {
      let photo = p;

      iCloudLogger.info(
        `Syncing photo: ${photo.filename} (${count}/${photos.length})`,
      );
      //@ts-ignore
      if (photo.masterRecord.deleted) {
        iCloudLogger.info(`Photo deleted: ${photo.filename}`);
        continue;
      }
      if (handledPhotos.has(photo.filename)) {
        iCloudLogger.info(`Photo already synced: ${photo.filename}`);
        continue;
      }

      iCloudLogger.info(
        `Photo: ${JSON.stringify({ filename: photo.filename, dimensions: photo.dimension }, null, 2)}`,
      );
      let i = await photo.download('original');

      logger.debug(`Photo: ${JSON.stringify(photo, null, 2)}`);
      let res = await frameClient.upload(Buffer.from(i), {
        fileType: path.extname(photo.filename),
      });
      logger.info(`Photo uploaded - id: ${res}`);
      count++;

      if (await photo.delete()) {
        iCloudLogger.info(`Photo deleted: ${photo.filename}`);
      }
      handledPhotos.add(photo.filename);
    }
    iCloudLogger.info('Photos synced');
  }
}

await syncPhotos();

let isSyncing = false;

const timer = setInterval(
  async () => {
    if (isSyncing) {
      iCloudLogger.info('Sync already in progress, skipping this interval.');
      return;
    }
    isSyncing = true;
    try {
      await syncPhotos();
      timer.refresh();
    } finally {
      isSyncing = false;
    }
  },
  1000 * Number(process.env.ICLOUD_SYNC_INTERVAL ?? 60),
);
