import type { Logger } from 'pino';
import { FrameManager } from '../../src/services/FrameManager.js';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

describe('FrameManager', () => {
  let frameManager: FrameManager;
  let mockLogger: sinon.SinonStubbedInstance<Logger>;
  let mockSamsungFrameClient: any;

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
      getAvailableArt: sinon.stub(),
      upload: sinon.stub(),
      close: sinon.stub(),
    };

    // Mock SamsungFrameClient constructor
    const SamsungFrameClientMock = sinon.stub().returns(mockSamsungFrameClient);

    const config = {
      host: '192.168.1.100',
      name: 'TestTV',
      services: ['art-mode', 'device'],
      verbosity: 1,
    };

    frameManager = new FrameManager(config, mockLogger as any);
    // Replace the client with our mock
    frameManager['client'] = mockSamsungFrameClient;
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
      mockSamsungFrameClient.getAvailableArt.resolves();

      await frameManager.initialize();

      expect(mockSamsungFrameClient.getDeviceInfo.calledOnce).to.be.true;
      expect(mockSamsungFrameClient.isOn.calledOnce).to.be.true;
      expect(mockSamsungFrameClient.togglePower.called).to.be.false;
      expect(mockSamsungFrameClient.connect.calledOnce).to.be.true;
      expect(mockSamsungFrameClient.inArtMode.calledOnce).to.be.true;
      expect(mockSamsungFrameClient.getArtModeInfo.calledOnce).to.be.true;
      expect(mockSamsungFrameClient.getAvailableArt.calledOnce).to.be.true;

      expect(
        mockLogger.info.calledWith(
          `Device Info: ${JSON.stringify(deviceInfo, null, 2)}`,
        ),
      ).to.be.true;
      expect(mockLogger.info.calledWith('Is On: true')).to.be.true;
      expect(mockLogger.info.calledWith('In Art Mode: true')).to.be.true;
    });

    it('should turn on device when it is off', async () => {
      const deviceInfo = { model: 'Samsung Frame', version: '1.0' };

      mockSamsungFrameClient.getDeviceInfo.resolves(deviceInfo);
      mockSamsungFrameClient.isOn.resolves(false);
      mockSamsungFrameClient.togglePower.resolves();
      mockSamsungFrameClient.connect.resolves();
      mockSamsungFrameClient.inArtMode.resolves(false);
      mockSamsungFrameClient.getArtModeInfo.resolves({});
      mockSamsungFrameClient.getAvailableArt.resolves();

      await frameManager.initialize();

      expect(mockSamsungFrameClient.togglePower.calledOnce).to.be.true;
      expect(mockLogger.info.calledWith('Device is off, turning it on...')).to
        .be.true;
      expect(mockLogger.info.calledWith('Device is on')).to.be.true;
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
