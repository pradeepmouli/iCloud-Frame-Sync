#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(currentDir, '..');
const distEntrypoint = resolve(rootDir, 'dist/cli/commands.js');
if (!existsSync(distEntrypoint)) {
	console.error('iCloud Frame Sync CLI has not been built. Run `pnpm run build` before executing the CLI.');
	process.exit(1);
}

const moduleUrl = pathToFileURL(distEntrypoint).href;
const { runCli } = await import(moduleUrl);

await runCli(process.argv);
