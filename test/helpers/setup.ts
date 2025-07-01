import { config } from '@dotenvx/dotenvx';
import { expect } from 'chai';
import sinon from 'sinon';

// Load test environment variables
config({ path: '.env.test' });

// Global test helpers
export { expect, sinon };

// Clean up after each test
afterEach(() => {
  sinon.restore();
});

// Test environment setup
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
