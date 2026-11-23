// Recomputes a shared Rapor's proof in the browser, without trusting Reeve's server: every ledger
// entry hash, the hash chain, and every anchor's Merkle root (same rules as @reeve/receipts).

export interface LedgerEntry {
  kind: string;
  seq: number;
  prev: string;
  entry_hash: string;
  receipt_hash?: string;
  merkle_root?: string;
  leaves?: number;
  anchor?: string;
  tx?: string;
  explorer?: string;
  chain_id?: number;
  action?: string;
  at?: string;
  [k: string]: unknown;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
const sha = async (data: Uint8Array) => hex(await crypto.subtle.digest("SHA-256", data as BufferSource));
const shaText = (s: string) => sha(new TextEncoder().encode(s));

export async function merkleRoot(leaves: string[]): Promise<string> {
  if (!leaves.length) return shaText("");
  let level = await Promise.all(leaves.map((l) => sha(bytes(l))));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i]!;
      const r = level[i + 1] ?? l;
      const pair = new Uint8Array(64);
      pair.set(bytes(l), 0);
      pair.set(bytes(r), 32);
      next.push(await sha(pair));
    }
    level = next;
  }
  return level[0]!;
}

export const anchorLeaves = (entries: LedgerEntry[]) => entries.flatMap((e) => (e.kind === "receipt" && e.receipt_hash ? [e.receipt_hash] : e.kind === "decision" ? [e.entry_hash] : []));

export interface BundleCheck {
  entries: number;
  hashes_ok: number;
  chain_ok: boolean;
  first_bad?: number;
  decisions: number;
  anchors: { seq: number; root: string; leaves: number; recomputed: string; ok: boolean; tx?: string; explorer?: string; anchor?: string; calldata: string }[];
  by_action: Record<string, number>;
}

/** Calldata an anchor transaction must carry: "REEVE1" + root + leaf count (uint32). */
export const anchorCalldata = (root: string, leaves: number) => `0x524545564531${root}${leaves.toString(16).padStart(8, "0")}`;

export async function verifyBundle(ledger: LedgerEntry[]): Promise<BundleCheck> {
  let prev = "genesis";
  let ok = 0;
  let chain = true;
  let first_bad: number | undefined;
  for (const e of ledger) {
    const { entry_hash, ...rest } = e;
    const good = (await shaText(canonicalJson(rest))) === entry_hash && e.prev === prev;
    if (good) ok++;
    else if (chain) {
      chain = false;
      first_bad = e.seq;
    }
    prev = entry_hash;
  }
  const anchors = [];
  for (const a of ledger.filter((e) => e.kind === "anchor")) {
    const leaves = anchorLeaves(ledger.filter((e) => e.seq < a.seq)).slice(0, a.leaves);
    const recomputed = await merkleRoot(leaves);
    anchors.push({ seq: a.seq, root: a.merkle_root ?? "", leaves: a.leaves ?? 0, recomputed, ok: recomputed === a.merkle_root, tx: a.tx, explorer: a.explorer, anchor: a.anchor, calldata: anchorCalldata(a.merkle_root ?? "", a.leaves ?? 0) });
  }
  const by_action: Record<string, number> = {};
  for (const e of ledger) if (e.kind === "decision" && e.action) by_action[e.action] = (by_action[e.action] ?? 0) + 1;
  return { entries: ledger.length, hashes_ok: ok, chain_ok: chain, first_bad, decisions: ledger.filter((e) => e.kind === "decision").length, anchors, by_action };
}
