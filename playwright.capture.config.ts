import base from './playwright.config'
import { defineConfig } from '@playwright/test'

/** Same settings, but runs the capture specs the default config excludes. */
export default defineConfig({ ...base, testMatch: '**/*.capture.ts' })
