import {
  createRunEvent,
  createToolRetryEvent,
  type AgentRunEvent,
} from "./run-events";
import {
  planPaidTool,
  type PaidToolExecutorCapability,
  type PaidToolPolicy,
  type PaidToolReceipt,
  type PaidToolRequest,
} from "@/control-protocol/paid-tool-contract";
import type {
  DesktopToolExecutionResult,
  ToolExecutorRegistry,
} from "@/services/desktop-tool-executor";
import type { ToolDurabilityStore } from './tool-durability'

export interface DesktopToolLoopRequest {
  readonly runId: string;
  readonly toolCallId: string;
  readonly requestId: string;
  readonly label: string;
  readonly stepId?: string;
  readonly expectedRevision: number;
  readonly request: PaidToolRequest;
  readonly capabilityLeaseId?: string;
  readonly requestDigest?: string;
}

export interface DesktopToolLoopDependencies {
  readonly executors: ToolExecutorRegistry;
  readonly currentRevision: () => number;
  readonly policy: () => PaidToolPolicy;
  /** One callback is one durable transaction. */
  readonly append: (events: readonly AgentRunEvent[]) => void;
  readonly now?: () => number;
  readonly id?: () => string;
  readonly timeoutMs?: number;
  /** Optional durable request/attempt ledger and event outbox for desktop hosts. */
  readonly durability?: ToolDurabilityStore;
  /** Issues a short-lived capability lease only after this attempt has an
   * actual approval event. Retries therefore receive a fresh, request-bound
   * lease instead of replaying the previous attempt's authority. */
  readonly authorize?: (
    input: DesktopToolLoopRequest,
    approvalId: string,
  ) => Promise<{ readonly capabilityLeaseId: string; readonly requestDigest: string }>;
}

export interface DesktopToolLoop {
  request(input: DesktopToolLoopRequest): Promise<void>;
  approve(toolCallId: string, requestId: string): Promise<void>;
  deny(toolCallId: string, requestId: string, reason?: string): void;
  cancel(toolCallId: string, requestId?: string): void;
  retry(toolCallId: string, previousRequestId?: string): Promise<string | null>;
  settled(
    toolCallId: string,
    requestId?: string,
  ): Promise<DesktopToolExecutionResult>;
}

interface PendingCall {
  input: DesktopToolLoopRequest;
  capability?: PaidToolExecutorCapability;
  controller?: AbortController;
  state: "approval" | "running" | "settled";
  result: Promise<DesktopToolExecutionResult>;
  resolve: (result: DesktopToolExecutionResult) => void;
}

export function createDesktopToolLoop(
  dependencies: DesktopToolLoopDependencies,
): DesktopToolLoop {
  const now = dependencies.now ?? Date.now;
  const id = dependencies.id ?? (() => crypto.randomUUID());
  const calls = new Map<string, PendingCall>();
  const requestIds = new Set<string>();

  const append = (events: readonly AgentRunEvent[]) => {
    if (events.length) dependencies.append(events);
  };

  async function execute(
    call: PendingCall,
    approvalGranted: boolean,
  ): Promise<void> {
    if (call.state === "settled") return;
    const plan = planPaidTool(
      call.input.request,
      call.capability,
      dependencies.policy(),
      approvalGranted,
    );
    if (!plan.executable) {
      call.state = "settled";
      const result = loopFailure(
        call.input,
        plan.reason ?? "Tool execution is not authorized.",
        now(),
      );
      append(result.events);
      call.resolve(result);
      return;
    }
    if (dependencies.currentRevision() !== call.input.expectedRevision) {
      call.state = "settled";
      const result = loopFailure(
        call.input,
        `Expected revision ${call.input.expectedRevision}, current revision is ${dependencies.currentRevision()}.`,
        now(),
      );
      append(result.events);
      call.resolve(result);
      return;
    }
    call.state = "running";
    const attemptId = `attempt:${call.input.requestId}:${now()}`
    await dependencies.durability?.begin(call.input.requestId, attemptId, now())
    call.controller = new AbortController();
    let result: DesktopToolExecutionResult;
    try {
      const authorization = dependencies.authorize
        ? await dependencies.authorize(
            call.input,
            `event:${call.input.requestId}:tool-approved`,
          )
        : {};
      result = await withDeadline(
        dependencies.executors.execute({
          ...call.input,
          ...authorization,
          approvalGranted,
          policy: dependencies.policy(),
          signal: call.controller.signal,
        }),
        call.controller,
        dependencies.timeoutMs ?? 600_000,
      );
    } catch (error) {
      result = loopFailure(call.input, safeExecutionError(error), now());
    }
    const invalid = validateExecutionResult(call, result);
    if (invalid)
      result = result.receipt
        ? { ok: false, error: invalid, receipt: result.receipt, events: [] }
        : loopFailure(call.input, invalid, now());
    const currentRevision = dependencies.currentRevision();
    if (currentRevision !== call.input.expectedRevision) {
      result = result.receipt
        ? {
            ok: false,
            error: `Result discarded because revision changed from ${call.input.expectedRevision} to ${currentRevision}.`,
            receipt: result.receipt,
            events: [],
          }
        : loopFailure(
            call.input,
            `Result discarded because revision changed from ${call.input.expectedRevision} to ${currentRevision}.`,
            now(),
          );
    }
    call.state = "settled";
    const events = withReceipt(result, call.input)
    if (dependencies.durability) {
      await dependencies.durability.settle(call.input.requestId, attemptId, {
        status: result.ok ? 'succeeded' : result.receipt?.status === 'cancelled' ? 'cancelled' : 'failed',
        ...(result.receipt ? { receipt: result.receipt } : {}),
        ...(!result.ok ? { error: result.error } : {}), at: result.receipt?.completedAt ?? now(),
      }, events)
      await dependencies.durability.drainEvents(append)
    } else append(events)
    call.resolve(result);
  }

  return {
    async request(input) {
      if (requestIds.has(input.requestId)) return;
      requestIds.add(input.requestId);
      if (dependencies.durability) {
        await dependencies.durability.recover()
        const durable = await dependencies.durability.plan({ requestId: input.requestId, runId: input.runId, toolCallId: input.toolCallId, capability: input.request.capability, at: now() })
        if (durable.duplicate && durable.request.status === 'succeeded') {
          const receipt = durable.request.attempts.findLast((attempt) => attempt.status === 'succeeded')?.receipt as PaidToolReceipt | undefined
          if (receipt) {
            const result = Promise.resolve({ ok: true, receipt, events: [] } as DesktopToolExecutionResult)
            calls.set(input.toolCallId, { input, state: 'settled', result, resolve: () => undefined })
            return
          }
        }
        if (durable.duplicate && ['in-flight', 'reconciling'].includes(durable.request.status)) return
      }
      const executor = await dependencies.executors.executor(
        input.request.capability,
      );
      const capability = (await executor?.capabilities())?.find(
        (item) =>
          item.capability === input.request.capability &&
          (!input.request.providerId ||
            item.providerId === input.request.providerId) &&
          (!input.request.model || item.model === input.request.model),
      );
      const plan = planPaidTool(
        input.request,
        capability,
        dependencies.policy(),
        false,
      );
      let resolve!: (result: DesktopToolExecutionResult) => void;
      const result = new Promise<DesktopToolExecutionResult>((done) => {
        resolve = done;
      });
      const call: PendingCall = {
        input,
        capability,
        state: "approval",
        result,
        resolve,
      };
      calls.set(input.toolCallId, call);
      const requested = createRunEvent(
        input.runId,
        {
          type: "tool-approval-requested",
          toolCallId: input.toolCallId,
          requestId: input.requestId,
          tool: input.request.capability,
          label: input.label,
          stepId: input.stepId,
          model: capability
            ? { providerId: capability.providerId, model: capability.model }
            : undefined,
          estimatedCost: capability?.estimatedCost ?? {
            currency: input.request.budgetCeiling.currency,
            amount: 0,
          },
          budgetCeiling: input.request.budgetCeiling,
          approvalPolicy: input.request.approvalPolicy,
          reason: plan.executable
            ? "Eligible for automatic approval within budget."
            : (plan.reason ?? "Explicit approval is required."),
          pendingApproval: !(plan.executable && Boolean(capability)),
        },
        {
          eventId: `event:${input.requestId}:tool-approval-requested`,
          at: now(),
        },
      );
      if (dependencies.currentRevision() !== input.expectedRevision) {
        call.state = "settled";
        const failure = loopFailure(
          input,
          `Expected revision ${input.expectedRevision}, current revision is ${dependencies.currentRevision()}.`,
          now(),
        );
        append([requested, ...failure.events]);
        call.resolve(failure);
        return;
      }
      if (plan.executable && capability) {
        append([
          requested,
          createRunEvent(
            input.runId,
            {
              type: "tool-approved",
              toolCallId: input.toolCallId,
              requestId: input.requestId,
              reason: "Automatically approved within the configured budget.",
            },
            { eventId: `event:${input.requestId}:tool-approved`, at: now() },
          ),
        ]);
        await execute(call, false);
        return;
      }
      append([requested]);
    },
    async approve(toolCallId, requestId) {
      const call = calls.get(toolCallId);
      if (
        !call ||
        call.input.requestId !== requestId ||
        call.state !== "approval"
      )
        return;
      append([
        createRunEvent(
          call.input.runId,
          {
            type: "tool-approved",
            toolCallId,
            requestId,
            reason: "Approved by user.",
          },
          { eventId: `event:${requestId}:tool-approved`, at: now() },
        ),
      ]);
      await execute(call, true);
    },
    deny(toolCallId, requestId, reason = "Denied by user.") {
      const call = calls.get(toolCallId);
      if (
        !call ||
        call.input.requestId !== requestId ||
        call.state !== "approval"
      )
        return;
      call.state = "settled";
      append([
        createRunEvent(
          call.input.runId,
          { type: "tool-denied", toolCallId, requestId, reason },
          { eventId: `event:${requestId}:tool-denied`, at: now() },
        ),
        createRunEvent(
          call.input.runId,
          {
            type: "tool-cancelled",
            toolCallId,
            tool: call.input.request.capability,
            label: call.input.label,
            stepId: call.input.stepId,
            detail: reason,
          },
          { eventId: `event:${requestId}:tool-cancelled`, at: now() },
        ),
      ]);
      call.resolve(loopFailure(call.input, reason, now()));
    },
    cancel(toolCallId, requestId) {
      const call = calls.get(toolCallId);
      if (
        !call ||
        (requestId && call.input.requestId !== requestId) ||
        call.state === "settled"
      )
        return;
      if (call.state === "approval") {
        this.deny(toolCallId, call.input.requestId, "Cancelled by user.");
        return;
      }
      call.controller?.abort();
    },
    async retry(toolCallId, previousRequestId) {
      const previous = calls.get(toolCallId);
      if (
        !previous ||
        previous.state !== "settled" ||
        (previousRequestId && previous.input.requestId !== previousRequestId)
      )
        return null;
      const requestId = id();
      const input = {
        ...previous.input,
        requestId,
        expectedRevision: dependencies.currentRevision(),
      };
      const retryEvent = createToolRetryEvent(
        input.runId,
        toolCallId,
        previous.input.requestId,
        {
          requestId,
          eventId: `event:${requestId}:tool-retry-linked`,
          at: now(),
        },
      );
      append([retryEvent]);
      await this.request(input);
      return requestId;
    },
    async settled(toolCallId, requestId) {
      const call = calls.get(toolCallId);
      if (!call || (requestId && call.input.requestId !== requestId)) {
        return loopFailure(
          {
            runId: "unknown",
            toolCallId,
            requestId: requestId ?? "unknown",
            label: "Tool",
            expectedRevision: dependencies.currentRevision(),
            request: {
              capability: "generate-image",
              intent: "Unknown tool call",
              inputArtifactIds: [],
              budgetCeiling: { currency: "USD", amount: 0 },
              approvalPolicy: "explicit",
            },
          },
          "The tool call is unavailable.",
          now(),
        );
      }
      return call.result;
    },
  };
}

function loopFailure(
  input: DesktopToolLoopRequest,
  detail: string,
  at: number,
): DesktopToolExecutionResult {
  return {
    ok: false,
    error: detail,
    events: [terminalFailure(input, detail, at)],
  };
}

function terminalFailure(
  input: DesktopToolLoopRequest,
  detail: string,
  at: number,
): AgentRunEvent {
  return createRunEvent(
    input.runId,
    {
      type: "tool-failed",
      toolCallId: input.toolCallId,
      tool: input.request.capability,
      label: input.label,
      stepId: input.stepId,
      detail,
    },
    { eventId: `event:${input.requestId}:tool-failed`, at },
  );
}

function withReceipt(
  result: DesktopToolExecutionResult,
  input: DesktopToolLoopRequest,
): readonly AgentRunEvent[] {
  const events =
    result.events.length > 0
      ? [...result.events]
      : result.ok
        ? [
            createRunEvent(
              input.runId,
              {
                type: "tool-succeeded",
                toolCallId: input.toolCallId,
                tool: input.request.capability,
                label: input.label,
                stepId: input.stepId,
                outputRefs: result.receipt.outputArtifactIds,
                receipt: result.receipt,
              },
              {
                eventId: `event:${input.requestId}:tool-succeeded`,
                at: result.receipt.completedAt,
              },
            ),
          ]
        : [
            terminalFailure(
              input,
              result.error,
              result.receipt?.completedAt ?? Date.now(),
            ),
          ];
  if (
    !result.receipt ||
    events.some((event) => event.type === "tool-receipt-recorded")
  )
    return events;
  return [
    ...events,
    createRunEvent(
      input.runId,
      {
        type: "tool-receipt-recorded",
        toolCallId: input.toolCallId,
        receipt: result.receipt,
      },
      {
        eventId: `event:${input.requestId}:tool-receipt-recorded`,
        at: result.receipt.completedAt,
      },
    ),
  ];
}

function validateExecutionResult(
  call: PendingCall,
  result: DesktopToolExecutionResult,
): string | undefined {
  const receipt = result.receipt;
  if (!receipt)
    return result.ok ? "Executor succeeded without a receipt." : undefined;
  if (receipt.requestId !== call.input.requestId)
    return "Executor receipt belongs to a different request.";
  if (receipt.capability !== call.input.request.capability)
    return "Executor receipt capability does not match the approved request.";
  if (
    call.capability &&
    (receipt.providerId !== call.capability.providerId ||
      receipt.model !== call.capability.model)
  )
    return "Executor receipt provider or model does not match the routed capability.";
  const ceiling = call.input.request.budgetCeiling;
  if (
    receipt.charged.currency !== ceiling.currency ||
    receipt.charged.amount > ceiling.amount ||
    (receipt.charged.credits !== undefined &&
      ceiling.credits !== undefined &&
      receipt.charged.credits > ceiling.credits)
  )
    return "Executor charge exceeds the approved budget ceiling.";
  return undefined;
}

async function withDeadline<T>(
  promise: Promise<T>,
  controller: AbortController,
  timeoutMs: number,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("Provider deadline exceeded.");
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Provider deadline exceeded."));
    }, timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function safeExecutionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/deadline|timed?\s*out/i.test(message))
    return "Provider deadline exceeded.";
  if (/cancel|abort/i.test(message)) return "Provider execution cancelled.";
  if (/429|rate.?limit/i.test(message)) return "Provider rate limit exceeded.";
  if (/5\d\d|temporar|unavailable/i.test(message))
    return "Provider is temporarily unavailable.";
  return "Provider execution failed.";
}
