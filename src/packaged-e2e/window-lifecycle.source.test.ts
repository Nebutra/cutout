import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  // Git may check these source files out with CRLF on Windows. The contracts
  // assert source structure, not platform-specific line-ending bytes.
  return readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/gu, '\n')
}

const nativeEntry = readSource('src-tauri/src/lib.rs')
const frontendEntry = readSource('src/main.tsx')
const settingsDialog = readSource('src/components/settings/SettingsDialog.tsx')
const packagedE2eRunner = readSource('src/packaged-e2e/runner.ts')
const packagedE2eCommand = readSource('src-tauri/src/commands/packaged_e2e.rs')
const nativeDeadlineCommand = readSource('src-tauri/src/commands/monotonic_deadline.rs')
const codexSystemCommand = readSource('src-tauri/src/commands/ai/codex_system.rs')
const applicationPermission = readSource('src-tauri/permissions/application.toml')
const e2eConfig = JSON.parse(readSource('src-tauri/tauri.e2e.conf.json')) as {
  bundle?: { macOS?: { infoPlist?: string } }
}
const e2eInfoPlist = readSource('src-tauri/Info.e2e.plist')
const buildScript = readSource('scripts/build-packaged-e2e-macos.sh')
const smokeScript = readSource('scripts/smoke-packaged-macos.sh')
const evidenceValidator = readSource('scripts/validate-packaged-e2e-evidence.mjs')

function quotedValues(source: string): string[] {
  return [...source.matchAll(/'([^']+)'/gu)].map((match) => match[1]!)
}

function kebabCaseRustVariant(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase()
}

describe('packaged E2E macOS window lifecycle', () => {
  it('renders without allowing the dedicated test window to focus', () => {
    const guard = nativeEntry.indexOf('if commands::packaged_e2e::enabled()')
    const migration = nativeEntry.indexOf('// Migrate the retired plaintext store')
    const lifecycle = nativeEntry.slice(guard, migration)

    expect(guard).toBeGreaterThan(0)
    expect(lifecycle).toContain('ActivationPolicy::Prohibited')
    expect(lifecycle).toContain('unhideWithoutActivation()')
    expect(lifecycle).toContain('NSActivityOptions::UserInitiatedAllowingIdleSystemSleep')
    expect(lifecycle).toContain('window.set_focusable(false)?')
    expect(lifecycle).toContain('initialize_window_background(app.handle())?')
    expect(lifecycle).toContain('start_background_window_watchdog(app.handle().clone())')
    expect(lifecycle).toContain('!window.is_visible()? || window.is_focused()?')
    expect(lifecycle).toContain('native_checkpoint("webview-renderable")')
    expect(lifecycle).not.toContain('window.show()?')
    expect(nativeEntry.slice(migration)).not.toContain('window.show()?')
    expect(nativeEntry.slice(migration)).not.toContain('unhideWithoutActivation()')
    expect(nativeEntry).not.toContain('ActivationPolicy::Accessory')
    expect(settingsDialog).toContain("VITE_CUTOUT_PACKAGED_E2E === '1'")
    expect(settingsDialog).toContain('onOpenAutoFocus={PACKAGED_E2E')
    expect(settingsDialog).toContain('(event) => event.preventDefault()')
  })

  it('declares and verifies background activation before native setup runs', () => {
    expect(e2eConfig.bundle?.macOS?.infoPlist).toBe('Info.e2e.plist')
    expect(e2eInfoPlist).toMatch(/<key>LSUIElement<\/key>\s*<true\/>/u)
    expect(buildScript).toContain("Print :LSUIElement")
    expect(smokeScript).toContain("Print :LSUIElement")
    expect(smokeScript).toContain('frontmost_change_failure_streak=2')
    expect(smokeScript).toContain('frontmost_consecutive_change_count=0')
    expect(smokeScript).toContain('maxConsecutiveChangedSamples')
    expect(smokeScript).toContain('baselineBundleIdSha256')
    expect(smokeScript).toContain('com.apple.SecurityAgent')
    expect(smokeScript).toContain('cleanup_test_process()')
    expect(smokeScript).toContain('descendant_process_ids()')
    expect(smokeScript).toContain('pgrep -P "$parent_pid"')
    expect(smokeScript).toContain('kill "${tracked_pids[@]}"')
    expect(smokeScript).toContain('kill -KILL "${tracked_pids[@]}"')
    expect(smokeScript).toContain('exec >>"$driver_log" 2>&1')
    expect(smokeScript.indexOf('exec >>"$driver_log" 2>&1'))
      .toBeLessThan(smokeScript.indexOf(') >"$log_file" 2>&1 &'))
    expect(smokeScript).toContain('finalize_packaged_e2e()')
    expect(smokeScript).toContain("trap 'terminate_packaged_e2e terminated 143' TERM")
    expect(smokeScript).toContain("trap 'terminate_packaged_e2e interrupted 130' INT")
    expect(smokeScript).toContain("trap 'terminate_packaged_e2e hangup 129' HUP")
    expect(smokeScript).toContain('packaged_e2e_proxy_enabled=0')
    expect(smokeScript).toContain('if ((packaged_e2e_proxy_enabled == 1))')
    expect(smokeScript).toContain('trap - EXIT TERM INT HUP\n    if ((packaged_e2e_proxy_enabled == 1))')
    expect(smokeScript).not.toContain('CUTOUT_PACKAGED_E2E=1 \\\n    "${packaged_e2e_proxy_env[@]}"')
    expect(smokeScript).toContain('--finalize "$result_root" "$smoke_exit_code"')
    expect(smokeScript).toContain('terminal_evidence="$result_root/final-evidence"')
    expect(smokeScript).toContain(
      'result_root="$HOME/Library/Application Support/com.nebutra.cutout.packaged-e2e-evidence"',
    )
    expect(smokeScript).toContain('previous_result_root="$result_root.previous"')
    expect(smokeScript).toContain('mv -- "$result_root" "$previous_result_root"')
    expect(smokeScript).toContain(
      'fi\nmkdir -p -- "$result_root"\nchmod 700 "$result_root"\nif [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then',
    )
    expect(smokeScript.indexOf('mkdir -p -- "$result_root"'))
      .toBeLessThan(smokeScript.indexOf(': >"$log_file"'))
    expect(smokeScript).toContain(
      'state_archive="/private/tmp/cutout-packaged-e2e-state-archive-$(date +%Y%m%d-%H%M%S)"',
    )
    expect(smokeScript).not.toContain('state_archive="$result_root/')
    expect(smokeScript).toContain('log_file="$result_root/cutout-package-smoke.log"')
    expect(smokeScript).toContain('driver_log="$result_root/cutout-package-smoke-driver.log"')
    expect(packagedE2eCommand).toContain(
      '.join("Library/Application Support/com.nebutra.cutout.packaged-e2e-evidence")',
    )
    expect(evidenceValidator).toContain(
      "join(homedir(), 'Library/Application Support/com.nebutra.cutout.packaged-e2e-evidence')",
    )
    expect(smokeScript).not.toMatch(/\bstatus=\$\?/u)
    expect(smokeScript).toContain('CUTOUT_PACKAGED_E2E_WINDOW_PROBE')
    expect(smokeScript).toContain('window-probe-ready')
    expect(frontendEntry).toContain("import { flushSync } from 'react-dom'")
    expect(frontendEntry).toContain('flushSync(() => root.render(app))')
    expect(frontendEntry).toContain('assertPackagedE2eProbeSurface()')
    expect(frontendEntry).toContain("getElementById('root')")
    expect(frontendEntry).not.toContain('firstElementChild')
    expect(frontendEntry).not.toContain('setTimeout(resolve, 50)')
    expect(frontendEntry).toContain('window-probe-surface-failed')
    expect(frontendEntry).toContain('window-probe-surface-ready')
    expect(nativeEntry).toContain('commands::packaged_e2e::packaged_e2e_mode')
    expect(smokeScript).toContain('[[ "$current_bundle_id" == "$e2e_bundle_id" ]]')
    expect(smokeScript).not.toContain('"$current_bundle_id" != "$baseline_frontmost_bundle_id"')
  })

  it('shows the production window without waiting on a hidden animation frame', () => {
    const firstTreeCommit = frontendEntry.indexOf('flushSync(() => root.render(app))')
    const productionWindowShow = frontendEntry.indexOf('await getCurrentWindow().show()')

    expect(frontendEntry).toContain('const isTauriWindow =')
    expect(frontendEntry).toContain('if (packagedE2e || isTauriWindow)')
    expect(frontendEntry).toContain('if (isTauriWindow)')
    expect(firstTreeCommit).toBeGreaterThan(0)
    expect(productionWindowShow).toBeGreaterThan(firstTreeCommit)
    expect(frontendEntry).not.toContain('requestAnimationFrame')
  })

  it('keeps screenshot capture fixed-path and disabled outside packaged E2E', () => {
    const capture = packagedE2eCommand.slice(
      packagedE2eCommand.indexOf('pub async fn packaged_e2e_capture_window'),
      packagedE2eCommand.indexOf('pub async fn packaged_e2e_complete'),
    )
    expect(capture).toContain('if !enabled()')
    expect(capture).toContain('get_webview_window("main")')
    expect(capture).toContain('request_webview_snapshot(webview.inner(), sender)')
    expect(capture).toContain('persist_capture_at(&result_root(), &id, &bytes)')
    expect(capture).toContain('keep_window_background(&app)?')
    expect(capture).not.toMatch(/PathBuf::from\(&id\)|join\(&id\)/u)
    expect(applicationPermission).toContain('"packaged_e2e_capture_window"')
    expect(nativeEntry).toContain('commands::packaged_e2e::packaged_e2e_capture_window')
    expect(packagedE2eCommand).toContain('window.orderBack(None)')
    expect(packagedE2eCommand).toContain('window.setIgnoresMouseEvents(true)')
    expect(packagedE2eCommand).toContain('let application_active = application.isActive()')
    expect(packagedE2eCommand).toContain('application.deactivate()')
    expect(packagedE2eCommand).toContain(
      'if initialize || application_active || window_owns_focus',
    )
    expect(packagedE2eCommand).toContain('pub(crate) fn start_background_window_watchdog')
    expect(packagedE2eCommand).toContain('pub(crate) fn pulse_background_renderer')
    expect(packagedE2eCommand).toContain('eval("void globalThis.performance.now()")')
    const watchdog = packagedE2eCommand.slice(
      packagedE2eCommand.indexOf('pub(crate) fn start_background_window_watchdog'),
      packagedE2eCommand.indexOf('#[tauri::command]\npub async fn packaged_e2e_mode'),
    )
    const tick = packagedE2eCommand.slice(
      packagedE2eCommand.indexOf('pub async fn packaged_e2e_tick'),
      packagedE2eCommand.indexOf('#[tauri::command]\npub async fn packaged_e2e_checkpoint'),
    )
    expect(watchdog).toContain('pulse_background_renderer(&app)')
    expect(watchdog).not.toContain('keep_window_background(&app)')
    expect(tick).toContain('pulse_background_renderer(&app)?')
    expect(tick).not.toContain('keep_window_background(&app)?')
    expect(packagedE2eCommand).not.toContain('activateIgnoringOtherApps')
    expect(packagedE2eCommand).not.toContain('makeKeyAndOrderFront')
    expect(packagedE2eCommand).not.toContain('orderFrontRegardless')
    expect(nativeDeadlineCommand).toContain(
      'crate::commands::packaged_e2e::pulse_background_renderer(&app)',
    )
    expect(codexSystemCommand).toContain(
      'crate::commands::packaged_e2e::pulse_background_renderer(&app)',
    )
    expect(packagedE2eCommand).toContain('std::thread::sleep(Duration::from_millis(250))')
    expect(packagedE2eCommand).toContain('quantized_colors.len() < 8')
    expect(packagedE2eCommand).toContain('contrast_pixels < required_contrast_pixels')
    expect(packagedE2eCommand).toContain(
      'takeSnapshotWithConfiguration_completionHandler',
    )
    expect(packagedE2eCommand).not.toContain('cacheDisplayInRect_toBitmapImageRep')
    expect(packagedE2eCommand).not.toContain(
      'NSApplication::sharedApplication(main_thread).deactivate()',
    )
  })

  it('keeps terminal failure diagnostics aligned across renderer, native, and evidence layers', () => {
    const rendererSwitch = packagedE2eRunner.slice(
      packagedE2eRunner.indexOf('export function readWorkspaceFailureDiagnostic'),
      packagedE2eRunner.indexOf('export function readWorkspacePlannerProgress'),
    )
    const rendererDiagnostics = new Set([
      ...[...rendererSwitch.matchAll(/case '([^']+)'/gu)].map((match) => match[1]!),
      'unknown',
    ])
    const rustEnum = packagedE2eCommand.slice(
      packagedE2eCommand.indexOf('pub enum PackagedE2eFailureDiagnostic'),
      packagedE2eCommand.indexOf('pub struct PackagedE2ePlannerProgress'),
    )
    const nativeDiagnostics = new Set(
      [...rustEnum.matchAll(/^\s{4}([A-Z][A-Za-z0-9]+),$/gmu)]
        .map((match) => kebabCaseRustVariant(match[1]!)),
    )
    const validatorSet = evidenceValidator.slice(
      evidenceValidator.indexOf('const diagnostics = new Set(['),
      evidenceValidator.indexOf('])', evidenceValidator.indexOf('const diagnostics = new Set([')),
    )
    const retainedDiagnostics = new Set(quotedValues(validatorSet))

    expect([...nativeDiagnostics].sort()).toEqual([...rendererDiagnostics].sort())
    expect([...retainedDiagnostics].sort()).toEqual([...rendererDiagnostics].sort())
  })
})
