import type { Logger } from 'pino';

export interface ICloudConnectionTestRequest {
	username: string;
	password?: string;
	sessionId?: string;
	mfaCode?: string;
	forceRefresh?: boolean;
	logger?: Logger;
}

export interface FrameConnectionTestRequest {
	host: string;
	name?: string;
	services?: string[];
	verbosity?: number;
}

export interface ConnectionTestResult {
	success: boolean;
	status?: string;
	requiresMfa?: boolean;
	sessionId?: string;
	message?: string;
	error?: string;
	[key: string]: unknown;
}

export interface ConnectionTester {
	testICloudConnection: (
		request: ICloudConnectionTestRequest,
	) => Promise<ConnectionTestResult>;
	testFrameConnection: (
		request: FrameConnectionTestRequest,
	) => Promise<ConnectionTestResult>;
}

export interface ConnectionTestResponse {
	overall: 'ready' | 'attention';
	icloud: ConnectionTestResult;
	frame: ConnectionTestResult;
}
