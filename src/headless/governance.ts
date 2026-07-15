import { runDesignGovernance, type GovernanceInput, type StandardGovernancePolicy } from '@/design-governance'

export type HeadlessGovernanceMode = 'preview' | 'validate' | 'report'

type GovernanceReport = ReturnType<typeof runDesignGovernance>
type Base<M extends HeadlessGovernanceMode> = { protocol:'cutout.governance-harness.v1';mode:M;documentId:string;revisionId:string;reportId:string;summary:GovernanceReport['summary'];measurements:GovernanceReport['measurements'] }
export function runHeadlessGovernance(input: GovernanceInput, policy: StandardGovernancePolicy, mode: 'preview'): Base<'preview'> & {ruleIds:string[]}
export function runHeadlessGovernance(input: GovernanceInput, policy: StandardGovernancePolicy, mode: 'validate'): Base<'validate'> & {findings:Array<Omit<GovernanceReport['findings'][number],'evidence'|'repairSuggestions'>>}
export function runHeadlessGovernance(input: GovernanceInput, policy: StandardGovernancePolicy, mode: 'report'): Base<'report'> & {report:GovernanceReport}
export function runHeadlessGovernance(input: GovernanceInput, policy: StandardGovernancePolicy, mode: HeadlessGovernanceMode) {
  const report = runDesignGovernance(input, policy)
  const base = { protocol: 'cutout.governance-harness.v1' as const, mode, documentId: report.documentId, revisionId: report.revisionId, reportId: report.id, summary: report.summary, measurements: report.measurements }
  if (mode === 'preview') return { ...base, ruleIds: [...new Set(report.findings.map((finding) => finding.ruleId))].sort() }
  if (mode === 'validate') return { ...base, findings: report.findings.map(({ evidence: _evidence, repairSuggestions: _repairs, ...finding }) => finding) }
  return { ...base, report }
}
