/**
 * The one way a connection's catalog (layer 2) is refreshed.
 *
 * Verifying a provider and learning which models it serves used to be two
 * different things stored in two different places — a receipt in localStorage
 * that also happened to carry the model list. They are now one action: probe
 * the credential, persist the catalog beside the connection, record the
 * receipt. Every "Verify"/"Refresh models" affordance funnels through here, so
 * there is exactly one writer.
 */
import type { ProviderService } from './types'
import { isErr } from '../types'
import { setProviderVerification } from './provider-verification'

export interface VerifyProviderOutcome {
  readonly models: readonly string[]
  readonly fetchedAt: string
}

/**
 * Probe `providerId`, persist the catalog it advertises, and record a passing
 * receipt. Throws on a failed probe **after** recording the failure, so callers
 * can surface the message while the UI still reflects the outcome.
 */
export async function verifyProviderCatalog(
  providers: ProviderService,
  providerId: string,
): Promise<VerifyProviderOutcome> {
  const result = await providers.test(providerId)
  if (isErr(result)) {
    setProviderVerification(providerId, {
      status: 'failed',
      checkedAt: new Date().toISOString(),
      detail: result.error,
    })
    throw new Error(result.error)
  }

  const fetchedAt = new Date().toISOString()
  const models = [...result.data.models]
  // Caching the catalog is best-effort: the credential demonstrably works, and
  // a failed write (provider removed mid-probe, read-only config dir) must not
  // turn a passing probe into a failed one. Callers get `models` either way.
  try {
    const configured = await providers.list()
    const provider = configured.find((candidate) => candidate.id === providerId)
    if (provider) {
      await providers.upsert({ ...provider, catalog: { models, fetchedAt } })
    }
  } catch {
    // Intentionally ignored — see above.
  }
  setProviderVerification(providerId, { status: 'verified', checkedAt: fetchedAt })
  return { models, fetchedAt }
}
