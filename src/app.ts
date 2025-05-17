/**
 * The following lines intialize dotenv,
 * so that env vars from the .env file are present in process.env
 */

import { config } from '@dotenvx/dotenvx';
import iCloudService, { iCloudServiceStatus } from 'icloudjs';
import { iCloudPhotosService } from 'icloudjs/build/services/photos.js';
import {
  SamsungFrameClient,
  type SamsungFrameClientType,
  type ServicesSchema,
} from 'samsung-frame-connect';
config();

let s = new SamsungFrameClient({
  host: process.env.SAMSUNG_FRAME_HOST,
  name: 'SamsungTv',
  services: ['art-mode', 'device'],
  verbosity: 2,
});

process.on('SIGINT', async () => {
  console.info('SIGINT received, closing connection...');
  await s.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.info('SIGTERM received, closing connection...');
  await s.close();
  process.exit(0);
});

let d = await s.getDeviceInfo();

console.info(`Device Info: ${JSON.stringify(d, null, 2)}`);

let b = await s.isOn();

console.info(`Is On: ${b}`);

await s.connect();
let k = await s.inArtMode();
console.info(`In Art Mode: ${k}`);

let a = await s.getArtModeInfo();

console.info(`Art Mode Info: ${JSON.stringify(a, null, 2)}`);

await s.getAvailableArt();
console.info(`Available Art: ${JSON.stringify(a, null, 2)}`);
let c = new iCloudService.default({
  dataDirectory: './data',
  username: process.env.ICLOUD_USERNAME,
  password: process.env.ICLOUD_PASSWORD,
  saveCredentials: true,
  trustDevice: true,
  authMethod: 'srp',
});

await c.authenticate();
if (c.status === iCloudServiceStatus.MfaRequested) {
  // Handle MFA
  console.info('MFA requested, please check your device for the code');
  let mfaCode = await new Promise<string>((resolve) => {
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
  await c.provideMfaCode(mfaCode);
}
let p = c.getService('photos') as iCloudPhotosService;
let albums = await p.getAlbums();
console.info(`Albums: ${JSON.stringify(albums, null, 2)}`);
let m = albums.get('Frame Crop');
let ph = await m.getPhotos();
console.info(`Photos: ${JSON.stringify(ph, null, 2)}`);
for (const a of ph) {
  let i = await a.download();
  console.info(`Photo: ${JSON.stringify(a, null, 2)}`);
  let res = await s.upload(Buffer.from(i), { fileType: 'image/jpeg' });
  console.info(`Upload: ${JSON.stringify(res, null, 2)}`);
  await a.delete();
}
