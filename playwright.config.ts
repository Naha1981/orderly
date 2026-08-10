import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  use: { 
    baseURL: BASE_URL, 
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
