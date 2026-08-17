import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ServiceProvider } from '@/services/context'
import type { ServiceRegistry } from '@/services/types'
import { GameAssetProductionPanel } from './GameAssetProductionPanel'

const inertRegistry = {} as ServiceRegistry

describe('Game Map Workbench projection', () => {
  let container: HTMLDivElement
  let root: Root

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterAll(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('decodes local planning references into a canvas instead of a DOM URL source', () => {
    const source = readFileSync('src/components/design-os-workbench/GameMapProductionPanel.tsx', 'utf8')
    expect(source).toContain('createImageBitmap(referenceFile)')
    expect(source).toContain('<canvas ref={referenceCanvasRef}')
    expect(source).not.toContain('URL.createObjectURL(referenceFile)')
    expect(source).not.toContain('<img src={referenceUrl}')
  })

  it('opens an inferred map brief in the shared Game lane without a mode selector', async () => {
    await act(async () => {
      root.render(
        <ServiceProvider registry={inertRegistry}>
          <GameAssetProductionPanel launch={{
            intent: {
              scope: 'map',
              sourceText: '制作一个可玩的横版视差卷轴地图，包含碰撞、出生点和出口。',
            },
          }} />
        </ServiceProvider>,
      )
    })
    expect(container.querySelector('[data-slot="game-map-production"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="game-asset-production"]')).toBeNull()
    expect(container.textContent).toContain('Game map production')
    expect(container.querySelector('select')).toBeNull()

    const compile = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Build runtime plan'))
    expect(compile).toBeDefined()
    await act(async () => compile?.click())

    expect(container.textContent).toContain('side-scroll')
    expect(container.textContent).toContain('Planning references')
    expect(container.textContent).toContain('Runtime authority')
    expect(container.textContent).toContain('Runtime geometry')
    expect(container.textContent).toContain('Neutral map bundle')
    expect(container.textContent).toContain('runtimeManifest')
    expect(container.textContent).toContain('blocked')
  })
})
