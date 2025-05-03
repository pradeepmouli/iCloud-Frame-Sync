/**
 * The following lines intialize dotenv,
 * so that env vars from the .env file are present in process.env
 */

import { config } from 'dotenv';
import iCloudService from 'icloudjs';
import { SamsungFrameClient } from 'samsung-frame-connect';
config();

export const sum = (a: number, b: number): number => {
  return a + b;
};

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
