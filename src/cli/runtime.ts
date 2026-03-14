import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RuntimeMetadata {
	pid: number;
	startedAt: string;
	mode?: 'mock' | 'service';
}

const runtimeDir = join(homedir(), '.icloud-frame-sync');
const runtimePath = join(runtimeDir, 'runtime.json');

function isErrnoException(error: unknown): error is { code?: string } {
	if (!error || typeof error !== 'object') {
		return false;
	}
	return 'code' in error;
}

export function isProcessActive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (isErrnoException(error)) {
			if (error.code === 'ESRCH') {
				return false;
			}
			if (error.code === 'EPERM') {
				return true;
			}
		}
		return false;
	}
}

export async function readRuntime(): Promise<RuntimeMetadata | null> {
	try {
		const content = await readFile(runtimePath, 'utf8');
		const data = JSON.parse(content) as RuntimeMetadata;
		if (!Number.isInteger(data.pid)) {
			return null;
		}
		return data;
	} catch (error) {
		if (isErrnoException(error) && error.code === 'ENOENT') {
			return null;
		}
		throw error;
	}
}

export async function writeRuntime(metadata: RuntimeMetadata): Promise<void> {
	await mkdir(runtimeDir, { recursive: true });
	await writeFile(runtimePath, JSON.stringify(metadata, null, 2), 'utf8');
}

export async function clearRuntime(): Promise<void> {
	try {
		await unlink(runtimePath);
	} catch (error) {
		if (!isErrnoException(error) || error.code !== 'ENOENT') {
			throw error;
		}
	}
}

export async function getActiveRuntime(): Promise<RuntimeMetadata | null> {
	const runtime = await readRuntime();
	if (!runtime) {
		return null;
	}

	if (runtime.mode === 'mock' || runtime.pid <= 0) {
		return runtime;
	}

	if (isProcessActive(runtime.pid)) {
		return runtime;
	}

	await clearRuntime();
	return null;
}

export function getRuntimePath(): string {
	return runtimePath;
}
