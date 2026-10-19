import type { JobResults } from "@reeve/core";
import type { RulebookRecord, RunRecord } from "../api";

/**
 * Read-only sample of another business: the minimarket pack's real CreateOS run
 * (fixtures/minimarket). Loaded on demand with ?sample=minimarket so the default bundle stays small.
 */
export async function loadMinimarketSample(): Promise<{ record: RulebookRecord; run: RunRecord }> {
  const [rbMod, simMod] = await Promise.all([
    import("@reeve/core/fixtures/minimarket/rulebook.json"),
    import("@reeve/core/fixtures/minimarket/sim-events.json"),
  ]);
  const rulebook = rbMod.default as unknown as RulebookRecord["rulebook"];
  const sim = simMod.default;
  const record: RulebookRecord = {
    id: "sample-minimarket",
    sop: "",
    rulebook,
    issues: [],
    provider: "fixture",
    status: "audited",
    createdAt: "2026-10-18T00:00:00Z",
    lastRunId: sim.run_id,
  };
  const results = {
    builder_tests: { ran: sim.builder_tests.ran, failed: sim.builder_tests.failed, failures: [] },
    audit_spec: { ran: sim.audit_spec.ran, failed: sim.audit_spec.failed, failures: [] },
    mutation: { total: sim.mutation.total, killed: sim.mutation.killed, survivors: [] },
    constraints: { violations: [] },
    simulation: { events: sim.events, summary: sim.summary },
  } as unknown as JobResults;
  const run: RunRecord = {
    id: sim.run_id,
    rulebookId: record.id,
    injectBug: false,
    status: "done",
    backend: "createos",
    sandboxId: sim.sandbox,
    log: [],
    verdict: { status: "pass", mutation_score: sim.mutation.killed / sim.mutation.total, findings: [] },
    results,
    receipt: { receipt_hash: sim.receipt } as RunRecord["receipt"],
  };
  return { record, run };
}
