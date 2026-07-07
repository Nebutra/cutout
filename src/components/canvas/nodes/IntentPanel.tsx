/**
 * IntentPanel (spec §6/§7) — renders the recognized, open-world
 * {@link IntentProfile} on the BriefNode so the AI's understanding is VISIBLE and
 * not a black box: the reconstructed goal, its self-derived strategy + rationale,
 * the mined dimensions and the assumptions it filled in. When the profile carries
 * clarifying `questions` (low confidence / out of scope), they render as prompts
 * and the panel makes clear that generation is PAUSED until the brief is refined.
 *
 * Presentational + calm/opaque per the project UI rule: a plain `bg-muted/40`
 * panel inside the already-opaque node card — no glass, no neon. All static copy
 * is localized; the mined values are model-authored free text shown verbatim.
 */
import { HelpCircle, Lightbulb } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import type { IntentProfile } from '@/dag/intent-types'
import { Badge } from '@/components/ui/badge'

export interface IntentPanelProps {
  readonly intent: IntentProfile
}

export function IntentPanel({ intent }: IntentPanelProps) {
  const confidencePct = Math.round(intent.confidence * 100)
  const hasQuestions = intent.questions.length > 0

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium">
          <Lightbulb className="size-3.5 text-muted-foreground" />
          <Trans id="intent.title">Understood intent</Trans>
        </span>
        <Badge variant="secondary" className="tabular-nums">
          <Trans id="intent.confidence">Confidence</Trans> {confidencePct}%
        </Badge>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          <Trans id="intent.goal">Goal</Trans>
        </span>
        <p className="text-foreground">{intent.goal}</p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          <Trans id="intent.strategy">Strategy</Trans>
        </span>
        <p className="font-medium text-foreground">{intent.strategy}</p>
        <p className="text-muted-foreground">{intent.rationale}</p>
      </div>

      {intent.dimensions.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            <Trans id="intent.dimensions">Dimensions</Trans>
          </span>
          <ul className="flex flex-col gap-0.5">
            {intent.dimensions.map((d) => (
              <li key={d.aspect} className="text-foreground">
                <span className="text-muted-foreground">{d.aspect}:</span> {d.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {intent.assumptions.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            <Trans id="intent.assumptions">Assumptions</Trans>
          </span>
          <ul className="list-disc pl-4 text-muted-foreground">
            {intent.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasQuestions ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <HelpCircle className="size-3.5 text-amber-600 dark:text-amber-500" />
            <Trans id="intent.questions_title">A quick clarification first</Trans>
          </span>
          <ul className="list-disc pl-4 text-muted-foreground">
            {intent.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            <Trans id="intent.questions_hint">
              Refine the brief above to answer these, then plan again.
            </Trans>
          </p>
        </div>
      ) : null}
    </div>
  )
}
