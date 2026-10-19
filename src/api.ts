import type { ToolCheck } from "@reeve/connectors";
import type { CardChange, RunImpact } from "@reeve/core/revision";
import type { GenericOperationRecord, JobResults, OperationRecord, PackId, Receipt, RuleCard, Rulebook, RulebookIssue, SimEvent, Verdict } from "@reeve/core";
import type { RailInfo } from "@reeve/rails";

export type { GenericOperationRecord, OperationRecord, PackId, RailInfo, RuleCard, SimEvent, ToolCheck, Verdict };

export interface DatasetSummary {
  id: string;
  name: string;
  count: number;
  fields: { name: string; type: "number" | "text" | "date"; values?: string[] }[];
}

export interface RulebookRecord {
  id: string;
  sop: string;
  rulebook: Rulebook;
  issues: RulebookIssue[];
  provider: string;
  status: "draft" | "audited" | "approved" | "superseded";
  createdAt: string;
  parentId?: string;
  supersededBy?: string;
  /** Ids of the versions this one revises, nearest first. */
  lineage?: string[];
  diff?: CardChange[];
  impact?: RunImpact | null;
  datasetId?: string;
  toolChecks?: ToolCheck[];
  lastRunId?: string;
  approval?: { at: string; credentialId: string; receiptHash: string; ledgerSeq: number };
}

export interface RunRecord {
  id: string;
  rulebookId: string;
  injectBug: boolean;
  status: "queued" | "running" | "done" | "error";
  backend?: string;
  sandboxId?: string;
  log: { ms: number; line: string }[];
  rulesPy?: string;
  verdict?: Verdict;
  results?: JobResults | null;
  receipt?: Receipt;
  ledgerSeq?: number;
  error?: string;
}

export interface LedgerView {
  intact: boolean;
  merkleRoot: string | null;
  entries: ({ kind: "receipt" | "anchor" | "approval" | "operation"; seq: number; at: string; entry_hash: string } & Record<string, unknown>)[];
}

export interface PackInfo {
  id: PackId;
  domain: string;
  example: string;
  entity: { one: string; many: string };
}

/** An SOP parser the server offers. Keys stay on the server; `setup` names what is missing. */
export interface ProviderInfo {
  id: string;
  label: string;
  vendor: string;
  model: string | null;
  price: string;
  note: string;
  available: boolean;
  setup?: string;
}

export interface Health {
  llm: string;
  sandbox: string;
  passkeys: number;
  ledgerIntact: boolean;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const api = {
  health: () => call<Health>("GET", "/health"),
  defaultSop: (pack: PackId) => call<{ sop: string }>("GET", `/fixtures/sop?pack=${pack}`),
  packs: () => call<PackInfo[]>("GET", "/packs"),
  providers: () => call<{ default: string; providers: ProviderInfo[] }>("GET", "/providers"),
  compile: (text: string, pack: PackId, provider: string, datasetId?: string) => call<RulebookRecord>("POST", "/sops", { text, pack, provider, datasetId }),
  datasets: () => call<DatasetSummary[]>("GET", "/datasets"),
  uploadDataset: (name: string, csv: string) => call<DatasetSummary>("POST", "/datasets", { name, csv }),
  datasetFromApp: (name: string, tool: string, args: Record<string, unknown>) => call<DatasetSummary>("POST", "/datasets/connector", { name, tool, args }),
  connectors: () => call<{ id: string; kind: string; label: string }[]>("GET", "/connectors"),
  heldApproveOptions: (id: string, hid: string) => call<{ options: Record<string, unknown> }>("POST", `/operations/${id}/held/${hid}/approve/options`),
  heldApproveVerify: (id: string, hid: string, response: unknown) => call<GenericOperationRecord>("POST", `/operations/${id}/held/${hid}/approve/verify`, { response }),
  heldDecline: (id: string, hid: string) => call<GenericOperationRecord>("POST", `/operations/${id}/held/${hid}/decline`),
  rulebook: (id: string) => call<RulebookRecord>("GET", `/rulebooks/${id}`),
  rulebooks: () => call<Omit<RulebookRecord, "sop">[]>("GET", "/rulebooks"),
  startRun: (id: string, injectBug: boolean) => call<RunRecord>("POST", `/rulebooks/${id}/runs`, { injectBug }),
  run: (id: string) => call<RunRecord>("GET", `/runs/${id}`),
  ledger: () => call<LedgerView>("GET", "/ledger"),
  anchorInfo: () => call<{ configured: boolean; chain?: string; address?: string; explorer?: string | null; setup?: string }>("GET", "/anchor"),
  anchorNow: () => call<{ seq: number; tx?: string; explorer?: string }>("POST", "/ledger/anchor"),
  verifyAnchor: (seq: number) => call<{ seq: number; local: boolean; onChain: { ok: boolean; reason?: string } | null; explorer?: string; reason?: string }>("GET", `/ledger/anchors/${seq}/verify`),
  passkeys: () => call<{ registered: boolean; count: number }>("GET", "/passkeys"),
  registerOptions: () => call<Record<string, unknown>>("POST", "/passkeys/register/options"),
  registerVerify: (response: unknown) => call<{ registered: boolean }>("POST", "/passkeys/register/verify", { response }),
  approveOptions: (id: string) => call<{ options: Record<string, unknown>; receiptHash: string }>("POST", `/rulebooks/${id}/approve/options`),
  approveVerify: (id: string, response: unknown) => call<RulebookRecord>("POST", `/rulebooks/${id}/approve/verify`, { response }),
  revise: (id: string, body: { text?: string; rulebook?: Rulebook; provider?: string }) => call<RulebookRecord>("POST", `/rulebooks/${id}/revisions`, body),
  upgradeOperation: (id: string) => call<OperationRecord>("POST", `/operations/${id}/upgrade`),
  rails: () => call<RailInfo[]>("GET", "/rails"),
  operations: () => call<(OperationRecord | GenericOperationRecord)[]>("GET", "/operations"),
  operation: (id: string) => call<OperationRecord>("GET", `/operations/${id}`),
  genericOperation: (id: string) => call<GenericOperationRecord>("GET", `/operations/${id}`),
  startGeneric: (rulebookId: string) => call<GenericOperationRecord>("POST", `/rulebooks/${rulebookId}/operations`, {}),
  advanceGeneric: (id: string, to: string) => call<GenericOperationRecord>("POST", `/operations/${id}/advance`, { to }),
  startOperation: (rulebookId: string, rail: string) => call<OperationRecord>("POST", `/rulebooks/${rulebookId}/operations`, { rail }),
  advance: (id: string, to: string) => call<OperationRecord>("POST", `/operations/${id}/advance`, { to }),
  refreshOperation: (id: string) => call<{ paid: number; operation: OperationRecord }>("POST", `/operations/${id}/refresh`),
  simulatePayment: (id: string, invoiceId: string) => call<OperationRecord>("POST", `/operations/${id}/invoices/${invoiceId}/simulate-payment`),
  transfer: (id: string, tenant: string, amount: number) => call<OperationRecord>("POST", `/operations/${id}/transfers`, { tenant, amount }),
  keepCredit: (id: string, exId: string) => call<OperationRecord>("POST", `/operations/${id}/exceptions/${exId}/keep`),
  refund: (id: string, exId: string) => call<OperationRecord>("POST", `/operations/${id}/exceptions/${exId}/refund`),
  refundOptions: (id: string, exId: string) => call<{ options: Record<string, unknown>; amount: number }>("POST", `/operations/${id}/exceptions/${exId}/refund/options`),
  refundVerify: (id: string, exId: string, response: unknown) => call<OperationRecord>("POST", `/operations/${id}/exceptions/${exId}/refund/verify`, { response }),
};
