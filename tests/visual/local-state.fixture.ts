import { test as base, expect } from '@playwright/test'

// Playwright creates a fresh BrowserContext for every test, so origin storage is
// already isolated. Clearing IndexedDB after the app mounts races autosave and
// adds a redundant navigation to every visual test.
export const test = base

export { expect }
