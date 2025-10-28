import { Buffer } from 'node:buffer';
import '../helpers/setup.js';
import { expect, sinon } from '../helpers/setup.js';

import { FrameDashboardService } from '../../src/services/FrameDashboardService.js';
import type { FrameEndpoint } from '../../src/services/FrameEndpoint.js';
import type { SyncStateStore } from '../../src/services/SyncStateStore.js';

function createLoggerStub(sandbox: sinon.SinonSandbox) {
	const logger = {
		info: sandbox.stub(),
		debug: sandbox.stub(),
		warn: sandbox.stub(),
		error: sandbox.stub(),
		child: sandbox.stub(),
	} as unknown as sinon.SinonStubbedInstance<any>;
	(logger.child as sinon.SinonStub).returns(logger);
	return logger;
}

describe('FrameDashboardService', () => {
	let sandbox: sinon.SinonSandbox;
	let frameEndpoint: sinon.SinonStubbedInstance<FrameEndpoint> & FrameEndpoint;
	let stateStore: sinon.SinonStubbedInstance<SyncStateStore> & SyncStateStore;
	let service: FrameDashboardService;

	beforeEach(() => {
		sandbox = sinon.createSandbox();

		frameEndpoint = {
			getHost: sandbox.stub().returns('frame.local'),
			getDeviceInfo: sandbox.stub().resolves({ name: 'Samsung Frame', model: 'LS03' }),
			isOn: sandbox.stub().resolves(true),
			inArtMode: sandbox.stub().resolves(true),
			getBrightness: sandbox.stub().resolves(45),
			getCurrentArt: sandbox.stub().resolves({
				id: 'art-1',
				name: 'Sunrise',
				category_id: 'MY-C0001',
				width: 3840,
				height: 2160,
				favorite: true,
			}),
			getAvailableArt: sandbox.stub().resolves([
				{
					id: 'art-1',
					name: 'Sunrise',
					category_id: 'MY-C0001',
					width: 3840,
					height: 2160,
					favorite: true,
				},
				{
					id: 'art-2',
					name: 'Mountains',
					category_id: 'MY-C0002',
					width: 2880,
					height: 1800,
				},
			]),
			uploadBuffer: sandbox.stub().resolves('art-99'),
			setCurrentArt: sandbox.stub().resolves(true),
			deleteArt: sandbox.stub().resolves(true),
			getThumbnail: sandbox.stub().resolves(Buffer.from([0xff, 0xd8, 0xff])),
			powerOn: sandbox.stub().resolves(true),
			powerOff: sandbox.stub().resolves(true),
			togglePower: sandbox.stub().resolves(true),
		} as unknown as sinon.SinonStubbedInstance<FrameEndpoint> & FrameEndpoint;

		stateStore = {
			update: sandbox.stub().resolves(),
		} as unknown as sinon.SinonStubbedInstance<SyncStateStore> & SyncStateStore;

		const logger = createLoggerStub(sandbox);

		service = new FrameDashboardService(frameEndpoint, stateStore, logger);
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('returns frame status snapshot with device details', async () => {
		const snapshot = await service.getStatusSnapshot();

		expect(snapshot.host).to.equal('frame.local');
		expect(snapshot.isOn).to.be.true;
		expect(snapshot.inArtMode).to.be.true;
		expect(snapshot.currentArt?.id).to.equal('art-1');
		expect(stateStore.update.calledOnce).to.be.true;
	});

	it('powers on the frame only when off', async () => {
		(frameEndpoint.isOn as sinon.SinonStub).onFirstCall().resolves(false).onSecondCall().resolves(true);

		const response = await service.setPowerState('on');

		expect(frameEndpoint.powerOn.calledOnce).to.be.true;
		expect(frameEndpoint.togglePower.called).to.be.false;
		expect(response.isOn).to.be.true;
		expect(response.wasToggled).to.be.true;
	});

	it('lists art with pagination and filtering support', async () => {
		const page = await service.listArt({ page: 1, pageSize: 1, categoryId: 'MY-C0001' });

		expect(frameEndpoint.getAvailableArt.calledOnce).to.be.true;
		expect(page.pagination.total).to.equal(1);
		expect(page.items[0]?.id).to.equal('art-1');
	});

	it('uploads art from base64 payload and optionally sets current art', async () => {
		const payload = Buffer.from('sample');
		const base64 = payload.toString('base64');

		await service.uploadArt({ filename: 'sample.jpg', data: base64, setAsCurrent: true });

		expect(frameEndpoint.uploadBuffer.calledOnce).to.be.true;
		expect((frameEndpoint.uploadBuffer as sinon.SinonStub).firstCall.args[0]).to.be.instanceOf(Buffer);
		expect(frameEndpoint.setCurrentArt.calledOnceWithExactly('art-99')).to.be.true;
	});

	it('deletes art assets via the frame endpoint', async () => {
		const result = await service.deleteArt('art-1');
		expect(result).to.be.true;
		expect(frameEndpoint.deleteArt.calledOnceWithExactly('art-1')).to.be.true;
	});
});
