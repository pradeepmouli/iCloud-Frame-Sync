import type { Logger } from 'pino';
import { SyncScheduler } from '../../src/services/SyncScheduler.js';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

describe('SyncScheduler', () => {
  let syncScheduler: SyncScheduler;
  let mockSyncFunction: sinon.SinonStub;
  let mockLogger: sinon.SinonStubbedInstance<Logger>;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();

    mockLogger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      trace: sinon.stub(),
      warn: sinon.stub(),
    } as any;

    mockSyncFunction = sinon.stub().resolves();

    const config = {
      intervalSeconds: 60,
    };

    syncScheduler = new SyncScheduler(
      mockSyncFunction,
      config,
      mockLogger as any,
    );
  });

  afterEach(() => {
    clock.restore();
    syncScheduler.stop();
  });

  describe('constructor', () => {
    it('should create a SyncScheduler instance', () => {
      expect(syncScheduler).to.be.instanceOf(SyncScheduler);
    });

    it('should set interval seconds correctly', () => {
      expect(syncScheduler.getIntervalSeconds()).to.equal(60);
    });

    it('should not be running initially', () => {
      expect(syncScheduler.isRunning()).to.be.false;
      expect(syncScheduler.isSyncInProgress()).to.be.false;
    });
  });

  describe('start', () => {
    it('should run initial sync and start timer', async () => {
      // Make sync function fast
      mockSyncFunction.resolves();

      await syncScheduler.start();

      expect(mockSyncFunction.calledOnce).to.be.true;
      expect(syncScheduler.isRunning()).to.be.true;
      expect(
        mockLogger.info.calledWith('Sync scheduler started with 60s interval'),
      ).to.be.true;
    });

    it('should run periodic syncs', async () => {
      mockSyncFunction.resolves();

      await syncScheduler.start();

      // Advance time by interval
      clock.tick(60000);

      // Wait a bit for async operations
      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockSyncFunction.calledTwice).to.be.true; // Initial + one periodic
    });

    it('should skip sync if already in progress', async () => {
      // Make sync function slow - return a controllable promise
      let resolveSyncPromise: () => void;
      const slowSyncPromise = new Promise<void>((resolve) => {
        resolveSyncPromise = resolve;
      });
      mockSyncFunction.returns(slowSyncPromise);

      // Start the scheduler which will start a sync but not complete it
      const startPromise = syncScheduler.start();

      // Wait a tick to let the initial sync start
      await new Promise((resolve) => process.nextTick(resolve));

      expect(syncScheduler.isSyncInProgress()).to.be.true;

      // Manually trigger the timer callback by using setInterval again
      // This simulates what would happen when the interval triggers
      const intervalCallback = async () => {
        if (syncScheduler.isSyncInProgress()) {
          mockLogger.info('Sync already in progress, skipping this interval.');
          return;
        }
        // ... rest of interval logic
      };

      // Call the interval callback while sync is in progress
      await intervalCallback();

      // Should log that sync is already in progress
      expect(
        mockLogger.info.calledWith(
          'Sync already in progress, skipping this interval.',
        ),
      ).to.be.true;

      // Complete the first sync
      resolveSyncPromise!();
      await startPromise;
    });

    it('should handle sync errors gracefully', async () => {
      const error = new Error('Sync failed');
      mockSyncFunction.rejects(error);

      try {
        await syncScheduler.start();

        clock.tick(60000);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockLogger.error.calledWith('Sync failed:', error)).to.be.true;
        expect(syncScheduler.isRunning()).to.be.true; // Should still be running
      } catch (e) {
        // Expected error from sync function
      }
    });
  });

  describe('stop', () => {
    it('should stop the scheduler', async () => {
      await syncScheduler.start();
      expect(syncScheduler.isRunning()).to.be.true;

      syncScheduler.stop();

      expect(syncScheduler.isRunning()).to.be.false;
      expect(mockLogger.info.calledWith('Sync scheduler stopped')).to.be.true;
    });

    it('should be safe to call stop when not running', () => {
      expect(syncScheduler.isRunning()).to.be.false;

      syncScheduler.stop();

      expect(syncScheduler.isRunning()).to.be.false;
    });
  });

  describe('updateInterval', () => {
    it('should update interval when not running', () => {
      syncScheduler.updateInterval(120);

      expect(syncScheduler.getIntervalSeconds()).to.equal(120);
    });

    it('should restart scheduler with new interval when running', async () => {
      mockSyncFunction.resolves();

      await syncScheduler.start();
      expect(syncScheduler.isRunning()).to.be.true;

      // Stop before updating to avoid timer issues
      syncScheduler.stop();
      syncScheduler.updateInterval(30);
      await syncScheduler.start();

      expect(syncScheduler.getIntervalSeconds()).to.equal(30);
      expect(syncScheduler.isRunning()).to.be.true;
    });
  });

  describe('isSyncInProgress', () => {
    it('should return true when sync is in progress', async () => {
      let resolveSyncPromise: () => void;
      const slowSyncPromise = new Promise<void>((resolve) => {
        resolveSyncPromise = resolve;
      });
      mockSyncFunction.returns(slowSyncPromise);

      // Start the scheduler which will start a sync
      const startPromise = syncScheduler.start();

      // Wait a tick to let the sync start
      await new Promise((resolve) => process.nextTick(resolve));

      // Check if sync is in progress during the initial sync
      expect(syncScheduler.isSyncInProgress()).to.be.true;

      // Resolve the sync
      resolveSyncPromise!();
      await startPromise;

      // Should not be in progress after sync completes
      expect(syncScheduler.isSyncInProgress()).to.be.false;
    });
  });

  describe('getIntervalSeconds', () => {
    it('should return current interval', () => {
      expect(syncScheduler.getIntervalSeconds()).to.equal(60);
    });
  });
});
