import { useState } from "react";
import type { CardChange, RunImpact } from "@reeve/core/revision";
import type { RulebookRecord } from "./api";

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const show = (v: unknown) => (typeof v === "number" && v >= 10_000 ? rp(v) : v === null || v === undefined ? "none" : Array.isArray(v) ? v.join(", ") : String(v));
const words = (s: string) => s.replaceAll("_", " ").replaceAll(".", " · ");

/** Phase 4: what a revision changes, in the owner's words. */
export function RevisionDiff({ diff }: { diff: CardChange[] }) {
  return (
    <div className="panel revision-diff">
      <h3 className="eyebrow">Changes from the approved version</h3>
      <ul>
        {diff.map((c) => (
          <li key={`${c.kind}-${c.id}-${c.type}`} className={`diff-${c.kind}`}>
            <span className={`badge diff-badge-${c.kind}`}>{c.kind === "added" ? "+ added" : c.kind === "removed" ? "− removed" : "~ changed"}</span> <span className="mono dim">{c.id}</span> {c.title}
            {c.kind === "changed" ? (
              <span className="mono small">
                {c.fields.map((f) => (
                  <span key={f.field} className="diff-field">
                    {words(f.field)}: <s>{show(f.before)}</s> → <b>{show(f.after)}</b>
                  </span>
                ))}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mono dim small">The revision goes through the same audit and needs your passkey. Until then the approved version keeps running.</p>
    </div>
  );
}

export function RevisePanel(props: { record: RulebookRecord; busy: boolean; onRevise: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(props.record.sop);
  if (!open)
    return (
      <div className="actions">
        <button
          className="ghost"
          onClick={() => {
            setText(props.record.sop);
            setOpen(true);
          }}
        >
          Change a rule
        </button>
        <span className="mono dim small">Edit the SOP; Reeve shows exactly which rules change and what that does to the month.</span>
      </div>
    );
  return (
    <div className="revise">
      <textarea className="sop" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="actions">
        <button className="primary" disabled={props.busy || text.trim() === props.record.sop.trim()} onClick={() => props.onRevise(text)}>
          {props.busy ? "Builder is reading the change…" : "Compile revision"}
        </button>
        <button className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const TOTAL_LABEL: Record<string, string> = {
  invoiced: "invoiced",
  collected: "collected",
  fees: "late fees",
  credits: "credits",
  refund_requests: "refund requests",
  kpi_alerts: "KPI alerts",
  purchase_orders: "purchase orders",
  purchase_value: "ordered",
  markdowns: "markdowns",
  writeoff_value: "written off",
  approval_requests: "orders above the limit",
  supplier_switches: "supplier switches",
  stockouts: "stock-outs",
  sales: "sales",
};
const MONEY = new Set(["invoiced", "collected", "fees", "credits", "purchase_value", "writeoff_value", "sales"]);

/** Same simulated month under both versions of the rules: one pair of bars per total, before above after. */
export function ImpactPanel({ impact }: { impact: RunImpact }) {
  if (!impact.totals.length && !impact.subjects.length) return <p className="mono dim small">Same month, same outcome: this revision changes nothing in the simulation.</p>;
  const fmt = (key: string, n: number) => (MONEY.has(key) ? rp(n) : String(n));
  return (
    <div className="panel impact">
      <h3 className="eyebrow">Impact vs the approved version (same simulated month)</h3>
      <p className="impact__key small">
        <span>
          <i className="key key--before" aria-hidden /> approved version
        </span>
        <span>
          <i className="key key--after" aria-hidden /> this revision
        </span>
      </p>
      <ul className="pairs">
        {impact.totals.map((t) => {
          const max = Math.max(1, t.before, t.after);
          return (
            <li key={t.key} className="pair">
              <span className="pair__label">{TOTAL_LABEL[t.key] ?? words(t.key)}</span>
              <span className="pair__row">
                <span className="pair__track">
                  <span className="pair__fill pair__fill--before" style={{ width: `${(t.before / max) * 100}%` }} />
                </span>
                <span className="mono small">{fmt(t.key, t.before)}</span>
              </span>
              <span className="pair__row">
                <span className="pair__track">
                  <span className="pair__fill pair__fill--after" style={{ width: `${(t.after / max) * 100}%` }} />
                </span>
                <span className="mono small">
                  {fmt(t.key, t.after)} <span className="dim">({t.after >= t.before ? "+" : "−"}{fmt(t.key, Math.abs(t.after - t.before))})</span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mono small">
        {impact.subjects.length} affected:{" "}
        {impact.subjects
          .slice(0, 8)
          .map((s) => `${s.id} (${s.changes.map((c) => `${words(c.type)} ${c.amount[0] || c.amount[1] ? `${rp(c.amount[0])}→${rp(c.amount[1])}` : `${c.count[0]}→${c.count[1]}`}`).join(", ")})`)
          .join(" · ")}
        {impact.subjects.length > 8 ? ` · and ${impact.subjects.length - 8} more` : ""}
      </p>
    </div>
  );
}
