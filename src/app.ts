import { Application, createAppConfigFromEnv } from './Application.js';

async function main() {
  try {
    const config = createAppConfigFromEnv();
    const app = new Application(config);
    await app.start();
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

main();
