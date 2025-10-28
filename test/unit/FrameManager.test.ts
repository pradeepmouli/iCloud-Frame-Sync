import type { Logger } from 'pino';
import {
	FrameManager,
	type FrameConnectionProbeResult,
	type FrameHeartbeatSnapshot,
} from '../../src/services/FrameManager.js';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

describe('FrameManager', () => {
	let frameManager: FrameManager;
	let mockLogger: sinon.SinonStubbedInstance<Logger>;
	let mockSamsungFrameClient: any;
	const config = {
		host: '192.168.1.100',
		name: 'TestTV',
		services: ['art-mode', 'device'],
		verbosity: 1,
	};

	beforeEach(() => {
		mockLogger = {
			info: sinon.stub(),
			error: sinon.stub(),
			debug: sinon.stub(),
			trace: sinon.stub(),
			warn: sinon.stub(),
		} as any;

		mockSamsungFrameClient = {
			getDeviceInfo: sinon.stub(),
			isOn: sinon.stub(),
			togglePower: sinon.stub(),
			connect: sinon.stub(),
			inArtMode: sinon.stub(),
			getArtModeInfo: sinon.stub(),
			upload: sinon.stub(),
			close: sinon.stub(),
		};

		frameManager = new FrameManager(
			config as any,
			mockLogger as any,
			{
				autoStartHeartbeat: false,
				clientFactory: () => mockSamsungFrameClient,
			},
		);
	});

	describe('constructor', () => {
		it('should create a FrameManager instance', () => {
			expect(frameManager).to.be.instanceOf(FrameManager);
		});
	});

	describe('initialize', () => {
		it('should initialize frame when device is already on', async () => {
			const deviceInfo = { model: 'Samsung Frame', version: '1.0' };
			const artModeInfo = { currentArt: 'art1' };

			mockSamsungFrameClient.getDeviceInfo.resolves(deviceInfo);
			mockSamsungFrameClient.isOn.resolves(true);
			mockSamsungFrameClient.connect.resolves();
			mockSamsungFrameClient.inArtMode.resolves(true);
			mockSamsungFrameClient.getArtModeInfo.resolves(artModeInfo);
			await frameManager.initialize();

			expect(mockSamsungFrameClient.getDeviceInfo.calledOnce).to.be.true;
			expect(mockSamsungFrameClient.isOn.calledOnce).to.be.true;
			expect(mockSamsungFrameClient.togglePower.called).to.be.false;
			expect(mockSamsungFrameClient.connect.calledOnce).to.be.true;
			expect(mockSamsungFrameClient.inArtMode.calledOnce).to.be.true;
			expect(mockSamsungFrameClient.getArtModeInfo.calledOnce).to.be.true;

			expect(
				mockLogger.info.calledWithMatch({ host: config.host }, 'Initializing frame manager'),
			).to.be.true;
		});

		it('should turn on device when it is off', async () => {
			mockSamsungFrameClient.getDeviceInfo.rejects(new Error('offline'));

			const result = await frameManager.ensureReachable();

			expect(result.success).to.be.false;
			expect(mockSamsungFrameClient.togglePower.called).to.be.false;
		});
	});

	describe('ensureReachable', () => {
		it('returns success payload when frame responds', async () => {
			const deviceInfo = { model: 'Samsung Frame', version: '1.0' };
			const artModeInfo = { currentArt: 'art1' };

			mockSamsungFrameClient.getDeviceInfo.resolves(deviceInfo);
			mockSamsungFrameClient.isOn.resolves(true);
			mockSamsungFrameClient.inArtMode.resolves(false);
			mockSamsungFrameClient.getArtModeInfo.resolves(artModeInfo);

			const result = await frameManager.ensureReachable();

			expect(result.success).to.be.true;
			expect(result.deviceInfo).to.equal(deviceInfo);
			expect(result.artModeInfo).to.equal(artModeInfo);
			expect(result.isOn).to.be.true;
			expect(result.inArtMode).to.be.false;

			const snapshot = frameManager.getHeartbeatSnapshot() as FrameHeartbeatSnapshot;
			expect(snapshot).to.not.be.null;
			expect(snapshot.isReachable).to.be.true;
			expect(snapshot.isOn).to.be.true;
		});

		it('captures error details when frame is unreachable', async () => {
			const error = new Error('timeout');
			mockSamsungFrameClient.getDeviceInfo.rejects(error);
			mockSamsungFrameClient.isOn.resolves(false);
			mockSamsungFrameClient.inArtMode.resolves(false);
			mockSamsungFrameClient.getArtModeInfo.resolves(undefined);

			const result = await frameManager.ensureReachable();

			expect(result.success).to.be.false;
			expect(result.error).to.equal('timeout');
			expect(mockLogger.warn.called).to.be.true;

			const snapshot = frameManager.getHeartbeatSnapshot() as FrameHeartbeatSnapshot;
			expect(snapshot).to.not.be.null;
			expect(snapshot.isReachable).to.be.false;
			expect(snapshot.error).to.equal('timeout');
		});
	});

	describe('heartbeat', () => {
		it('reuses ensureReachable results', async () => {
			mockSamsungFrameClient.getDeviceInfo.resolves({});
			mockSamsungFrameClient.isOn.resolves(true);
			mockSamsungFrameClient.inArtMode.resolves(true);
			mockSamsungFrameClient.getArtModeInfo.resolves({});

			await frameManager.ensureReachable();
			const snapshot = await frameManager.heartbeat();

			expect(snapshot.lastCheckedAt).to.be.a('number');
			expect(mockSamsungFrameClient.getDeviceInfo.callCount).to.equal(2);
		});
	});

	describe('isOn', () => {
		it('should return device on status', async () => {
			mockSamsungFrameClient.isOn.resolves(true);

			const result = await frameManager.isOn();

			expect(result).to.be.true;
			expect(mockSamsungFrameClient.isOn.calledOnce).to.be.true;
		});
	});

	describe('togglePower', () => {
		it('should toggle device power', async () => {
			mockSamsungFrameClient.togglePower.resolves();

			await frameManager.togglePower();

			expect(mockSamsungFrameClient.togglePower.calledOnce).to.be.true;
		});
	});

	describe('inArtMode', () => {
		it('should return art mode status', async () => {
			mockSamsungFrameClient.inArtMode.resolves(true);

			const result = await frameManager.inArtMode();

			expect(result).to.be.true;
			expect(mockSamsungFrameClient.inArtMode.calledOnce).to.be.true;
		});
	});

	describe('getDeviceInfo', () => {
		it('should return device information', async () => {
			const deviceInfo = { model: 'Samsung Frame', version: '1.0' };
			mockSamsungFrameClient.getDeviceInfo.resolves(deviceInfo);

			const result = await frameManager.getDeviceInfo();

			expect(result).to.deep.equal(deviceInfo);
			expect(mockSamsungFrameClient.getDeviceInfo.calledOnce).to.be.true;
		});
	});

	describe('getArtModeInfo', () => {
		it('should return art mode information', async () => {
			const artModeInfo = { currentArt: 'art1', brightness: 50 };
			mockSamsungFrameClient.getArtModeInfo.resolves(artModeInfo);

			const result = await frameManager.getArtModeInfo();

			expect(result).to.deep.equal(artModeInfo);
			expect(mockSamsungFrameClient.getArtModeInfo.calledOnce).to.be.true;
		});
	});

	describe('upload', () => {
		it('should upload image buffer', async () => {
			const buffer = Buffer.from([1, 2, 3, 4]);
			const options = { fileType: '.jpg' };
			const uploadId = 'upload-123';

			mockSamsungFrameClient.upload.resolves(uploadId);

			const result = await frameManager.upload(buffer, options);

			expect(result).to.equal(uploadId);
			expect(mockSamsungFrameClient.upload.calledWith(buffer, options)).to.be
				.true;
		});
	});

	describe('close', () => {
		it('should close frame client connection', async () => {
			mockSamsungFrameClient.close.resolves();

			await frameManager.close();

			expect(mockSamsungFrameClient.close.calledOnce).to.be.true;
		});
	});

	describe('getClient', () => {
		it('should return the Samsung Frame client', () => {
			const client = frameManager.getClient();

			expect(client).to.equal(mockSamsungFrameClient);
		});
	});
});
