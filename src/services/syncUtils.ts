import { Buffer } from 'buffer';
import exifReader from 'exif-reader';
import type { Endpoint, Photo } from '../types/endpoint.js';

/**
 * Generic n-way sync: syncs all photos from source to destination endpoint.
 * Optionally, you can extend this to support two-way or multi-endpoint sync.
 */
export async function syncPhotosBetweenEndpoints(
  source: Endpoint,
  destination: Endpoint,
  logger: { info: (...args: any[]) => void; error: (...args: any[]) => void },
) {
  await source.initialize();
  await destination.initialize();

  logger.info('Fetching photos from source endpoint...');
  const sourcePhotos = await source.photos;
  logger.info(`Found ${sourcePhotos.length} photos in source.`);

  // Optionally, fetch destination photos for deduplication
  const destPhotos = await destination.photos;
  const destPhotoIds = new Set(destPhotos.map((p) => p.id));

  let uploaded = 0;
  for (const photo of sourcePhotos) {
    if (destPhotoIds.has(photo.id)) {
      logger.info(`Photo already exists in destination: ${photo.filename}`);
      continue;
    }
    try {
      logger.info(`Uploading photo: ${photo.filename}`);
      await destination.upload(photo);
      uploaded++;
    } catch (err) {
      logger.error(`Failed to upload photo ${photo.filename}:`, err);
    }
  }
  logger.info(`Sync complete. Uploaded ${uploaded} new photos.`);
}

export function isPhotoInEndpoint(
  photo: Photo,
  endpoint: Endpoint,
): Promise<boolean> {
  return endpoint.photos.then((photos) => {
    return photos.some((p) => p.id === photo.id);
  });
}

export async function getExifDataFromPhoto(
  photo: Photo,
): Promise<exifReader.Exif | null> {
  if (!photo || typeof photo.download !== 'function')
    return Promise.resolve(null);
  return photo.download().then((buffer: Buffer) => {
    try {
      const exif = exifReader(buffer);
      return exif;
    } catch (e) {
      return null;
    }
  });
}
