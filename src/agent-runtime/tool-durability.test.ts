import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { createMemoryToolDurabilityStore } from './tool-durability'
import { createNodeToolDurabilityStore } from './tool-durability.node'
import type { AgentRunEvent } from './run-events'
import type { PaidToolReceipt } from '@/control-protocol/paid-tool-contract'

const event = { eventId: 'event:req:success', runId: 'run', at: 3, type: 'tool-succeeded', toolCallId: 'call', tool: 'generate-image', label: 'Hero', outputRefs: ['artifact:hero'] } as AgentRunEvent
const receipt: PaidToolReceipt = { receiptId: 'receipt', requestId: 'req', capability: 'generate-image', providerId: 'provider', model: 'model', status: 'succeeded', charged: { currency: 'USD', amount: 1 }, outputArtifactIds: ['artifact:hero'], startedAt: 2, completedAt: 3 }

describe.each([
  ['memory', async () => createMemoryToolDurabilityStore()],
  ['node', async () => { const root = await mkdtemp(join(tmpdir(), 'cutout-tool-ledger-')); return Object.assign(createNodeToolDurabilityStore(root), { cleanup: () => rm(root, { recursive: true, force: true }), root }) }],
])('tool durability store: %s', (_, factory) => {
  it('deduplicates success with charged evidence and replays the event outbox', async () => {
    const store = await factory()
    try {
      expect((await store.plan({ requestId: 'req', runId: 'run', toolCallId: 'call', capability: 'generate-image', at: 1 })).duplicate).toBe(false)
      await store.begin('req', 'attempt:1', 2)
      await store.settle('req', 'attempt:1', { status: 'succeeded', receipt, at: 3 }, [event])
      expect((await store.plan({ requestId: 'req', runId: 'run', toolCallId: 'call', capability: 'generate-image', at: 4 })).duplicate).toBe(true)
      expect(await store.get('req')).toMatchObject({ status: 'succeeded', attempts: [{ status: 'succeeded', receipt: { charged: { amount: 1 } } }] })
      await expect(store.drainEvents(() => { throw new Error('event sink unavailable') })).rejects.toThrow('event sink unavailable')
      const delivered: AgentRunEvent[] = []
      expect(await store.drainEvents((events) => delivered.push(...events))).toBe(1)
      expect(delivered).toEqual([event])
      expect(await store.drainEvents(() => undefined)).toBe(0)
    } finally { await (store as any).cleanup?.() }
  })
})

it('recovers an in-flight Node attempt as reconciling and handles a stale lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cutout-tool-recovery-'))
  try {
    const first = createNodeToolDurabilityStore(root)
    await first.plan({ requestId: 'req', runId: 'run', toolCallId: 'call', capability: 'generate-image', at: 1 })
    await first.begin('req', 'attempt:1', 2)
    const lock = join(root, '.cutout', '.tool-ledger.lock')
    await mkdir(lock)
    await utimes(lock, new Date(0), new Date(0))
    const restarted = createNodeToolDurabilityStore(root)
    await restarted.recover()
    expect(await restarted.get('req')).toMatchObject({ status: 'reconciling', attempts: [{ status: 'reconciling' }] })
    expect(await readFile(join(root, '.cutout', 'tool-requests.json'), 'utf8')).not.toContain('/Users/')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('serializes concurrent Node plans with one durable request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cutout-tool-concurrent-'))
  try {
    const left = createNodeToolDurabilityStore(root), right = createNodeToolDurabilityStore(root)
    const results = await Promise.all([left.plan({ requestId: 'same', runId: 'run', toolCallId: 'call', capability: 'generate-image', at: 1 }), right.plan({ requestId: 'same', runId: 'run', toolCallId: 'call', capability: 'generate-image', at: 1 })])
    expect(results.map(({ duplicate }) => duplicate).sort()).toEqual([false, true])
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('serializes the same request across independent Node processes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cutout-tool-process-'))
  try {
    const results = await Promise.all([runWorker(root), runWorker(root)])
    expect(results.map(({ duplicate }) => duplicate).sort()).toEqual([false, true])
    expect(JSON.parse(await readFile(join(root, '.cutout', 'tool-requests.json'), 'utf8')).requests).toHaveLength(1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('survives repeated independent-process contention without an ambiguous exit', async () => {
  const roots=await Promise.all(Array.from({length:8},(_,round)=>mkdtemp(join(tmpdir(),`cutout-tool-stress-${round}-`))))
  try {
    const rounds=await Promise.all(roots.map((root)=>Promise.all([runWorker(root),runWorker(root)])))
    for(const results of rounds)expect(results.map(({duplicate})=>duplicate).sort()).toEqual([false,true])
  } finally { for(const root of roots)await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:20}) }
},60_000)

it('replays the atomic authoritative outbox when a projection write is lost', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cutout-tool-outbox-'))
  try {
    const store = createNodeToolDurabilityStore(root)
    await store.plan({ requestId: 'req', runId: 'run', toolCallId: 'call', capability: 'generate-image', at: 1 })
    await store.begin('req', 'attempt', 2)
    await store.settle('req', 'attempt', { status: 'succeeded', receipt, at: 3 }, [event])
    await writeFile(join(root, '.cutout', 'tool-event-outbox.json'), '{broken projection')
    const restarted = createNodeToolDurabilityStore(root)
    const replayed: AgentRunEvent[] = []
    expect(await restarted.drainEvents((events) => replayed.push(...events))).toBe(1)
    expect(replayed).toEqual([event])
  } finally { await rm(root, { recursive: true, force: true }) }
})

function runWorker(root: string): Promise<{ duplicate: boolean }> {
  const source = `import { resolve } from 'node:path'; import { pathToFileURL } from 'node:url'; try { const mod=await import(pathToFileURL(resolve(process.cwd(),'src/agent-runtime/tool-durability.node.ts')).href); const value=await mod.createNodeToolDurabilityStore(process.argv[1]).plan({requestId:'process-request',runId:'run',toolCallId:'call',capability:'generate-image',at:1}); await new Promise((resolve,reject)=>process.stdout.write(JSON.stringify({protocol:'cutout.tool-worker.v1',status:'completed',value})+'\\n',(error)=>error?reject(error):resolve())); } catch(error) { process.stderr.write(String(error?.stack??error)+'\\n'); process.exitCode=1; }`
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, root], { cwd: process.cwd() })
    let stdout = '', stderr = '', spawnError:Error|null=null, exitEvent:{code:number|null;signal:NodeJS.Signals|null}|null=null, closeEvent:{code:number|null;signal:NodeJS.Signals|null}|null=null
    child.stdout.on('data', (chunk) => { stdout += String(chunk) }); child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.once('error',(error)=>{spawnError=error})
    const exited = new Promise<void>((resolve) => child.once('exit',(code,signal)=>{exitEvent={code,signal};resolve()}))
    const closed = new Promise<void>((resolve) => child.once('close',(code,signal)=>{closeEvent={code,signal};resolve()}))
    const stdoutEnded = new Promise<void>((resolve, rejectStream) => { child.stdout.once('end', resolve); child.stdout.once('error', rejectStream) })
    const stderrEnded = new Promise<void>((resolve, rejectStream) => { child.stderr.once('end', resolve); child.stderr.once('error', rejectStream) })
    void Promise.all([exited, closed, stdoutEnded, stderrEnded]).then(() => {
      const state={exitEvent,closeEvent,exitCode:child.exitCode,signalCode:child.signalCode,spawnError:spawnError?.message??null,stderr}
      if(spawnError)throw new Error(`Durability worker spawn failed: ${JSON.stringify(state)}`)
      if(!exitEvent||!closeEvent)throw new Error(`Durability worker lifecycle was incomplete: ${JSON.stringify(state)}`)
      if(exitEvent.signal||closeEvent.signal||child.signalCode)throw new Error(`Durability worker terminated by signal: ${JSON.stringify(state)}`)
      if(exitEvent.code!==0||closeEvent.code!==0||child.exitCode!==0)throw new Error(`Durability worker exited unsuccessfully: ${JSON.stringify(state)}`)
      const frames=stdout.split(/\r?\n/).filter(Boolean).map((line)=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean)
      const completed=frames.filter((frame)=>frame.protocol==='cutout.tool-worker.v1'&&frame.status==='completed')
      if(completed.length!==1)throw new Error(`Durability worker did not emit exactly one valid completion frame: ${JSON.stringify({...state,stdout})}`)
      resolveResult(completed[0].value)
    }).catch(reject)
  })
}
