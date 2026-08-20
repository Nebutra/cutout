/**
 * Run the pre-three-layer binding migration once per install, at app start.
 *
 * It lives on app mount rather than in Settings because a user who never opens
 * Settings still needs their legacy `defaultModel` route preserved — that was
 * the only routing they had before models moved to task bindings.
 */
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { aiSettingsKeys } from './queries/ai-settings'
import { migrateLegacyBindingsIfDesktop } from '@/services/ai/legacy-binding-migration'
import type { ProviderConfig } from '@/services/ai/provider-types'

export function useLegacyBindingMigration(
  providers: readonly ProviderConfig[] | undefined,
): void {
  const queryClient = useQueryClient()
  const attempted = useRef(false)

  useEffect(() => {
    // Wait for the first provider list: migrating against an empty list would
    // burn the one-shot guard without seeding anything.
    if (attempted.current || !providers) return
    attempted.current = true
    void migrateLegacyBindingsIfDesktop(providers).then((seeded) => {
      if (!seeded) return
      void queryClient.invalidateQueries({
        queryKey: aiSettingsKeys.capabilityBindings(),
      })
      void queryClient.invalidateQueries({ queryKey: aiSettingsKeys.assignments() })
    })
  }, [providers, queryClient])
}
