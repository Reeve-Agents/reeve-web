// A Rapor Usaha the owner shared (?view=rapor&share=<token>): metrics only, no decision text and no
// tenant names. The page recomputes the ledger hashes and the anchor Merkle roots in the browser,
// so the reader does not have to trust Reeve's server. Public; the owner can revoke the link.
import { useEffect, useState } from "react";
import "../explain/explain.css";
import "./rapor.css";
import { type BundleCheck, type LedgerEntry, verifyBundle } from "./verify";

type Lang = "id" | "en";

interface Shared {
  share: { created_at: string; label?: string; receipt: string };
  rapor: {
    workspace: string;
    generated_at: string;
    period: { from: string; to: string };
    ledger_intact: boolean;
    totals: { decisions: number; verified: number; tampered: number; anchored: number; by_agent: Record<string, number>; by_action: Record<string, number> };
    usaha: Record<string, number | { count: number; amount_idr: number }>;
    tokens: { llm_input: number; llm_output: number; context_tokens_saved: number; lookups: number; worker_calls: number };
  };
  traces: { receipt: string; verified: boolean }[];
  ledger: LedgerEntry[];
  anchor_format: { calldata: string; magic: string; note: string };
}

const T = {
  title: ["Rapor Usaha", "Business report"],
  shared: ["Dibagikan pemilik", "Shared by the owner"],
  only: ["Hanya angka. Tidak ada nama penghuni atau isi percakapan.", "Numbers only. No tenant names or conversation text."],
  usaha: ["Usaha", "Business"],
  crew: ["Kerja agen", "Agent work"],
  proof: ["Cek sendiri", "Check it yourself"],
  proofSub: ["Browser Anda menghitung ulang semua hash di bawah ini; server Reeve tidak perlu dipercaya.", "Your browser recomputes every hash below; you do not have to trust Reeve's server."],
  checking: ["Menghitung ulang…", "Recomputing…"],
  entries: ["Hash setiap baris ledger cocok", "Every ledger line's hash matches"],
  chain: ["Rantai hash utuh (tiap baris menunjuk baris sebelumnya)", "Hash chain intact (each line points to the one before)"],
  traces: ["Jejak di Meko cocok dengan receipt (dicek server)", "Meko traces match their receipts (checked by the server)"],
  anchor: ["Merkle root anchor dihitung ulang", "Anchor Merkle root recomputed"],
  noAnchor: ["Belum ada anchor. Pemilik menjalankan anchor ke Monad testnet sendiri.", "No anchor yet. The owner anchors to Monad testnet themselves."],
  local: ["hanya di ledger lokal, belum di chain", "local ledger only, not on chain yet"],
  calldata: ["Calldata yang harus ada di transaksi", "Calldata the transaction must carry"],
  match: ["Angka rapor vs keputusan di ledger", "Report numbers vs decisions in the ledger"],
  gone: ["Tautan ini tidak berlaku. Mungkin sudah dicabut pemilik.", "This link is not valid. The owner may have revoked it."],
} as const;

const tr = (p: readonly [string, string], l: Lang) => p[l === "id" ? 0 : 1];
const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const n = (v: unknown) => (typeof v === "number" ? v : 0);
const cnt = (v: unknown) => (v && typeof v === "object" ? (v as { count: number }).count : n(v));
const amt = (v: unknown) => (v && typeof v === "object" ? (v as { amount_idr: number }).amount_idr : 0);
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

const USAHA: [string, [string, string], (v: unknown) => string][] = [
  ["fees", ["Denda telat", "Late fees"], (v) => `${cnt(v)} · ${rp(amt(v))}`],
  ["exceptions_honoured", ["Izin pemilik dihormati", "Owner exceptions honoured"], (v) => String(n(v))],
  ["reminders", ["Pengingat bayar", "Payment reminders"], (v) => String(n(v))],
  ["deposits", ["Deposit ditagih", "Deposits billed"], (v) => `${cnt(v)} · ${rp(amt(v))}`],
  ["rooms_filled", ["Kamar terisi", "Rooms filled"], (v) => String(n(v))],
  ["replies_auto", ["Balasan otomatis", "Automatic replies"], (v) => String(n(v))],
  ["escalations", ["Diteruskan ke pemilik", "Sent to the owner"], (v) => String(n(v))],
  ["chats_from_content", ["Chat dari konten", "Chats from content"], (v) => String(n(v))],
  ["payment_plans", ["Cicilan", "Payment plans"], (v) => String(n(v))],
  ["explanations", ["Penjelasan ke penghuni", "Explanations to tenants"], (v) => String(n(v))],
];
/** Report counter -> the ledger action that backs it. */
const BACKED: [string, string, [string, string]][] = [
  ["fees", "charge_fee", ["Denda", "Fees"]],
  ["exceptions_honoured", "hold", ["Izin dihormati", "Exceptions"]],
  ["reminders", "remind", ["Pengingat", "Reminders"]],
  ["explanations", "explain", ["Penjelasan", "Explanations"]],
];

export function SharedRaporPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("share") ?? "";
  const [lang, setLang] = useState<Lang>(params.get("lang") === "en" ? "en" : "id");
  const [data, setData] = useState<Shared | null>(null);
  const [gone, setGone] = useState(false);
  const [check, setCheck] = useState<BundleCheck | null>(null);

  useEffect(() => {
    fetch(`/api/meko/public/shared/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as Shared;
        setData(d);
        setCheck(await verifyBundle(d.ledger));
      })
      .catch(() => setGone(true));
  }, [token]);

  const r = data?.rapor;
  return (
    <div className="jejak rapor">
      <header className="jejak-head">
        <span className="jejak-brand">Reeve</span>
        <button type="button" className="jejak-lang" onClick={() => setLang(lang === "id" ? "en" : "id")} aria-label="Bahasa / Language">
          {lang === "id" ? "EN" : "ID"}
        </button>
      </header>
      <main>
        <h1>{tr(T.title, lang)}</h1>
        {gone && <p className="jejak-verdict bad">{tr(T.gone, lang)}</p>}
        {data && r && (
          <>
            <p className="jejak-sub">
              {tr(T.shared, lang)}
              {data.share.label ? ` · ${data.share.label}` : ""} · {new Date(data.share.created_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}. {tr(T.only, lang)}
            </p>

            <h2>{tr(T.usaha, lang)}</h2>
            <ul className="rp-grid">
              {USAHA.map(([k, label, fmt]) => (
                <li key={k}>
                  <span className="rp-num">{fmt(r.usaha[k])}</span>
                  <span className="rp-label">{tr(label, lang)}</span>
                </li>
              ))}
            </ul>

            <h2>{tr(T.crew, lang)}</h2>
            <ul className="rp-grid">
              <li>
                <span className="rp-num">{r.totals.decisions}</span>
                <span className="rp-label">{lang === "id" ? "Keputusan tercatat" : "Decisions recorded"}</span>
              </li>
              <li>
                <span className="rp-num">{r.tokens.lookups}</span>
                <span className="rp-label">{lang === "id" ? "Cek ingatan sebelum bertindak" : "Memory lookups before acting"}</span>
              </li>
              <li>
                <span className="rp-num">{r.tokens.worker_calls}</span>
                <span className="rp-label">{lang === "id" ? "Panggilan AI" : "AI calls"}</span>
              </li>
              <li>
                <span className="rp-num">{(r.tokens.llm_input + r.tokens.llm_output).toLocaleString("id-ID")}</span>
                <span className="rp-label">Token</span>
              </li>
            </ul>

            <h2>{tr(T.proof, lang)}</h2>
            <p className="jejak-why">{tr(T.proofSub, lang)}</p>
            {!check ? (
              <p className="jejak-why">{tr(T.checking, lang)}</p>
            ) : (
              <div className="jejak-group">
                <Line ok={check.hashes_ok === check.entries}>
                  {tr(T.entries, lang)}: {check.hashes_ok}/{check.entries}
                </Line>
                <Line ok={check.chain_ok}>
                  {tr(T.chain, lang)}
                  {check.first_bad !== undefined ? ` (#${check.first_bad})` : ""}
                </Line>
                <Line ok={data.traces.every((t) => t.verified)}>
                  {tr(T.traces, lang)}: {data.traces.filter((t) => t.verified).length}/{data.traces.length}
                </Line>
                {BACKED.map(([k, action, label]) => {
                  const inReport = cnt(r.usaha[k]);
                  const inLedger = check.by_action[action] ?? 0;
                  return (
                    <Line key={k} ok={inReport === inLedger}>
                      {tr(T.match, lang)}: {tr(label, lang)} {inReport} = {inLedger} <code>{action}</code>
                    </Line>
                  );
                })}
                {check.anchors.length === 0 && <p className="jejak-line mute">{tr(T.noAnchor, lang)}</p>}
                {check.anchors.map((a) => (
                  <div key={a.seq}>
                    <Line ok={a.ok}>
                      {tr(T.anchor, lang)} #{a.seq}: {short(a.recomputed)} ({a.leaves} leaves){" "}
                      {a.tx && a.explorer ? (
                        <a href={a.explorer} target="_blank" rel="noreferrer">
                          {a.anchor} tx {short(a.tx)}
                        </a>
                      ) : (
                        <span className="rp-mute">· {tr(T.local, lang)}</span>
                      )}
                    </Line>
                    <p className="jejak-line mono">
                      {tr(T.calldata, lang)}: {a.calldata}
                    </p>
                  </div>
                ))}
                <p className="jejak-line mute">{data.anchor_format.note}</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Line({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className="jejak-line check">
      <span className={ok ? "yes" : "no"}>{ok ? "✓" : "✗"}</span> {children}
    </p>
  );
}
