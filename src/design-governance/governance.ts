import {
  computedStyleFactSchema,
  governanceReceiptSchema,
  governanceRepairTaskSchema,
  governanceScenarioSchema,
  promotionTargetSchema,
  tokenUsageBindingSchema,
  type ComputedStyleFact,
  type GovernanceReceipt,
  type GovernanceScenario,
  type PromotionTarget,
} from "./contracts";
import { normalizeSrgb, parseCssColor } from "./color";
import { sha256 } from "js-sha256";

type Rgba = { r: number; g: number; b: number; a: number };
export function parseColor(value: string): Rgba {
  const input = /^rgba?\(/i.test(value.trim())
    ? value.trim()
    : normalizeSrgb(parseCssColor(value));
  const match = input.match(
    /^rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*\.?\d+))?\)$/i,
  );
  if (!match) throw new Error(`Unsupported computed color: ${value}`);
  return {
    r: +match[1],
    g: +match[2],
    b: +match[3],
    a: match[4] === undefined ? 1 : +match[4],
  };
}
export function composite(foreground: Rgba, background: Rgba): Rgba {
  const a = foreground.a + background.a * (1 - foreground.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r:
      (foreground.r * foreground.a +
        background.r * background.a * (1 - foreground.a)) /
      a,
    g:
      (foreground.g * foreground.a +
        background.g * background.a * (1 - foreground.a)) /
      a,
    b:
      (foreground.b * foreground.a +
        background.b * background.a * (1 - foreground.a)) /
      a,
    a,
  };
}
export function effectiveBackground(layers: readonly string[]): Rgba {
  return layers
    .map(parseColor)
    .reduceRight((back, front) => composite(front, back), {
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
}
function luminance(color: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(color.r) +
    0.7152 * channel(color.g) +
    0.0722 * channel(color.b)
  );
}
export function contrastRatio(
  foreground: string,
  backgrounds: readonly string[],
): number {
  const bg = effectiveBackground(backgrounds);
  const fg = composite(parseColor(foreground), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

export function enumerateGovernanceScenarios(
  bindingsInput: readonly unknown[],
  knownTokenIds: ReadonlySet<string>,
): GovernanceScenario[] {
  return bindingsInput.flatMap((raw) => {
    const binding = tokenUsageBindingSchema.parse(raw);
    for (const id of [binding.foregroundTokenId, binding.backgroundTokenId])
      if (!knownTokenIds.has(id))
        throw new Error(`Unknown Design IR token ${id}.`);
    const { modes, states, ...base } = binding;
    return modes.flatMap((mode) =>
      states.map((state) =>
        governanceScenarioSchema.parse({
          ...base,
          scenarioId: `${binding.id}:${mode}:${state}`,
          mode,
          state,
        }),
      ),
    );
  });
}

export function evaluateGovernance(
  scenariosInput: readonly GovernanceScenario[],
  factsInput: readonly ComputedStyleFact[],
  now = Date.now(),
): GovernanceReceipt {
  const scenarios = scenariosInput
    .map((v) => governanceScenarioSchema.parse(v))
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  const facts = factsInput
    .map((v) => computedStyleFactSchema.parse(v))
    .map((fact) => ({
      ...fact,
      axeViolations: [...fact.axeViolations].sort((a, b) =>
        `${a.id}:${a.impact}`.localeCompare(`${b.id}:${b.impact}`),
      ),
    }))
    .sort((a, b) =>
      `${a.scenarioId}:${a.viewport}`.localeCompare(
        `${b.scenarioId}:${b.viewport}`,
      ),
    );
  const findings: any[] = [];
  for (const scenario of scenarios) {
    const matching = facts.filter(
      (fact) => fact.scenarioId === scenario.scenarioId,
    );
    if (!matching.length) {
      findings.push(
        finding(
          scenario,
          "browser-evidence",
          "hard",
          false,
          "Computed browser evidence is missing.",
          {},
        ),
      );
      continue;
    }
    for (const fact of matching) {
      if (scenario.kind === "text") {
        const ratio = contrastRatio(fact.foreground, fact.backgroundLayers);
        const large =
          fact.fontSizePx >= 24 ||
          (fact.fontSizePx >= 18.66 && fact.fontWeight >= 700);
        const minimum = large ? 3 : 4.5;
        findings.push(
          finding(
            scenario,
            "text-contrast",
            "hard",
            ratio >= minimum,
            `Text contrast ${ratio.toFixed(2)}:1; required ${minimum}:1.`,
            { ratio, minimum, viewport: fact.viewport },
          ),
        );
      }
      if (scenario.kind === "ui-boundary") {
        const ratio = contrastRatio(
          fact.borderColor ?? fact.foreground,
          fact.backgroundLayers,
        );
        findings.push(
          finding(
            scenario,
            "ui-boundary-contrast",
            "hard",
            ratio >= 3,
            `UI boundary contrast ${ratio.toFixed(2)}:1; required 3:1.`,
            { ratio, viewport: fact.viewport },
          ),
        );
      }
      if (scenario.kind === "focus-indicator") {
        const visible =
          fact.outlineWidthPx >= 2 &&
          contrastRatio(
            fact.outlineColor ?? fact.foreground,
            fact.backgroundLayers,
          ) >= 3;
        findings.push(
          finding(
            scenario,
            "focus-visible",
            "hard",
            visible,
            visible
              ? "Focus indicator is visible."
              : "Focus indicator is not sufficiently visible.",
            { outlineWidthPx: fact.outlineWidthPx, viewport: fact.viewport },
          ),
        );
      }
      if (scenario.kind === "color-only")
        findings.push(
          finding(
            scenario,
            "color-only",
            "hard",
            fact.nonColorCue,
            fact.nonColorCue
              ? "A non-color cue is present."
              : "Meaning is conveyed by color alone.",
            { viewport: fact.viewport },
          ),
        );
      for (const violation of fact.axeViolations) {
        const severity =
          violation.impact === "critical" || violation.impact === "serious"
            ? "hard"
            : "advisory";
        findings.push(
          finding(
            scenario,
            `axe:${violation.id}`,
            severity,
            false,
            `axe reported ${violation.id}.`,
            { impact: violation.impact, viewport: fact.viewport },
          ),
        );
      }
    }
  }
  findings.sort(
    (a, b) =>
      a.id.localeCompare(b.id) ||
      String(a.evidence.viewport ?? "").localeCompare(
        String(b.evidence.viewport ?? ""),
      ),
  );
  const payload = JSON.stringify({ scenarios, facts, findings });
  const evidenceHash = sha256(payload);
  const blocked = findings.some(
    (f) => f.severity === "hard" && f.status === "failed",
  );
  const advisory = findings.some(
    (f) => f.severity === "advisory" && f.status === "failed",
  );
  return governanceReceiptSchema.parse({
    version: "cutout.design-governance-receipt.v1",
    receiptId: `governance:${evidenceHash.slice(0, 16)}`,
    createdAt: now,
    status: blocked ? "blocked" : advisory ? "advisory" : "passed",
    findings,
    evidenceHash,
  });
}
function finding(
  scenario: GovernanceScenario,
  rule: string,
  severity: "hard" | "advisory",
  passed: boolean,
  summary: string,
  evidence: Record<string, unknown>,
) {
  return {
    id: `${scenario.scenarioId}:${rule}`,
    scenarioId: scenario.scenarioId,
    rule,
    severity,
    status: passed ? "passed" : "failed",
    summary,
    evidence,
  };
}

export function assertGovernancePromotion(
  receiptInput: unknown,
  targetInput: PromotionTarget,
): GovernanceReceipt {
  const target = promotionTargetSchema.parse(targetInput);
  const receipt = governanceReceiptSchema.parse(receiptInput);
  if (receipt.status === "blocked")
    throw new Error(
      `${target} promotion blocked by Design Governance hard failures.`,
    );
  return receipt;
}
export function createGovernanceRepairTask(
  receiptInput: unknown,
  scenariosInput: readonly GovernanceScenario[],
) {
  const receipt = governanceReceiptSchema.parse(receiptInput);
  const failed = receipt.findings.filter(
    (f) => f.status === "failed" && f.severity === "hard",
  );
  if (!failed.length)
    throw new Error("No failed hard governance findings to repair.");
  const ids = [...new Set(failed.map((f) => f.scenarioId))].sort();
  const scenarios = scenariosInput.filter((s) => ids.includes(s.scenarioId));
  const touchesBrandLock = scenarios.some(
    (s) =>
      s.lockedTokenIds.includes(s.foregroundTokenId) ||
      s.lockedTokenIds.includes(s.backgroundTokenId),
  );
  return governanceRepairTaskSchema.parse({
    version: "cutout.design-governance-repair.v1",
    taskId: `repair:${receipt.receiptId}`,
    receiptId: receipt.receiptId,
    failedFindingIds: failed.map((f) => f.id).sort(),
    scenarioIds: ids,
    touchesBrandLock,
    requiresHumanApproval: touchesBrandLock,
  });
}

export async function rerunGovernanceRepair(
  taskInput: unknown,
  options: {
    approvalId?: string;
    repair(task: unknown): Promise<{ receiptRef: string }>;
    rerun(): Promise<GovernanceReceipt>;
  },
) {
  const task = governanceRepairTaskSchema.parse(taskInput);
  if (task.requiresHumanApproval && !options.approvalId)
    return { status: "approval-required" as const, task };
  const repair = await options.repair({
    ...task,
    approvalId: options.approvalId,
  });
  const governance = governanceReceiptSchema.parse(await options.rerun());
  return {
    status:
      governance.status === "blocked"
        ? ("failed" as const)
        : ("repaired" as const),
    task: { ...task, approvalId: options.approvalId },
    repairReceiptRef: repair.receiptRef,
    governance,
  };
}
