import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

type Capability = {
  identifier: string
  windows: string[]
  permissions: string[]
}

const root = process.cwd()

async function readCapability(name: string): Promise<Capability> {
  return JSON.parse(
    await readFile(`${root}/src-tauri/capabilities/${name}.json`, 'utf8'),
  ) as Capability
}

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(`${root}/${path}`, 'utf8')
}

const expectedMainWindowPermissions = [
  'core:app:allow-version',
  'core:event:allow-listen',
  'core:event:allow-unlisten',
  'os:allow-locale',
  'store:allow-load',
  'store:allow-get',
  'store:allow-set',
  'store:allow-delete',
  'store:allow-save',
]

describe('Tauri capability least privilege contract', () => {
  it('keeps the main-window native surface on the reviewed command allowlist', async () => {
    const capability = await readCapability('default')

    expect(capability.identifier).toBe('default')
    expect(capability.windows).toEqual(['main'])
    expect(capability.permissions).toEqual(expectedMainWindowPermissions)
  })

  it('does not reintroduce broad plugin defaults or direct filesystem/dialog access', async () => {
    const capabilities = await Promise.all(
      ['default', 'updater'].map(readCapability),
    )
    const permissions = capabilities.flatMap((capability) => capability.permissions)

    expect(permissions.filter((permission) => permission.endsWith(':default'))).toEqual([])
    expect(permissions.filter((permission) => /^(?:fs|dialog):/.test(permission))).toEqual([])
  })

  it('keeps the retired GUI Queue out of native modules, handlers and permissions', async () => {
    const sources = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
    ])

    for (const source of sources) {
      expect(source).not.toMatch(/\bai_native(?:_|::)/)
    }
    expect(sources[2]).toContain(
      'commands.allow = ["save_assets", "save_bundle", "scan_repository"]',
    )
  })

  it('registers foreground segmentation as a narrow desktop capability', async () => {
    const [modules, handlers, permissions, desktopCapability] = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
      readCapability('updater'),
    ])

    expect(modules).toContain('pub mod foreground_segmentation;')
    expect(handlers).toContain('foreground_segmentation_capabilities')
    expect(handlers).toContain('foreground_segment')
    expect(permissions).toContain('identifier = "foreground-segmentation"')
    expect(desktopCapability.permissions).toContain('foreground-segmentation')
  })

  it('registers only bounded wait and cancellation for native monotonic deadlines', async () => {
    const [modules, handlers, permissions, desktopCapability] = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
      readCapability('updater'),
    ])

    expect(modules).toContain('pub mod monotonic_deadline;')
    expect(handlers).toContain('commands::monotonic_deadline::wait_for_monotonic_deadline')
    expect(handlers).toContain('commands::monotonic_deadline::cancel_monotonic_deadline')
    expect(permissions).toContain('identifier = "monotonic-deadline"')
    expect(permissions).toContain(
      'commands.allow = ["wait_for_monotonic_deadline", "cancel_monotonic_deadline"]',
    )
    expect(desktopCapability.permissions).toContain('monotonic-deadline')
  })

  it('registers the closed Codex planning runtime without generic process authority', async () => {
    const [modules, handlers, permissions, desktopCapability] = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/ai/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
      readCapability('updater'),
    ])

    expect(modules).toContain('pub mod codex_system;')
    expect(handlers).toContain('codex_system_probe')
    expect(permissions).toContain('identifier = "codex-system-runtime"')
    expect(handlers).toContain('codex_system_turn_start')
    expect(handlers).toContain('codex_system_turn_steer')
    expect(handlers).toContain('codex_system_turn_interrupt')
    expect(handlers).toContain('codex_system_conversation_reset')
    expect(permissions).toContain('"codex_system_turn_start"')
    expect(permissions).toContain('"codex_system_turn_interrupt"')
    expect(desktopCapability.permissions).toContain('codex-system-runtime')
    expect(handlers).not.toContain('codex_system_bind_conversation')
    expect(permissions).not.toMatch(/codex_system_(?:exec|spawn|shell)/)
  })

  it('registers native DashScope images only inside the reviewed provider boundary', async () => {
    const [modules, handlers, permissions, desktopCapability] = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/ai/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
      readCapability('updater'),
    ])

    expect(modules).toContain('pub mod dashscope_image;')
    expect(handlers).toContain('commands::ai::dashscope_image::ai_dashscope_image')
    expect(permissions).toContain('identifier = "provider-secrets-network"')
    expect(permissions).toContain('"ai_dashscope_image"')
    expect(desktopCapability.permissions).toContain('provider-secrets-network')
    expect(handlers).not.toContain('ai_dashscope_request')
    expect(permissions).not.toContain('ai_dashscope_request')
  })

  it('registers only the bounded multimodal Host commands inside the provider boundary', async () => {
    const [modules, handlers, permissions, desktopCapability] = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/ai/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
      readCapability('updater'),
    ])

    expect(modules).toContain('pub mod dashscope_multimodal;')
    expect(modules).toContain('pub mod multimodal_receipt;')
    expect(modules).toContain('pub mod commerce_source_ingest;')
    expect(modules).toContain('pub mod commerce_held_out;')
    expect(handlers).toContain('commands::ai::dashscope_multimodal::ai_dashscope_structured_text')
    expect(handlers).toContain('commands::ai::dashscope_multimodal::ai_dashscope_vision_json')
    expect(handlers).toContain('commands::ai::dashscope_multimodal::ai_dashscope_video')
    expect(handlers).toContain('commands::ai::commerce_source_ingest::ai_ingest_competition_source_image')
    expect(handlers).toContain('commands::ai::commerce_source_ingest::verify_commerce_source_ingest_receipt')
    expect(handlers).toContain('commands::ai::commerce_held_out::create_commerce_held_out_commitment')
    expect(handlers).toContain('commands::ai::commerce_held_out::verify_commerce_held_out_attestation')
    expect(handlers).toContain('commands::ai::game_asset_generation::preview_game_asset_generation')
    expect(handlers).toContain('commands::ai::game_asset_generation::apply_game_asset_generation')
    expect(handlers).toContain('commands::ai::game_asset_generation::verify_game_asset_generation_authorization')
    expect(handlers).toContain('commands::ai::game_asset_generation::preview_game_asset_semantic_acceptance')
    expect(handlers).toContain('commands::ai::game_asset_generation::apply_game_asset_semantic_acceptance')
    expect(handlers).toContain('commands::ai::game_asset_generation::verify_game_asset_semantic_acceptance')
    expect(handlers).toContain('commands::ai::multimodal_receipt::verify_multimodal_host_artifact')
    expect(handlers).toContain('commands::ai::multimodal_receipt::promote_multimodal_video_playback')
    expect(permissions).toContain('"ai_dashscope_structured_text"')
    expect(permissions).toContain('"ai_dashscope_vision_json"')
    expect(permissions).toContain('"ai_dashscope_video"')
    expect(permissions).toContain('"ai_ingest_competition_source_image"')
    expect(permissions).toContain('"verify_commerce_source_ingest_receipt"')
    expect(permissions).toContain('"create_commerce_held_out_commitment"')
    expect(permissions).toContain('"verify_commerce_held_out_attestation"')
    expect(permissions).toContain('"preview_game_asset_generation"')
    expect(permissions).toContain('"apply_game_asset_generation"')
    expect(permissions).toContain('"verify_game_asset_generation_authorization"')
    expect(permissions).toContain('"preview_game_asset_semantic_acceptance"')
    expect(permissions).toContain('"apply_game_asset_semantic_acceptance"')
    expect(permissions).toContain('"verify_game_asset_semantic_acceptance"')
    expect(permissions).toContain('"verify_multimodal_host_artifact"')
    expect(permissions).toContain('"promote_multimodal_video_playback"')
    expect(desktopCapability.permissions).toContain('provider-secrets-network')
  })

  it('does not expose the retired local Agent inventory as a readiness surface', async () => {
    const [modules, handlers, permissions, desktopCapability] = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/ai/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
      readCapability('updater'),
    ])

    expect(modules).not.toContain('local_agent_inventory')
    expect(handlers).not.toContain('discover_local_agent_inventory')
    expect(permissions).not.toContain('local-agent-inventory')
    expect(desktopCapability.permissions).not.toContain('local-agent-inventory')
  })
})
