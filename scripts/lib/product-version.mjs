import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))

export const PRODUCT_VERSION = packageJson.version
