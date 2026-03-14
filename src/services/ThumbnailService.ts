import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';

export interface ThumbnailOptions {
	width?: number;
	height?: number;
	fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
	quality?: number;
}

export class ThumbnailService {
	private cacheDir: string;
	private logger: Logger;

	constructor(cacheDir: string, logger: Logger) {
		this.cacheDir = cacheDir;
		this.logger = logger;
	}

	/**
	 * Initialize the thumbnail cache directory
	 */
	async initialize(): Promise<void> {
		try {
			await mkdir(this.cacheDir, { recursive: true });
			this.logger.info(
				`Thumbnail cache directory initialized: ${this.cacheDir}`,
			);
		} catch (error) {
			this.logger.error(
				{ error },
				'Failed to initialize thumbnail cache directory',
			);
			throw error;
		}
	}

	/**
	 * Generate a cache key for a thumbnail
	 */
	private getCacheKey(contentId: string, options: ThumbnailOptions): string {
		const { width = 300, height = 300, fit = 'cover', quality = 80 } = options;
		return `${contentId}_${width}x${height}_${fit}_${quality}.jpg`;
	}

	/**
	 * Get the full path to a cached thumbnail
	 */
	private getCachePath(cacheKey: string): string {
		return path.join(this.cacheDir, cacheKey);
	}

	/**
	 * Check if a thumbnail exists in cache
	 */
	async hasCachedThumbnail(
		contentId: string,
		options: ThumbnailOptions = {},
	): Promise<boolean> {
		const cacheKey = this.getCacheKey(contentId, options);
		const cachePath = this.getCachePath(cacheKey);
		return existsSync(cachePath);
	}

	/**
	 * Get a cached thumbnail
	 */
	async getCachedThumbnail(
		contentId: string,
		options: ThumbnailOptions = {},
	): Promise<Buffer | null> {
		const cacheKey = this.getCacheKey(contentId, options);
		const cachePath = this.getCachePath(cacheKey);

		try {
			if (existsSync(cachePath)) {
				this.logger.debug(`Cache hit for thumbnail: ${cacheKey}`);
				return await readFile(cachePath);
			}
			this.logger.debug(`Cache miss for thumbnail: ${cacheKey}`);
			return null;
		} catch (error) {
			this.logger.error(
				{ error, contentId, cacheKey },
				'Failed to read cached thumbnail',
			);
			return null;
		}
	}

	/**
	 * Generate a thumbnail from an image buffer
	 */
	async generateThumbnail(
		imageBuffer: Buffer,
		contentId: string,
		options: ThumbnailOptions = {},
	): Promise<Buffer> {
		const { width = 300, height = 300, fit = 'cover', quality = 80 } = options;

		try {
			this.logger.debug(
				{ contentId, width, height, fit, quality },
				'Generating thumbnail',
			);

			const thumbnail = await sharp(imageBuffer)
				.resize(width, height, { fit })
				.jpeg({ quality })
				.toBuffer();

			// Cache the thumbnail
			const cacheKey = this.getCacheKey(contentId, options);
			const cachePath = this.getCachePath(cacheKey);

			try {
				await writeFile(cachePath, thumbnail);
				this.logger.debug(`Cached thumbnail: ${cacheKey}`);
			} catch (cacheError) {
				this.logger.warn(
					{ error: cacheError, cacheKey },
					'Failed to cache thumbnail',
				);
				// Continue even if caching fails
			}

			return thumbnail;
		} catch (error) {
			this.logger.error({ error, contentId }, 'Failed to generate thumbnail');
			throw error;
		}
	}

	/**
	 * Get or generate a thumbnail
	 * First checks cache, then generates if not found
	 */
	async getThumbnail(
		imageBuffer: Buffer,
		contentId: string,
		options: ThumbnailOptions = {},
	): Promise<Buffer> {
		// Try cache first
		const cached = await this.getCachedThumbnail(contentId, options);
		if (cached) {
			return cached;
		}

		// Generate new thumbnail
		return await this.generateThumbnail(imageBuffer, contentId, options);
	}

	/**
	 * Clear all cached thumbnails
	 */
	async clearCache(): Promise<void> {
		try {
			const { readdir, unlink } = await import('node:fs/promises');
			const files = await readdir(this.cacheDir);

			await Promise.all(
				files.map((file) =>
					unlink(path.join(this.cacheDir, file)).catch((error) => {
						this.logger.warn(
							{ error, file },
							'Failed to delete cached thumbnail',
						);
					}),
				),
			);

			this.logger.info('Thumbnail cache cleared');
		} catch (error) {
			this.logger.error({ error }, 'Failed to clear thumbnail cache');
			throw error;
		}
	}
}
