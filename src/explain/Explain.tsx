// "Jejak keputusan": explain one agent decision from its Meko trace, with the chain it came from
// and the proof that the trace was not changed. Public and read-only (pseudonymised demo data).
import { useEffect, useState } from "react";
import "./explain.css";

type Lang = "id" | "en";

interface Item {
  seq: number;
  at: string;
  agent: string;
  action?: string;
  subject?: string;
  run_id: string;
  receipt: string;
}

interface ChainItem extends Item {
  input?: string;
  output?: string;
  reasoning?: string;
  current: boolean;
}

interface Detail {
  decision: Item & { trace_hash: string; conversation_id: string; action_class?: string };
  trace: { input: string; output: string; reasoning?: string; plan?: string[]; seen: { query: string; memory: { id: string; text: string }[] }[]; usage: { model: string; input_tokens: number; output_tokens: number } | null } | null;
  verify: { ok: boolean; problem?: string; checks: { in_ledger: boolean; ledger_intact: boolean; message_found: boolean; trace_matches: boolean; anchored: { seq: number; merkle_root: string; tx?: string; explorer?: string; proof_ok: boolean } | null } };
  chain: ChainItem[];
  meko: { datapack: string; endpoint: string };
}

const API = "/api/meko/public";

const T = {
  title: ["Jejak keputusan", "Decision trace"],
  sub: ["Kenapa agen Reeve melakukan ini, dan bukti bahwa jejaknya tidak diubah.", "Why a Reeve agent did this, and proof that its trace was not changed."],
  list: ["Keputusan terbaru", "Recent decisions"],
  report: ["Rapor Usaha", "Business report"],
  back: ["Semua keputusan", "All decisions"],
  what: ["Yang diputuskan", "What was decided"],
  why: ["Alasannya (dari jejak di Meko)", "Reasoning (from the Meko trace)"],
  looked: ["Yang dicek dulu", "What it looked up first"],
  nothing: ["Tidak mencari apa pun sebelum memutuskan.", "Did not look anything up before deciding."],
  chain: ["Rantai dari SOP sampai keputusan", "Chain from the SOP to this decision"],
  proof: ["Bukti", "Proof"],
  ok: ["Terverifikasi: jejak di Meko cocok dengan receipt di ledger.", "Verified: the Meko trace matches its receipt in the ledger."],
  input: ["Masukan", "Input"],
  all: ["Semua", "All"],
  loading: ["Memuat…", "Loading…"],
  checks: {
    in_ledger: ["Receipt ada di ledger", "Receipt is in the ledger"],
    ledger_intact: ["Rantai hash ledger utuh", "Ledger hash chain intact"],
    message_found: ["Pesan ditemukan di Meko", "Message found in Meko"],
    trace_matches: ["Hash jejak cocok", "Trace hash matches"],
    anchored: ["Masuk Merkle root yang di-anchor", "Inside an anchored Merkle root"],
  },
} as const;

const AGENT: Record<string, [string, string]> = {
  builder: ["Builder", "Builder"],
  auditor: ["Auditor", "Auditor"],
  owner: ["Pemilik", "Owner"],
  operator: ["Operator", "Operator"],
  worker: ["Worker", "Worker"],
  validator: ["Validator", "Validator"],
  ask: ["Tanya usaha", "Ask the business"],
};

const ACTION: Record<string, [string, string]> = {
  charge_fee: ["Denda telat bayar", "Late fee"],
  hold: ["Denda ditahan (izin pemilik)", "Fee held (owner exception)"],
  remind: ["Pengingat bayar", "Payment reminder"],
  reply: ["Balas calon penghuni", "Reply to a prospect"],
  escalate: ["Diteruskan ke pemilik", "Sent to the owner"],
  ask_owner: ["Tanya pemilik dulu", "Asked the owner"],
  deposit_bill: ["Tagih deposit", "Deposit bill"],
  book_viewing: ["Jadwal survei", "Viewing booked"],
  contract_draft: ["Draf kontrak", "Contract draft"],
  accept_tenant: ["Penghuni diterima", "Tenant accepted"],
  publish: ["Terbit", "Published"],
  plan_content: ["Rencana konten", "Content plan"],
  measure: ["Ukur hasil", "Measured"],
  learn: ["Simpan pelajaran", "Lesson stored"],
  offer_plan: ["Tawaran cicilan", "Payment-plan offer"],
  explain: ["Penjelasan", "Explanation"],
  send_explanation: ["Kirim penjelasan", "Explanation sent"],
  grant_exception: ["Izin dari pemilik", "Owner exception granted"],
  compile: ["SOP disusun jadi aturan", "SOP compiled to rules"],
  compile_playbook: ["Playbook disusun", "Playbook compiled"],
  compile_bound: ["Batas cicilan disusun", "Payment bound compiled"],
  audit_pass: ["Lulus audit", "Audit passed"],
  audit_fail: ["Gagal audit", "Audit failed"],
  approve: ["Disetujui pemilik", "Approved by the owner"],
  approve_playbook: ["Playbook disetujui", "Playbook approved"],
  approve_bound: ["Batas cicilan disetujui", "Bound approved"],
  validator_pass: ["Lolos Validator", "Passed the Validator"],
  validator_fail: ["Ditolak Validator", "Rejected by the Validator"],
  review_approved: ["Disetujui pemilik", "Approved by the owner"],
  start_listing: ["Mulai iklan kamar", "Listing started"],
  stop_playbook: ["Playbook berhenti sendiri", "Playbook stopped itself"],
  draft: ["Draf ditulis", "Draft written"],
  rapor: ["Rapor dibuat", "Report generated"],
  mine_rules: ["Aturan ditemukan dari riwayat", "Rules mined from history"],
  replay_history: ["Riwayat diuji ulang", "History replayed"],
  replay_confirmed: ["Diuji ulang dengan aturan yang disetujui", "Replayed with confirmed rules"],
  confirm_rule: ["Aturan disetujui pemilik", "Rule confirmed by the owner"],
  reject_rule: ["Aturan ditolak pemilik", "Rule rejected by the owner"],
  compile_discovered: ["SOP dari riwayat disusun", "Discovered SOP compiled"],
  discovery_fallback: ["Tetap mode belajar", "Stays in learning mode"],
  share_rapor: ["Rapor dibagikan", "Report shared"],
  revoke_share: ["Tautan rapor dicabut", "Report link revoked"],
  review_approve: ["Draf disetujui pemilik", "Draft approved by the owner"],
  review_reject: ["Draf ditolak pemilik", "Draft rejected by the owner"],
  review_edit: ["Draf diubah dan disetujui pemilik", "Draft edited and approved by the owner"],
  autonomy_promote: ["Level otonomi dinaikkan atas persetujuan pemilik", "Autonomy level raised with the owner's consent"],
  override: ["Pemilik menurunkan level otonomi", "Owner lowered the autonomy level"],
  discovery_blocked: ["SOP ditahan sampai lolos uji", "SOP held until it passes"],
};

const label = (m: Record<string, [string, string]>, k: string | undefined, l: Lang) => (k && m[k] ? m[k][l === "id" ? 0 : 1] : (k ?? "-"));
const tr = (pair: readonly [string, string], l: Lang) => pair[l === "id" ? 0 : 1];
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

function pretty(json: string | undefined): string {
  if (!json) return "";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function ExplainPage() {
  const params = new URLSearchParams(window.location.search);
  const [lang, setLang] = useState<Lang>(params.get("lang") === "en" ? "en" : "id");
  const receipt = params.get("receipt");
  return (
    <div className="jejak">
      <header className="jejak-head">
        <a className="jejak-brand" href="/?view=jejak">
          Reeve
        </a>
        <button type="button" className="jejak-lang" onClick={() => setLang(lang === "id" ? "en" : "id")} aria-label="Bahasa / Language">
          {lang === "id" ? "EN" : "ID"}
        </button>
      </header>
      {receipt ? <One receipt={receipt} lang={lang} /> : <List lang={lang} />}
    </div>
  );
}

function List({ lang }: { lang: Lang }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<string>("");
  useEffect(() => {
    fetch(`${API}/decisions${agent ? `?agent=${agent}` : ""}`)
      .then((r) => r.json())
      .then((b: { decisions?: Item[]; error?: string }) => (b.error ? setError(b.error) : setItems(b.decisions ?? [])))
      .catch((e: Error) => setError(e.message));
  }, [agent]);
  return (
    <main>
      <h1>{tr(T.title, lang)}</h1>
      <p className="jejak-sub">{tr(T.sub, lang)}</p>
      <a className="jejak-report" href={`${API}/report.html${lang === "en" ? "?lang=en" : ""}`}>
        {tr(T.report, lang)}
      </a>
      <div className="jejak-filter" role="tablist">
        {["", "operator", "owner", "auditor", "builder", "ask"].map((a) => (
          <button key={a} type="button" role="tab" aria-selected={agent === a} className={agent === a ? "on" : ""} onClick={() => setAgent(a)}>
            {a ? label(AGENT, a, lang) : tr(T.all, lang)}
          </button>
        ))}
      </div>
      {error && <p className="jejak-bad">{error}</p>}
      {!items && !error && <p className="jejak-sub">{tr(T.loading, lang)}</p>}
      <ul className="jejak-rows">
        {items?.map((d) => (
          <li key={d.receipt}>
            <a href={`/?view=jejak&receipt=${d.receipt}${lang === "en" ? "&lang=en" : ""}`}>
              <span className={`jejak-agent a-${d.agent}`}>{label(AGENT, d.agent, lang)}</span>
              <span className="jejak-row-main">
                <b>{label(ACTION, d.action, lang)}</b>
                {d.subject && <span> · {d.subject}</span>}
              </span>
              <span className="jejak-row-time">{when(d.at)}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function One({ receipt, lang }: { receipt: string; lang: Lang }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${API}/decisions/${encodeURIComponent(receipt)}`)
      .then((r) => r.json())
      .then((b: Detail & { error?: string }) => (b.error ? setError(b.error) : setD(b)))
      .catch((e: Error) => setError(e.message));
  }, [receipt]);
  if (error) return <main><p className="jejak-bad">{error}</p></main>;
  if (!d) return <main><p className="jejak-sub">{tr(T.loading, lang)}</p></main>;
  const v = d.verify;
  const seen = d.trace?.seen ?? [];
  return (
    <main>
      <a className="jejak-back" href={`/?view=jejak${lang === "en" ? "&lang=en" : ""}`}>
        ‹ {tr(T.back, lang)}
      </a>
      <h1>{label(ACTION, d.decision.action, lang)}</h1>
      <p className="jejak-sub">
        {label(AGENT, d.decision.agent, lang)}
        {d.decision.subject ? ` · ${d.decision.subject}` : ""} · {when(d.decision.at)}
      </p>
      <p className={v.ok ? "jejak-verdict ok" : "jejak-verdict bad"}>
        <span aria-hidden="true">{v.ok ? "✓" : "✕"}</span> {v.ok ? tr(T.ok, lang) : v.problem}
      </p>

      <h2>{tr(T.why, lang)}</h2>
      <p className="jejak-why">{d.trace?.reasoning}</p>

      <h2>{tr(T.looked, lang)}</h2>
      {seen.length === 0 && <p className="jejak-sub">{tr(T.nothing, lang)}</p>}
      {seen.map((s, i) => (
        <div className="jejak-group" key={i}>
          <div className="jejak-query">“{s.query}”</div>
          {s.memory.length === 0 && <div className="jejak-line mute">—</div>}
          {s.memory.map((m) => (
            <div className="jejak-line" key={m.id}>
              {m.text}
            </div>
          ))}
        </div>
      ))}

      <h2>{tr(T.what, lang)}</h2>
      <div className="jejak-group">
        <div className="jejak-line mute">{tr(T.input, lang)}</div>
        <pre className="jejak-pre">{d.trace?.input}</pre>
        <pre className="jejak-pre">{pretty(d.trace?.output)}</pre>
      </div>

      <h2>{tr(T.chain, lang)}</h2>
      <ol className="jejak-chain">
        {d.chain.map((c) => (
          <li key={c.receipt} className={c.current ? "current" : ""}>
            <a href={`/?view=jejak&receipt=${c.receipt}${lang === "en" ? "&lang=en" : ""}`}>
              <span className={`jejak-agent a-${c.agent}`}>{label(AGENT, c.agent, lang)}</span>
              <b>{label(ACTION, c.action, lang)}</b>
              {c.subject && <span> · {c.subject}</span>}
            </a>
          </li>
        ))}
      </ol>

      <h2>{tr(T.proof, lang)}</h2>
      <div className="jejak-group">
        {(Object.keys(T.checks) as (keyof typeof T.checks)[]).map((k) => {
          const val = v.checks[k];
          const pass = k === "anchored" ? !!v.checks.anchored?.proof_ok : !!val;
          return (
            <div className="jejak-line check" key={k}>
              <span className={pass ? "yes" : "no"} aria-hidden="true">{pass ? "✓" : "✕"}</span>
              {tr(T.checks[k], lang)}
            </div>
          );
        })}
        <div className="jejak-line mono">receipt {short(d.decision.receipt)}</div>
        <div className="jejak-line mono">trace {short(d.decision.trace_hash)}</div>
        <div className="jejak-line mono">
          Meko {d.meko.endpoint} · datapack {d.meko.datapack.slice(0, 8)} · run {d.decision.run_id}
        </div>
        {v.checks.anchored && (
          <div className="jejak-line mono">
            Merkle root {short(v.checks.anchored.merkle_root)}
            {v.checks.anchored.explorer && (
              <>
                {" · "}
                <a href={v.checks.anchored.explorer}>Monad testnet</a>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
