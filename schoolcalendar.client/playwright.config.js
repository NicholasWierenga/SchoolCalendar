import { defineConfig } from '@playwright/test'
import process from 'node:process'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60_000,
  use: {
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    viewport: { width: 1200, height: 950 },
    trace: 'retain-on-failure',
  },
})
