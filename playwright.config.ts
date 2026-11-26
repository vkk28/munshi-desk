import { defineConfig, devices } from '@playwright/test'

const externalURL = process.env.MUNSHI_TEST_URL

export default defineConfig({
  testDir: './tests/browser',
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: externalURL || 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalURL ? undefined : {
    command: 'npm run preview -w web -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
