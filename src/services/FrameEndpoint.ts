import exif from 'exif-reader';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import * as tls from 'node:tls';
import type { Logger } from 'pino';
import {
	SamsungFrameClient,
	type ArtContentItem,
	type SamsungFrameClientOptions,
	type SamsungFrameClientType,
	type ServicesSchema,
} from 'samsung-frame-connect';
import type { Endpoint, FrameConfig, Photo } from '../types/endpoint.js';

export class FramePhoto implements Photo {
	id: string;
	filename: string;
	dimensions: { width: number; height: number; };
	size!: number;
	private buffer!: Buffer;
	client: SamsungFrameClientType<{
		'art-mode': true;
		device: true;
		'remote-control': true;
	}> | undefined = undefined;

	constructor (
		sourceObj: ArtContentItem,

		client?: SamsungFrameClientType<{
			'art-mode': true;
			device: true;
			'remote-control': true;
		}>,
	) {
		this.id = sourceObj.id;
		this.filename = sourceObj.id;
		this.dimensions = {
			width: sourceObj.width || 0,
			height: sourceObj.height || 0,
		};
		this.client = client;
	}
	async download(): Promise<Buffer> {
		return this.buffer;
	}

	/**
	 * Extract EXIF data from the photo buffer (if available)
	 */
	async getExifData(): Promise<any> {
		if (!this.buffer) return null;
		try {
			const exifData = exif(this.buffer);
			return exifData;
		} catch (err) {
			// Could not parse EXIF
			return null;
		}
	}
	async delete(): Promise<boolean> {
		// Frame photos are not deleted
		this.client?.deleteArt([this.id]);

		return false;
	}
}
export class FrameEndpoint implements Endpoint {
	initialized = false;
	private client: SamsungFrameClientType<any>;
	private logger: Logger;
	config: SamsungFrameClientOptions<any>;
	private _photos: FramePhoto[] = [];

	private async withClient<T>(op: () => Promise<T>): Promise<T> {
		try {
			return await op();
		} catch (error) {
			const details = this.extractErrorDetails(error);
			// Attempt a one-time reconnect on common connection errors and retry
			// But skip if already connecting to avoid "WebSocket is not open: readyState 0" errors
			if (typeof details.message === 'string' &&
				(details.message.includes('send') ||
					details.message.includes('not connected') ||
					details.message.includes('closed')) &&
				!details.message.includes('readyState 0')) {
				this.logger.warn({ error: details.message }, 'Frame client not connected, attempting reconnect...');
				try {
					await this.client.connect();
					return await op();
				} catch (reconnectError) {
					this.logger.error({ error: this.extractErrorDetails(reconnectError).message }, 'Reconnect attempt failed');
					throw reconnectError;
				}
			}
			throw error;
		}
	}

	constructor (config: FrameConfig, logger: Logger) {
		this.logger = logger;
		this.client = new SamsungFrameClient({
			host: config.host,
			name: config.name || 'SamsungTv',
			services: ['art-mode', 'device'],
			verbosity: config.verbosity || 0,
		}) as SamsungFrameClientType<any>;
		this.config = config;
	}

	getHost(): string {
		return this.config.host;
	}

	async getDeviceInfo(): Promise<Record<string, unknown>> {
		try {
			return await this.withClient(() => this.client.getDeviceInfo());
		} catch (error) {
			this.logger.error({ error }, 'Failed to retrieve frame device info');
			throw error;
		}
	}

	async isOn(): Promise<boolean> {
		try {
			return await this.withClient(() => this.client.isOn());
		} catch (error) {
			this.logger.error({ error }, 'Failed to determine frame power state');
			throw error;
		}
	}

	async togglePower(): Promise<boolean> {
		try {
			await this.withClient(() => this.client.togglePower());
			return await this.withClient(() => this.client.isOn());
		} catch (error) {
			this.logger.error({ error }, 'Failed to toggle frame power');
			throw error;
		}
	}

	async powerOn(): Promise<boolean> {
		try {
			if (await this.withClient(() => this.client.isOn())) {
				return true;
			}
			await this.withClient(() => this.client.togglePower());
			return await this.withClient(() => this.client.isOn());
		} catch (error) {
			this.logger.error({ error }, 'Failed to power on frame');
			throw error;
		}
	}

	async powerOff(): Promise<boolean> {
		try {
			if (!(await this.withClient(() => this.client.isOn()))) {
				return true;
			}
			await this.withClient(() => this.client.togglePower());
			return !(await this.withClient(() => this.client.isOn()));
		} catch (error) {
			this.logger.error({ error }, 'Failed to power off frame');
			throw error;
		}
	}

	async uploadBuffer(
		buffer: Buffer,
		options: {
			filename?: string;
			contentType?: string;
			onProgress?: (progress: number) => void;
		} = {},
	): Promise<string> {
		const inferredExtension = (() => {
			if (options.filename) {
				const ext = path.extname(options.filename);
				if (ext) {
					return ext;
				}
			}
			if (options.contentType && options.contentType.includes('/')) {
				const parts = options.contentType.split('/');
				if (parts.length === 2 && parts[1]) {
					return `.${parts[1].toLowerCase()}`;
				}
			}
			return '.jpg';
		})();

		const filename = options.filename && options.filename.trim().length > 0
			? options.filename
			: `frame-upload-${Date.now()}${inferredExtension}`;

		const photo: Photo = {
			id: filename,
			filename,
			dimensions: { width: 0, height: 0 },
			size: buffer.byteLength,
			async download() {
				return buffer;
			},
			async delete() {
				return false;
			},
		};

		try {
			return await this.upload(photo, options.onProgress);
		} catch (error) {
			this.logger.error({ error }, 'Failed to upload art buffer to frame');
			throw error;
		}
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;

		this.logger.info('Initializing Samsung Frame Endpoint...');
		this.logger.info(`Connecting to Samsung Frame at ${this.config.host}...`);
		try {
			await this.client.connect();
			this.initialized = true;
			// Best-effort device info after connection
			try {
				const deviceInfo = await this.client.getDeviceInfo();
				this.logger.info(`Device Info: ${JSON.stringify(deviceInfo, null, 2)}`);
			} catch (infoError) {
				this.logger.warn({ error: this.extractErrorDetails(infoError).message }, 'Failed to retrieve device info during initialization');
			}
			// Try to prime art mode and available art information
			try {
				const artModeInfo = await this.withClient(() => this.client.getArtModeInfo());
				this.logger.info(
					`Art Mode Info: ${JSON.stringify(artModeInfo, null, 2)}`,
				);
				const availableArt = await this.withClient(() => this.client.getAvailableArt());
				this.logger.info(
					`Available Art: ${JSON.stringify(availableArt, null, 2)}`,
				);
				// TODO: Populate this._photos from Frame if possible
				this._photos = [];
			} catch (error) {
				const errorDetails = this.extractErrorDetails(error);
				this.logger.warn(
					`Frame connected but priming calls failed: ${errorDetails.message}`,
				);
			}
		} catch (connectError) {
			const errorDetails = this.extractErrorDetails(connectError);
			this.logger.error(
				`Error initializing Samsung Frame Endpoint (connect): ${errorDetails.message}`,
			);
			this.logger.error(`Initialization error details: ${errorDetails.details}`);
			throw connectError;
		}
	}

	async populatePhotos(): Promise<void> {
		try {
			const availableArt = await this.client.getAvailableArt();
			this._photos = availableArt.map(
				(art) => new FramePhoto(art, this.client),
			);
			this.logger.info(
				`Populated ${this._photos.length} photos from Samsung Frame.`,
			);
		} catch (error) {
			this.logger.error(`Failed to populate photos: ${error.message}`);
		}
	}

	getAvailableArt() {
		return this.withClient(() => this.client.getAvailableArt()).then((art) => {
			this._photos = art.map((a) => new FramePhoto(a, this.client));
			return this._photos;
		});
	}

	async getAvailableArtByCategory(
		category?: string,
		timeout: number = 4,
	): Promise<ArtContentItem[]> {
		try {
			const response = await this.client.request({
				request: 'get_content_list',
				category: category,
			});

			const contentList = JSON.parse(response.content_list);
			return category
				? contentList.filter((v: any) => v.category_id === category)
				: contentList;
		} catch (error) {
			this.logger.error(
				`Failed to get available art by category: ${error.message}`,
			);
			return [];
		}
	}

	getPhotos(): Promise<Photo[]> {
		return Promise.resolve(this._photos);
	}
	async getThumbnail(photoId: string): Promise<Buffer> {
		try {
			this.logger.debug(`Requesting thumbnail for photo ID: ${photoId}`);

			// First, try to check if the art exists in the available art list
			const availableArt = await this.withClient(() => this.client.getAvailableArt());
			const artExists = availableArt.some((art) => art.id === photoId);

			if (!artExists) {
				this.logger.warn(
					`Art with ID ${photoId} not found in available art list`,
				);
				return Buffer.alloc(0);
			}

			// Primary method: socket-based thumbnail retrieval with retry
			const maxRetries = 2;
			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					this.logger.debug(`Thumbnail attempt ${attempt + 1}/${maxRetries} for ${photoId}`);

					const response = await this.withClient(() => this.client.request({
						request: 'get_thumbnail',
						content_id: photoId,
						conn_info: {
							d2d_mode: 'socket',
							connection_id: Math.floor(Math.random() * 4 * 1024 * 1024 * 1024),
							id: this.generateUUID(),
						},
					}));

					this.logger.debug(
						`Got response for thumbnail request: ${JSON.stringify(response)}`,
					);

					if (!response || !response.conn_info) {
						throw new Error('Invalid response: missing conn_info');
					}

					const connInfo = JSON.parse(response.conn_info);
					this.logger.debug(`Connection info: ${JSON.stringify(connInfo)}`);

					const thumbnailData = await this.readThumbnailData(connInfo);

					if (thumbnailData.length > 0) {
						this.logger.debug(
							`Successfully retrieved thumbnail for ${photoId}, size: ${thumbnailData.length} bytes`,
						);
						return thumbnailData;
					}
				} catch (socketError) {
					const errorDetails = this.extractErrorDetails(socketError);

					// Check if this is an abort error and if we should retry
					const isAbortError = errorDetails.message.includes('abort');
					const isLastAttempt = attempt === maxRetries - 1;

					if (isAbortError && !isLastAttempt) {
						this.logger.debug(
							`Thumbnail request aborted for ${photoId}, retrying in ${(attempt + 1) * 1000}ms...`
						);
						// Wait before retry with exponential backoff
						await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
						continue;
					}

					this.logger.warn(
						`Socket-based thumbnail retrieval failed for ${photoId}: ${errorDetails.message}`,
					);
					this.logger.debug(`Error details: ${errorDetails.details}`);
					break;
				}
			}

			// Fallback method: try alternative approach
			const fallbackThumbnail = await this.getThumbnailAlternative(photoId);
			if (fallbackThumbnail.length > 0) {
				this.logger.debug(
					`Successfully retrieved thumbnail using alternative method for ${photoId}`,
				);
				return fallbackThumbnail;
			}

			this.logger.warn(`All thumbnail retrieval methods failed for ${photoId}`);
			return Buffer.alloc(0);
		} catch (error) {
			// Handle Event objects and other error types
			const errorDetails = this.extractErrorDetails(error);
			this.logger.error(
				`Failed to get thumbnail for photo ID ${photoId}: ${errorDetails.message}`,
			);
			this.logger.error(`Error details: ${errorDetails.details}`);
			return Buffer.alloc(0);
		}
	}

	async getThumbnailList(photoIds: string[]): Promise<Buffer[]> {
		try {
			const contentIdList = photoIds.map((id) => ({ content_id: id }));
			const response = await this.withClient(() => this.client.request({
				request: 'get_thumbnail_list',
				content_id_list: contentIdList,
				conn_info: {
					d2d_mode: 'socket',
					connection_id: Math.floor(Math.random() * 4 * 1024 * 1024 * 1024),
					id: this.generateUUID(),
				},
			}));

			const connInfo = JSON.parse(response.conn_info);
			const thumbnails = await this.readThumbnailList(connInfo);

			return thumbnails;
		} catch (error) {
			this.logger.error(`Failed to get thumbnail list: ${error.message}`);
			return [];
		}
	}

	private generateUUID(): string {
		return randomBytes(16).toString('hex');
	}

	/**
	 * Extract error details from various error types including Event objects
	 */
	private extractErrorDetails(error: any): { message: string; details: string; } {
		try {
			// Handle Event objects
			if (error && typeof error === 'object' && error.constructor && error.constructor.name === 'Event') {
				return {
					message: `Event error: ${error.type || 'unknown'}`,
					details: JSON.stringify({
						type: error.type,
						target: error.target?.constructor?.name || 'unknown',
						currentTarget: error.currentTarget?.constructor?.name || 'unknown',
						timeStamp: error.timeStamp,
						eventPhase: error.eventPhase,
						bubbles: error.bubbles,
						cancelable: error.cancelable,
						defaultPrevented: error.defaultPrevented,
					}, null, 2)
				};
			}

			// Handle standard Error objects
			if (error instanceof Error) {
				return {
					message: error.message,
					details: JSON.stringify({
						name: error.name,
						message: error.message,
						stack: error.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
					}, null, 2)
				};
			}

			// Handle other object types
			if (error && typeof error === 'object') {
				return {
					message: error.message || error.toString() || 'Unknown object error',
					details: JSON.stringify(error, null, 2)
				};
			}

			// Handle primitive types
			return {
				message: String(error),
				details: `Type: ${typeof error}, Value: ${String(error)}`
			};
		} catch (extractError) {
			// Fallback if extraction itself fails
			return {
				message: 'Error extraction failed',
				details: `Original error: ${String(error)}, Extraction error: ${String(extractError)}`
			};
		}
	}

	private async readThumbnailData(connInfo: any): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			this.logger.debug(
				`Connecting to ${connInfo.ip}:${connInfo.port} for thumbnail data`,
			);

			const socket = tls.connect(
				{
					host: connInfo.ip,
					port: parseInt(connInfo.port),
					rejectUnauthorized: false,
				},
				async () => {
					try {
						this.logger.debug(
							'TLS connection established, reading thumbnail data',
						);

						// Read header length (4 bytes)
						const headerLenBuffer = await this.readExactly(socket, 4);
						const headerLen = headerLenBuffer.readUInt32BE(0);
						this.logger.debug(`Header length: ${headerLen}`);

						// Read header
						const headerBuffer = await this.readExactly(socket, headerLen);
						const header = JSON.parse(headerBuffer.toString());
						this.logger.debug(`Header: ${JSON.stringify(header)}`);

						// Read thumbnail data
						const thumbnailDataLen = parseInt(header.fileLength);
						this.logger.debug(`Thumbnail data length: ${thumbnailDataLen}`);

						if (thumbnailDataLen <= 0) {
							throw new Error(
								`Invalid thumbnail data length: ${thumbnailDataLen}`,
							);
						}

						const thumbnailData = await this.readExactly(
							socket,
							thumbnailDataLen,
						);

						socket.end();
						this.logger.debug(
							`Successfully read ${thumbnailData.length} bytes of thumbnail data`,
						);
						resolve(thumbnailData);
					} catch (error) {
						socket.end();
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						this.logger.error(`Error reading thumbnail data: ${errorMessage}`);
						reject(error);
					}
				},
			);

			socket.on('error', (error) => {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				this.logger.error(`Socket error: ${errorMessage}`);
				reject(error);
			});

			socket.on('timeout', () => {
				this.logger.error('Socket timeout');
				socket.destroy();
				reject(new Error('Socket timeout'));
			});

			// Set a timeout for the connection
			socket.setTimeout(10000); // 10 seconds
		});
	}

	private async readThumbnailList(connInfo: any): Promise<Buffer[]> {
		return new Promise((resolve, reject) => {
			const socket = tls.connect(
				{
					host: connInfo.ip,
					port: parseInt(connInfo.port),
					rejectUnauthorized: false,
				},
				async () => {
					try {
						const thumbnails: Buffer[] = [];
						let totalNumThumbnails = 1;
						let currentThumb = -1;

						while (currentThumb + 1 < totalNumThumbnails) {
							// Read header length (4 bytes)
							const headerLenBuffer = await this.readExactly(socket, 4);
							const headerLen = headerLenBuffer.readUInt32BE(0);

							// Read header
							const headerBuffer = await this.readExactly(socket, headerLen);
							const header = JSON.parse(headerBuffer.toString());

							// Read thumbnail data
							const thumbnailDataLen = parseInt(header.fileLength);
							const thumbnailData = await this.readExactly(
								socket,
								thumbnailDataLen,
							);

							thumbnails.push(thumbnailData);
							currentThumb = parseInt(header.num);
							totalNumThumbnails = parseInt(header.total);
						}

						socket.end();
						resolve(thumbnails);
					} catch (error) {
						socket.end();
						reject(error);
					}
				},
			);

			socket.on('error', (error) => {
				reject(error);
			});
		});
	}

	private async readExactly(
		socket: tls.TLSSocket,
		length: number,
	): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			if (length <= 0) {
				resolve(Buffer.alloc(0));
				return;
			}

			const chunks: Buffer[] = [];
			let totalLength = 0;
			let timeoutId: NodeJS.Timeout;

			const cleanup = () => {
				socket.off('data', onData);
				socket.off('error', onError);
				socket.off('close', onClose);
				if (timeoutId) clearTimeout(timeoutId);
			};

			const onData = (chunk: Buffer) => {
				chunks.push(chunk);
				totalLength += chunk.length;

				if (totalLength >= length) {
					cleanup();
					const result = Buffer.concat(chunks);
					resolve(result.subarray(0, length));
				}
			};

			const onError = (error: Error) => {
				cleanup();
				reject(error);
			};

			const onClose = () => {
				cleanup();
				if (totalLength < length) {
					reject(
						new Error(
							`Socket closed before reading ${length} bytes (got ${totalLength})`,
						),
					);
				}
			};

			const onTimeout = () => {
				cleanup();
				reject(
					new Error(`Timeout reading ${length} bytes (got ${totalLength})`),
				);
			};

			socket.on('data', onData);
			socket.on('error', onError);
			socket.on('close', onClose);

			// Set a timeout for reading data
			timeoutId = setTimeout(onTimeout, 5000); // 5 seconds
		});
	}

	/**
	 * Uploads a photo to the Samsung Frame with optional progress reporting (T010).
	 *
	 * @param photo - The photo to upload
	 * @param onProgress - Optional callback for upload progress (0-100)
	 * @returns The ID of the uploaded art on the Frame
	 */
	async upload(
		photo: Photo,
		onProgress?: (progress: number) => void,
	): Promise<string> {
		if (photo instanceof FramePhoto) {
			throw new Error('Object is already a FramePhoto, cannot upload again');
		}

		// T010: Report download progress
		if (onProgress) {
			onProgress(10); // Starting download
		}

		const buffer = await photo.download();
		const bufferSize = buffer.byteLength;

		if (onProgress) {
			onProgress(40); // Download complete, preparing upload
		}

		this.logger.debug(
			{ photoId: photo.id, size: bufferSize },
			'Downloaded photo, starting upload',
		);

		const fileType = path.extname(photo?.filename) || '.jpg';

		// T010: Simulate upload progress since samsung-frame-connect doesn't expose it
		// In a real implementation, this would hook into the actual upload stream
		if (onProgress) {
			onProgress(50); // Upload starting
		}

		const uploadPromise = this.withClient(() => this.client.upload(Buffer.from(buffer), { fileType }));

		// Simulate progress during upload (since we can't hook into actual stream)
		const progressInterval = setInterval(() => {
			if (onProgress) {
				// Gradually increase from 50% to 90% during upload
				const currentProgress = 50 + Math.random() * 40;
				onProgress(Math.min(90, currentProgress));
			}
		}, 100);

		try {
			const id = await uploadPromise;

			clearInterval(progressInterval);

			if (onProgress) {
				onProgress(100); // Upload complete
			}

			this.logger.info(
				{ photoId: photo.id, frameArtId: id, size: bufferSize },
				'Photo uploaded successfully to Frame',
			);

			return id;
		} catch (error) {
			clearInterval(progressInterval);

			this.logger.error(
				{ photoId: photo.id, error },
				'Failed to upload photo to Frame',
			);

			throw error;
		}
	}

	async close(): Promise<void> {
		await this.client?.close();
		this.initialized = false;
	}

	get photos(): Promise<Photo[]> {
		// Return FramePhoto[]
		return Promise.resolve(this._photos);
	}

	// Additional art management methods
	async getCurrentArt(): Promise<ArtContentItem | null> {
		try {
			return await this.withClient(() => this.client.getCurrentArt());
		} catch (error) {
			this.logger.error(`Failed to get current art: ${error.message}`);
			return null;
		}
	}

	async setCurrentArt(artId: string, category?: string): Promise<boolean> {
		try {
			await this.client.setCurrentArt({ id: artId, category });
			return true;
		} catch (error) {
			this.logger.error(`Failed to set current art: ${error.message}`);
			return false;
		}
	}

	async deleteArt(artIds: string | string[]): Promise<boolean> {
		try {
			await this.client.deleteArt(artIds);
			return true;
		} catch (error) {
			this.logger.error(`Failed to delete art: ${error.message}`);
			return false;
		}
	}

	async getBrightness(): Promise<number> {
		try {
			return await this.withClient(() => this.client.getBrightness());
		} catch (error) {
			this.logger.error(`Failed to get brightness: ${error.message}`);
			return 0;
		}
	}

	async setBrightness(value: number): Promise<boolean> {
		try {
			await this.client.setBrightness(value);
			return true;
		} catch (error) {
			this.logger.error(`Failed to set brightness: ${error.message}`);
			return false;
		}
	}

	async inArtMode(): Promise<boolean> {
		try {
			return await this.withClient(() => this.client.inArtMode());
		} catch (error) {
			this.logger.error(`Failed to check art mode: ${error.message}`);
			return false;
		}
	}

	async getMatteColors(): Promise<string[]> {
		try {
			return await this.client.getMatteColors();
		} catch (error) {
			this.logger.error(`Failed to get matte colors: ${error.message}`);
			return [];
		}
	}

	async getMatteTypes(): Promise<string[]> {
		try {
			return await this.client.getMatteTypes();
		} catch (error) {
			this.logger.error(`Failed to get matte types: ${error.message}`);
			return [];
		}
	}

	async setMatte(artId: string, type: string, color: string): Promise<boolean> {
		try {
			await this.client.setMatte({ id: artId, type, color });
			return true;
		} catch (error) {
			this.logger.error(`Failed to set matte: ${error.message}`);
			return false;
		}
	}

	// Additional art management methods based on Python reference
	async setFavourite(
		contentId: string,
		status: 'on' | 'off' = 'on',
	): Promise<boolean> {
		try {
			await this.client.request({
				request: 'change_favorite',
				content_id: contentId,
				status: status,
			});
			return true;
		} catch (error) {
			this.logger.error(`Failed to set favourite: ${error.message}`);
			return false;
		}
	}

	async getArtModeSettings(setting?: string): Promise<any> {
		try {
			const response = await this.client.request({
				request: 'get_artmode_settings',
			});
			const data = JSON.parse(response.data);
			return setting
				? data.find((item: any) => item.item === setting) || data
				: data;
		} catch (error) {
			this.logger.error(`Failed to get art mode settings: ${error.message}`);
			return null;
		}
	}

	async getAutoRotationStatus(): Promise<any> {
		try {
			return await this.client.request({
				request: 'get_auto_rotation_status',
			});
		} catch (error) {
			this.logger.error(`Failed to get auto rotation status: ${error.message}`);
			return null;
		}
	}

	async setAutoRotationStatus(
		duration: number = 0,
		type: boolean = true,
		category: number = 2,
	): Promise<boolean> {
		try {
			await this.client.request({
				request: 'set_auto_rotation_status',
				value: duration > 0 ? duration.toString() : 'off',
				category_id: `MY-C000${category}`,
				type: type ? 'shuffleslideshow' : 'slideshow',
			});
			return true;
		} catch (error) {
			this.logger.error(`Failed to set auto rotation status: ${error.message}`);
			return false;
		}
	}

	async getSlideshowStatus(): Promise<any> {
		try {
			return await this.client.request({
				request: 'get_slideshow_status',
			});
		} catch (error) {
			this.logger.error(`Failed to get slideshow status: ${error.message}`);
			return null;
		}
	}

	async setSlideshowStatus(
		duration: number = 0,
		type: boolean = true,
		category: number = 2,
	): Promise<boolean> {
		try {
			await this.client.request({
				request: 'set_slideshow_status',
				value: duration > 0 ? duration.toString() : 'off',
				category_id: `MY-C000${category}`,
				type: type ? 'shuffleslideshow' : 'slideshow',
			});
			return true;
		} catch (error) {
			this.logger.error(`Failed to set slideshow status: ${error.message}`);
			return false;
		}
	}

	async getColorTemperature(): Promise<any> {
		try {
			let response = await this.client.request({
				request: 'get_color_temperature',
			});
			if (!response) {
				response = await this.getArtModeSettings('color_temperature');
			}
			return response;
		} catch (error) {
			this.logger.error(`Failed to get color temperature: ${error.message}`);
			return null;
		}
	}

	async setColorTemperature(value: number): Promise<boolean> {
		try {
			await this.client.request({
				request: 'set_color_temperature',
				value: value,
			});
			return true;
		} catch (error) {
			this.logger.error(`Failed to set color temperature: ${error.message}`);
			return false;
		}
	}

	async getCurrentRotation(): Promise<number> {
		try {
			const response = await this.client.request({
				request: 'get_current_rotation',
			});
			return response.current_rotation_status || 0;
		} catch (error) {
			this.logger.error(`Failed to get current rotation: ${error.message}`);
			return 0;
		}
	}

	async getPhotoFilterList(): Promise<any[]> {
		try {
			const response = await this.client.request({
				request: 'get_photo_filter_list',
			});
			return JSON.parse(response.filter_list);
		} catch (error) {
			this.logger.error(`Failed to get photo filter list: ${error.message}`);
			return [];
		}
	}

	async setPhotoFilter(contentId: string, filterId: string): Promise<boolean> {
		try {
			await this.client.request({
				request: 'set_photo_filter',
				content_id: contentId,
				filter_id: filterId,
			});
			return true;
		} catch (error) {
			this.logger.error(`Failed to set photo filter: ${error.message}`);
			return false;
		}
	}

	async getMatteList(includeColor: boolean = false): Promise<any> {
		try {
			const response = await this.client.request({
				request: 'get_matte_list',
			});
			const matteTypes = JSON.parse(response.matte_type_list);
			if (includeColor) {
				const matteColors = JSON.parse(response.matte_color_list || '[]');
				return { types: matteTypes, colors: matteColors };
			}
			return matteTypes;
		} catch (error) {
			this.logger.error(`Failed to get matte list: ${error.message}`);
			return includeColor ? { types: [], colors: [] } : [];
		}
	}

	async changeMatte(
		contentId: string,
		matteId?: string,
		portraitMatte?: string,
	): Promise<boolean> {
		try {
			const request: any = {
				request: 'change_matte',
				content_id: contentId,
				matte_id: matteId || 'none',
			};

			if (portraitMatte) {
				request.portrait_matte_id = portraitMatte;
			}

			await this.client.request(request);
			return true;
		} catch (error) {
			this.logger.error(`Failed to change matte: ${error.message}`);
			return false;
		}
	}

	async selectImage(
		contentId: string,
		category?: string,
		show: boolean = true,
	): Promise<boolean> {
		try {
			await this.client.request({
				request: 'select_image',
				category_id: category,
				content_id: contentId,
				show: show,
			});
			return true;
		} catch (error) {
			this.logger.error(`Failed to select image: ${error.message}`);
			return false;
		}
	}

	async getArtModeStatus(): Promise<string> {
		try {
			const response = await this.client.request({
				request: 'get_artmode_status',
			});
			return response.value;
		} catch (error) {
			this.logger.error(`Failed to get art mode status: ${error.message}`);
			return 'off';
		}
	}

	async setArtModeStatus(mode: 'on' | 'off'): Promise<boolean> {
		try {
			await this.client.request({
				request: 'set_artmode_status',
				value: mode,
			});
			return true;
		} catch (error) {
			this.logger.error(`Failed to set art mode status: ${error.message}`);
			return false;
		}
	}

	async getRawAvailableArt(): Promise<ArtContentItem[]> {
		try {
			return await this.client.getAvailableArt();
		} catch (error) {
			this.logger.error(`Failed to get raw available art: ${error.message}`);
			return [];
		}
	}

	/**
	 * Fallback method to get basic art information without thumbnails
	 * Useful when thumbnail retrieval fails
	 */
	async getArtInfo(photoId: string): Promise<any> {
		try {
			const response = await this.client.request({
				request: 'get_artmode_status',
			});

			// Get current art and check if it matches the requested ID
			const currentArt = await this.getCurrentArt();
			if (currentArt && currentArt.id === photoId) {
				return {

					isCurrent: true,
					...currentArt,
					id: photoId
				};
			}

			return { id: photoId, isCurrent: false };
		} catch (error) {
			this.logger.error(
				`Failed to get art info for ${photoId}: ${error.message}`,
			);
			return { id: photoId, isCurrent: false };
		}
	}

	/**
	 * Alternative thumbnail method that might work better for some Frame models
	 */
	async getThumbnailAlternative(photoId: string): Promise<Buffer> {
		try {
			// Try using a different approach - get content directly
			const response = await this.client.request({
				request: 'get_content',
				content_id: photoId,
				// Request a smaller version/thumbnail
				version: 'thumb',
			});

			if (response && response.content) {
				// If the response contains base64 data
				if (typeof response.content === 'string') {
					return Buffer.from(response.content, 'base64');
				}
			}

			return Buffer.alloc(0);
		} catch (error) {
			this.logger.debug(
				`Alternative thumbnail method failed for ${photoId}: ${error.message}`,
			);
			return Buffer.alloc(0);
		}
	}
}
