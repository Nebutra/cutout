import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './local-state.fixture'
import { fingerprint } from '../../src/design-ir/fingerprint'
import { projectWorkspaceSnapshotToDesignDocument } from '../../src/design-ir/legacy-projection'
import type { WorkspaceSnapshot } from '../../src/workspace/workspace-snapshot'

const VAGUE_GOAL = 'Create a distinctive launch identity for our new product.'
const INTERNAL_TERMS = [
  /\bDAG\b/i,
  /executor/i,
  /provider/i,
  /model profile/i,
  /agent router/i,
  /graph spec/i,
  /run coordinator/i,
]

async function openStableHome(page: Page) {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.goto('/')
  await page.locator('body').evaluate((body) => {
    const style = document.createElement('style')
    style.dataset.outcomeFirstTest = 'true'
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `
    body.append(style)
  })
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('body')).toBeVisible()
}

async function startProject(page: Page, brief: string) {
  await page.getByRole('button', { name: /New (task|project)/ }).click()
  const homeComposer = page.getByRole('textbox', { name: 'Describe what you want to design...' })
  const workspaceComposer = page.getByRole('textbox', { name: 'Message the Agent' })
  await expect(homeComposer.or(workspaceComposer)).toBeVisible()
  if (await homeComposer.isVisible()) {
    await homeComposer.fill(brief)
    await page.getByRole('button', { name: 'Create from brief' }).click()
  } else {
    await workspaceComposer.fill(brief)
    await page.getByRole('button', { name: 'Send' }).click()
  }
  await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
}

async function createProjectWithWorkspace(
  page: Page,
  workspace: Record<string, unknown>,
  projectName: string,
) {
  const composer = page.getByRole('textbox', { name: 'Describe what you want to design...' })
  await expect(composer).toBeVisible()
  await composer.fill(projectName)
  await page.getByRole('button', { name: 'Create from brief' }).click()
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cutout-projects', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('projects', 'readonly').objectStore('projects').count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  })).toBeGreaterThan(0)
  const stop = page.getByRole('button', { name: 'Stop' })
  await stop.waitFor({ state: 'visible', timeout: 3_000 }).then(() => stop.click()).catch(() => undefined)
  const identity = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cutout-projects', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const tx = db.transaction('projects', 'readonly')
        const request = tx.objectStore('projects').getAll()
        request.onsuccess = () => {
          const records = request.result as Array<Record<string, unknown> & { updatedAt: number }>
          const latest = records.sort((a, b) => b.updatedAt - a.updatedAt)[0]
          if (!latest) reject(new Error('No project record was saved.'))
          else resolve(latest)
        }
        request.onerror = () => reject(request.error)
      })
      return {
        id: String(record.id),
        name: String(record.name),
        brief: String(record.brief ?? ''),
        createdAt: Number(record.createdAt),
        updatedAt: Number(record.updatedAt),
      }
    } finally {
      db.close()
    }
  })
  const hydratedFixture = {
    ...workspace,
    prototypeDesignSystem: workspace.prototypeDesignSystem
      ? { ...(workspace.prototypeDesignSystem as Record<string, unknown>), bytes: new Uint8Array((workspace.prototypeDesignSystem as { bytes: number[] }).bytes) }
      : null,
    prototypePages: Array.isArray(workspace.prototypePages)
      ? workspace.prototypePages.map((artifact) => ({
          ...(artifact as Record<string, unknown>),
          bytes: new Uint8Array((artifact as { bytes: number[] }).bytes),
        }))
      : [],
  } as unknown as WorkspaceSnapshot
  const designDocument = await projectWorkspaceSnapshotToDesignDocument({
    project: { ...identity, name: projectName },
    workspace: hydratedFixture,
  })
  const designDocumentContentHash = await fingerprint(
    JSON.parse(JSON.stringify(designDocument)) as typeof designDocument,
  )
  const project = await page.evaluate(async ({ fixture, projectName, designDocument, designDocumentContentHash }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cutout-projects', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const tx = db.transaction('projects', 'readonly')
        const request = tx.objectStore('projects').getAll()
        request.onsuccess = () => {
          const records = request.result as Array<Record<string, unknown> & { updatedAt: number }>
          const latest = records.sort((a, b) => b.updatedAt - a.updatedAt)[0]
          if (!latest) reject(new Error('No project record was saved.'))
          else resolve(latest)
        }
        request.onerror = () => reject(request.error)
      })
      const workspaceWithDocument = { ...fixture, designDocument }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite')
        tx.objectStore('projects').put({
          ...record,
          name: projectName,
          customName: projectName,
          designDocument,
          designDocumentContentHash,
          workspace: workspaceWithDocument,
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      return { id: String(record.id), name: projectName }
    } finally {
      db.close()
    }
  }, { fixture: hydratedFixture, projectName, designDocument, designDocumentContentHash })
  await page.reload()
  await page.getByRole('button', { name: /^All projects\b/ }).click()
  const projectDirectory = page.getByRole('main')
  await expect(projectDirectory).toBeVisible()
  await projectDirectory.getByRole('button', { name: `Open ${project.name}` }).last().click()
  await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
  return project
}

function baseWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    version: 'workspace.v1', workflowPhase: 'review', prototypePlan: null,
    prototypeScope: 'primary-flow', humanLoopChoiceId: null, humanLoopCustomAnswer: '',
    prototypeDesignSystem: null, prototypePages: [], selectedPrototypePageId: null,
    runError: null, namingStatus: 'idle', liveAgentOutput: '', attachments: [],
    webSearchEnabled: false, ...overrides,
  }
}

function plan(humanLoop: Record<string, unknown>) {
  const openDetails = {
    id: 'open-details', label: 'Open product details', trigger: 'click',
    sourceSectionId: 'hero', sourceElement: 'Product details link',
    intent: 'Learn more about the product', action: { type: 'navigate', targetPageId: 'details' },
  }
  const page = {
    id: 'home', name: 'Launch home', route: '/', purpose: 'Launch the product',
    viewport: { platform: 'responsive web', width: 1440, height: 900, scroll: 'single-screen' },
    regions: [{ id: 'hero', name: 'Hero', role: 'introduction', summary: 'Primary launch message.', complexity: 'medium', decompositionStrategy: 'direct', assetRoute: 'direct-generate', assetOpportunities: ['launch visual'] }], overlays: [], states: [], interactions: [openDetails],
  }
  return {
    version: 'prototype-plan.v0',
    product: { name: 'Northstar', projectName: 'Northstar', summary: VAGUE_GOAL, audience: 'Creative teams', primaryGoal: 'Launch clearly', platform: 'responsive web' },
    designSystem: { styleSummary: 'Distinctive and editorial', palette: ['black', 'white', 'green'], typography: 'Confident sans serif', spacing: '8px rhythm', componentPrinciples: ['clear hierarchy'], assetDirection: 'A focused launch visual' },
    pages: [page, { ...page, id: 'details', name: 'Product details', route: '/details', interactions: [] }],
    flows: [{ id: 'launch', name: 'Launch flow', goal: 'Understand the product', startPageId: 'home', steps: [{ fromPageId: 'home', interactionId: 'open-details', toPageId: 'details' }] }],
    humanLoop,
  }
}

function directionWorkspace() {
  return baseWorkspace({
    prototypePlan: plan({
      mode: 'ask', rationale: 'The visual posture changes the result.',
      question: 'Which visual direction should lead the launch?',
      choices: [
        { id: 'editorial', label: 'Editorial', description: 'Confident type and art direction.', impact: 'Leads with story.' },
        { id: 'product', label: 'Product-led', description: 'The interface is the hero.', impact: 'Leads with utility.' },
      ],
      defaultChoiceId: 'editorial',
    }),
  })
}

function completedWorkspace() {
  const bytes = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,8,215,99,248,207,192,240,31,0,5,0,1,255,137,153,61,29,0,0,0,0,73,69,78,68,174,66,96,130]
  const finishedPlan = plan({ mode: 'continue', rationale: 'Direction is resolved.' })
  return baseWorkspace({
    workflowPhase: 'idle', prototypePlan: finishedPlan,
    prototypeDesignSystem: { name: 'Northstar system', designMarkdown: '# Northstar', bytes, mediaType: 'image/png', width: 1, height: 1 },
    prototypePages: finishedPlan.pages.map((page: Record<string, unknown>) => ({ page, bytes, mediaType: 'image/png', width: 1, height: 1 })),
    selectedPrototypePageId: 'home', namingStatus: 'done',
  })
}

function overBudgetWorkspace() {
  const events = [
    { eventId: 'run', runId: 'run-1', at: 1, type: 'run-started', mode: 'create' },
    { eventId: 'intent', runId: 'run-1', at: 2, type: 'intent-recorded', intent: 'Produce a launch campaign.' },
    { eventId: 'tool', runId: 'run-1', at: 3, type: 'tool-started', toolCallId: 'image-1', tool: 'image.generate', label: 'Create launch visuals' },
    { eventId: 'approval', runId: 'run-1', at: 4, type: 'tool-approval-requested', toolCallId: 'image-1', requestId: 'request-1', tool: 'image.generate', label: 'Create launch visuals', estimatedCost: { currency: 'USD', amount: 0.8 }, budgetCeiling: { currency: 'USD', amount: 0.25 }, approvalPolicy: 'auto-within-budget', reason: 'This exceeds the approved budget.' },
  ]
  return baseWorkspace({
    agentRunEvents: { version: 'agent-run-events.v1', activeRunId: 'run-1', activeRun: null, events },
  })
}

function conversationalWorkspace() {
  const events = [
    { eventId: 'run', runId: 'run-chat', at: 1, type: 'run-started', mode: 'create' },
    {
      eventId: 'reply', runId: 'run-chat', at: 2, type: 'agent-message',
      message: "Hi! Tell me what you'd like to design or build.",
      action: { type: 'proceed-anyway', label: 'Build it anyway', brief: 'hi' },
    },
  ]
  return baseWorkspace({
    agentRunEvents: { version: 'agent-run-events.v1', activeRunId: 'run-chat', activeRun: null, events },
  })
}

function retriedIntentWorkspace() {
  const intent = '做一个健身打卡 App 首页'
  const events = [
    { eventId: 'start-1', runId: 'run-1', at: 1, type: 'run-started', mode: 'create' },
    { eventId: 'intent-1', runId: 'run-1', at: 2, type: 'intent-recorded', intent },
    { eventId: 'failed-1', runId: 'run-1', at: 3, type: 'step-failed', stepId: 'generate', label: 'Generate', detail: 'Provider timed out.' },
    { eventId: 'start-2', runId: 'run-2', at: 4, type: 'run-started', mode: 'repair' },
    { eventId: 'intent-2', runId: 'run-2', at: 5, type: 'intent-recorded', intent },
  ]
  return baseWorkspace({
    brief: intent,
    agentRunEvents: { version: 'agent-run-events.v1', activeRunId: 'run-2', activeRun: null, events },
  })
}

async function expectNoInternalVocabulary(surface: Locator) {
  for (const term of INTERNAL_TERMS) {
    await expect(surface.getByText(term)).toHaveCount(0)
  }
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return !(
    a.x + a.width <= b.x
    || b.x + b.width <= a.x
    || a.y + a.height <= b.y
    || b.y + b.height <= a.y
  )
}

test.beforeEach(async ({ page }) => {
  await openStableHome(page)
})

test('Home has one primary need entry and recent work remains reachable', async ({ page }, testInfo) => {
  const main = page.getByRole('main')
  const composer = page.getByPlaceholder('Describe what you want to design...')

  await expect(main).toBeVisible()
  await expect(composer).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Create from brief' })).toHaveCount(1)
  await expectNoInternalVocabulary(main)

  if (testInfo.project.name === 'mobile-chrome') {
    await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^All projects\b/ })).toBeVisible()
  } else {
    await expect(page.getByText('Recent', { exact: true })).toBeVisible()
  }

  await composer.focus()
  await expect(composer).toBeFocused()
  await page.keyboard.type('A high-level product direction')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
})

test('a vague goal asks only for direction and offers delegation', async ({ page }) => {
  await createProjectWithWorkspace(page, directionWorkspace(), 'Direction decision fixture')

  const workspace = page.getByRole('main')
  await expect(workspace).toBeVisible()
  await expectNoInternalVocabulary(workspace)

  const directionGate = page.getByRole('group', { name: /direction/i })
  await expect(directionGate).toBeVisible()
  await expect(directionGate.getByRole('button').filter({ hasText: /Use your judgment/i })).toBeVisible()

  // The gate is deliberately strategic: it may offer directions, but it must
  // not turn the user into the implementation manager.
  await expect(directionGate.getByText(/token|component API|executor|model|provider|DAG/i)).toHaveCount(0)
  await expect(directionGate.getByRole('button', { name: 'Use your judgment' })).toBeEnabled()
})

test('conversational Agent replies stay in the panel and never cover the canvas', async ({ page }) => {
  await createProjectWithWorkspace(page, conversationalWorkspace(), 'Conversation fixture')

  const panel = page.getByRole('complementary', { name: 'Agent workspace' })
  const reply = panel.getByText("Hi! Tell me what you'd like to design or build.")
  await expect(reply).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Build it anyway' })).toBeVisible()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Build it anyway' })).toHaveCount(0)

  const contained = await Promise.all([panel.boundingBox(), reply.boundingBox()]).then(([panelBox, replyBox]) =>
    Boolean(panelBox && replyBox
      && replyBox.x >= panelBox.x
      && replyBox.x + replyBox.width <= panelBox.x + panelBox.width
      && replyBox.y >= panelBox.y
      && replyBox.y + replyBox.height <= panelBox.y + panelBox.height),
  )
  expect(contained).toBe(true)
})

test('design details open in the left workspace drawer and do not leak internals by default', async ({ page }) => {
  await createProjectWithWorkspace(page, completedWorkspace(), 'Inspect the result details')
  const workspace = page.getByRole('main')

  await expectNoInternalVocabulary(workspace)
  await expect(page.getByRole('complementary', { name: 'Design system' })).toHaveCount(0)

  const design = page.getByRole('button', { name: 'Design', exact: true })
  await expect(design).toBeVisible(); await design.click()
  await expect(page.getByRole('complementary', { name: 'Design system' })).toBeVisible()
})

test('completed result keeps the canvas free of review controls, while ordinary states hide cost', async ({ page }) => {
  await createProjectWithWorkspace(page, completedWorkspace(), 'Completed result fixture')

  await expect(page.getByRole('button', { name: /Approve deliverables/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Request changes/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Compare deliverables/i })).toHaveCount(0)
  await expect(page.getByText(/\$\d|USD|credits?/i)).toHaveCount(0)
})

test('selecting a deliverable previews it and targets an Agent change request', async ({ page }) => {
  await createProjectWithWorkspace(page, completedWorkspace(), 'Deliverable lineage fixture')
  const closeInspector = page.getByRole('button', { name: 'Close design inspector' })
  if (await closeInspector.isVisible()) await closeInspector.click()
  const hideAgent = page.getByRole('button', { name: 'Hide Agent' })
  if (await hideAgent.isVisible()) await hideAgent.click()
  const card = page.getByText('Launch home', { exact: true }).last()
  await expect(card).toBeVisible()
  await card.click()
  const preview = page.getByRole('dialog')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('Launch home')
  await page.keyboard.press('Escape')
  await expect(preview).toBeHidden()

  await expect(page.getByText('Continue generation', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Request changes to Launch home' }).click()
  await expect(page.getByLabel('Message the Agent')).toBeFocused()
  await expect(page.locator('[data-slot="agent-material-context"]')).toContainText('Launch home')
})

test('Canvas keeps a responsive safe area while workspace panels change', async ({ page }, testInfo) => {
  await createProjectWithWorkspace(page, completedWorkspace(), 'Canvas safe area fixture')

  const hideAgent = page.getByRole('button', { name: 'Hide Agent' })
  if (await hideAgent.isVisible()) await hideAgent.click()

  const canvas = page.locator('.react-flow').first()
  await expect(canvas).toBeVisible()
  const zoom = page.getByRole('button', { name: 'Zoom to 100%' })
  const fit = page.getByRole('button', { name: 'Fit view' })
  await expect(zoom).toBeVisible()
  await expect(fit).toBeVisible()

  const geometry = async () => page.evaluate(() => {
    const rect = (element: Element | null) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }
    }
    const canvas = document.querySelector('.react-flow')
    const zoom = document.querySelector('[aria-label="Zoom to 100%"]')
    const toolbar = zoom?.parentElement ?? null
    const minimap = document.querySelector('.react-flow__minimap')
    const help = document.querySelector('[aria-label="Help"], [title="Help"]')
    const boxes = [toolbar, minimap, help].filter(Boolean).map(rect).filter(Boolean) as NonNullable<ReturnType<typeof rect>>[]
    const canvasControls = [toolbar, minimap].filter(Boolean).map(rect).filter(Boolean) as NonNullable<ReturnType<typeof rect>>[]
    const overlap = boxes.some((box, index) => boxes.slice(index + 1).some((other) =>
      box.x < other.right && box.right > other.x && box.y < other.bottom && box.bottom > other.y,
    ))
    const canvasBox = rect(canvas)
    return {
      canvas: canvasBox,
      toolbar: rect(toolbar),
      minimap: rect(minimap),
      help: rect(help),
      overlap,
      controlsInside: Boolean(canvasBox) && canvasControls.every((box) =>
        box.x >= canvasBox!.x - 1 && box.right <= canvasBox!.right + 1 && box.y >= canvasBox!.y - 1 && box.bottom <= canvasBox!.bottom + 1,
      ),
      helpInsideViewport: !help || boxes.at(-1)!.x >= 0 && boxes.at(-1)!.right <= innerWidth && boxes.at(-1)!.y >= 0 && boxes.at(-1)!.bottom <= innerHeight,
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    }
  })

  await page.getByRole('button', { name: 'Toggle minimap' }).click()
  await expect(page.locator('.react-flow__minimap')).toBeVisible()
  await fit.click()
  await page.waitForTimeout(250)
  const baseline = await geometry()
  expect(baseline.canvas).not.toBeNull()
  expect(baseline.controlsInside, JSON.stringify(baseline)).toBe(true)
  expect(baseline.helpInsideViewport).toBe(true)
  expect(baseline.overlap).toBe(false)
  expect(baseline.documentFits).toBe(true)

  if (testInfo.project.name === 'desktop-chrome') {
    await page.getByRole('button', { name: 'Agent', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
    const agent = await geometry()
    expect(agent.controlsInside).toBe(true)
    expect(agent.overlap).toBe(false)
    await page.getByRole('button', { name: 'Agent', exact: true }).click()

    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await expect(page.locator('[data-workspace-panel="files-drawer"]')).toBeVisible()
    const files = await geometry()
    expect(files.controlsInside).toBe(true)
    expect(files.overlap).toBe(false)
    await page.getByRole('button', { name: 'Files', exact: true }).click()

    await page.getByRole('button', { name: 'Design', exact: true }).click()
    const inspectorPanel = page.getByRole('complementary', { name: 'Design system' })
    await expect(inspectorPanel).toBeVisible()
    await inspectorPanel.getByRole('button', { name: 'Close design inspector' }).click()
    await expect(inspectorPanel).toHaveCount(0)
    const afterInspector = await geometry()
    expect(afterInspector.controlsInside).toBe(true)
    expect(afterInspector.overlap).toBe(false)

    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    const collapsed = await geometry()
    expect(collapsed.controlsInside).toBe(true)
    expect(collapsed.overlap).toBe(false)
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
  }

  await page.setViewportSize(testInfo.project.name === 'mobile-chrome'
    ? { width: 390, height: 844 }
    : { width: 1180, height: 760 })
  await fit.click()
  await page.waitForTimeout(250)
  const resized = await geometry()
  expect(resized.controlsInside).toBe(true)
  expect(resized.overlap).toBe(false)
  expect(resized.documentFits).toBe(true)
  expect(Number((await zoom.textContent())?.replace('%', ''))).toBeGreaterThan(15)

  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle('dark', enabled), dark)
    await expect(canvas).toHaveScreenshot(`canvas-safe-area-${dark ? 'dark' : 'light'}.png`)
  }
})

test('provider estimate stays attached to the action that requires approval', async ({ page }) => {
  await createProjectWithWorkspace(page, overBudgetWorkspace(), 'Budget decision fixture')

  const budgetGate = page.getByRole('region', { name: 'Decision needed' })
  await expect(budgetGate).toBeVisible()
  await expect(budgetGate.locator('[data-slot="tool-cost-estimate"]').getByText(/USD 0\.80/)).toBeVisible()
  await expect(budgetGate.getByRole('button', { name: /approve/i })).toBeVisible()
  await expect(budgetGate.getByRole('button', { name: /deny/i })).toBeVisible()
  await expect(page.locator('[data-slot="agent-cost-summary"]')).toHaveCount(0)
  await expect(page.getByText(/Charged USD/)).toHaveCount(0)
})

test('continuing a failed run does not repeat the same user bubble', async ({ page }) => {
  await createProjectWithWorkspace(page, retriedIntentWorkspace(), 'Retry transcript fixture')

  await expect(page.locator('[data-slot="user-message"]')).toHaveCount(1)
  await expect(page.locator('[data-slot="user-message"]')).toContainText('做一个健身打卡 App 首页')
})

test('primary controls do not overlap and remain keyboard reachable', async ({ page }, testInfo: TestInfo) => {
  await startProject(page, 'Check responsive controls')

  await expect(page.getByText('Primary result', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Supporting result', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Planned prototype page', { exact: true })).toHaveCount(0)

  const composer = page.getByPlaceholder(/Describe a result/i)
  const send = page.getByRole('button', { name: /send/i })
  const details = page.getByRole('button', { name: 'Design', exact: true })
  await expect(composer).toBeVisible()
  await expect(send).toBeVisible()
  if (testInfo.project.name !== 'mobile-chrome') await expect(details).toBeVisible()

  const controls = testInfo.project.name === 'mobile-chrome' ? [composer, send] : [composer, send, details]
  for (const control of controls) {
    const box = await control.boundingBox()
    expect(box, `${await control.getAttribute('aria-label') ?? 'control'} has a box`).not.toBeNull()
  }
  const composerBox = (await composer.boundingBox())!
  const sendBox = (await send.boundingBox())!
  const detailsBox = testInfo.project.name === 'mobile-chrome' ? null : (await details.boundingBox())!
  expect(intersects(composerBox, sendBox)).toBe(false)
  if (detailsBox) expect(intersects(sendBox, detailsBox)).toBe(false)

  await composer.focus()
  await expect(composer).toBeFocused()
  await page.keyboard.press('Tab')
  // Mobile and desktop can order the compact tools differently, but focus may
  // never disappear into a non-interactive canvas surface.
  await expect(page.locator(':focus')).toHaveCount(1)
  await expect(page.locator(':focus')).not.toHaveAttribute('tabindex', '-1')

  await page.screenshot({
    path: testInfo.outputPath('outcome-first-controls.png'),
    fullPage: true,
  })
})

test('Everything Inbox Add menu stays outcome-first on desktop and mobile', async ({ page }) => {
  await openStableHome(page)
  await page.getByRole('button', { name: 'Add source' }).click()
  await expect(page.getByRole('menuitem', { name: /Idea, story, or need/i })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Screenshot, photo, or video/i })).toBeVisible()
  await page.getByRole('menuitem', { name: /Idea, story, or need/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Add sources' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Paste text or URL')).toBeVisible()
  await expect(dialog.getByLabel('Add local files')).toBeAttached()
  await expect(dialog.getByText(/Agent will interpret/i)).toBeVisible()
})

test('files attach inline without opening the source dialog', async ({ page }) => {
  await openStableHome(page)
  await page.getByRole('button', { name: 'Add source' }).click()
  await page.getByRole('menuitem', { name: /Screenshot, photo, or video/i }).click()
  await page.getByLabel('Add local files').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from('inline-reference'),
  })
  await expect(page.getByLabel('Composer attachments')).toContainText('reference.png')
  await expect(page.getByRole('dialog', { name: 'Add sources' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove reference.png' }).click()
  await expect(page.getByLabel('Composer attachments')).toHaveCount(0)
})

test('Connectors disclose real availability without inventing accounts', async ({ page }) => {
  await openStableHome(page)
  await page.getByRole('button', { name: 'Connectors' }).click()
  await expect(page.getByRole('menuitem', { name: /Figma.*Connect/i })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /GitHub.*Host required/i })).toBeVisible()
  await expect(page.getByText('Host required', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Coming soon', { exact: true }).first()).toBeVisible()
  await page.getByRole('menuitem', { name: /Add connectors/i }).click()
  const management = page.getByRole('dialog', { name: 'Manage connectors' })
  await expect(management).toBeVisible()
  await expect(management).toContainText('SecretHandles')
  await expect(management).not.toContainText('Connected')
})

test('project Agent composer exposes the same connector discovery surface', async ({ page }) => {
  await startProject(page, 'Explore connector options')
  await expect(page.getByRole('button', { name: 'Asset library' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Project actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Asset library' })).toBeVisible()
  await page.keyboard.press('Escape')
  const workspace = page.getByRole('complementary', { name: 'Agent workspace' })
  await workspace.getByRole('button', { name: 'Connectors' }).click()
  await expect(page.getByText('Repository', { exact: true })).toBeVisible()
  await expect(page.getByText('Host required', { exact: true }).first()).toBeVisible()
  await page.getByRole('menuitem', { name: /Add connectors/i }).click()
  await expect(page.getByRole('dialog', { name: 'Manage connectors' })).toBeVisible()
})
