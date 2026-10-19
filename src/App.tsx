import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OwnerApp } from "./owner/OwnerApp";
import { OwnerStudio } from "./studio/Studio";
import { DataSource, GenericRunPanel, ToolChecks } from "./Generic";
import { FoldContext, goTo, NextStep, Stepper, stepsFor, usePhone } from "./Guide";
import { ImpactPanel, RevisePanel, RevisionDiff } from "./Maintain";
import { RunPanel } from "./RunPanel";
import {
  api,
  type Health,
  type LedgerView,
  type PackId,
  type PackInfo,
  type ProviderInfo,
  type RuleCard,
  type RulebookRecord,
  type RunRecord,
  type SimEvent,
} from "./api";

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
// Same as packOf in @reeve/core, without pulling zod into the bundle.
const packOf = (rb: { pack?: PackId }): PackId => rb.pack ?? "rent-collection";

function Section(props: { id?: string; n: string; label: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const fold = useContext(FoldContext);
  // On a phone, every step but the open one folds into a numbered row (xerx-style hairline rows).
  const folded = fold.phone && props.id !== undefined && props.id !== fold.open && !(props.id === "result" && fold.open === "audit");
  if (folded) {
    return (
      <section className="section section--folded" id={props.id}>
        <button type="button" className="fold-row" onClick={() => fold.toggle(props.id!)} aria-expanded={false}>
          <span className="fold-row__n mono">{props.n}</span>
          <span className="fold-row__body">
            <span className="fold-row__label">{props.label}</span>
            <span className="fold-row__summary mono">{fold.summaries[props.id!] ?? props.title}</span>
          </span>
          <span className="fold-row__chev" aria-hidden>
            ›
          </span>
        </button>
      </section>
    );
  }
  return (
    <section className="section" id={props.id}>
      <header className="section-head">
        <span className="eyebrow">
          {props.n} · {props.label}
        </span>
        <h2>{props.title}</h2>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

function cardParams(c: RuleCard): string[] {
  switch (c.type) {
    case "invoice_schedule":
      return [`day ${c.day_of_month}`];
    case "reminder":
      return c.days_after_due.map((d) => `H+${d}`);
    case "late_fee":
      return [`H+${c.days_after_due}`, `${c.percent}% of ${c.basis}`, ...(c.tenure_grace ? [`≥${c.tenure_grace.min_months} mo: +${c.tenure_grace.extra_days} days`] : [])];
    case "notice":
      return [`H+${c.days_after_due}`];
    case "overpayment":
      return [c.policy.replaceAll("_", " ")];
    case "max_fee":
      return [`≤ ${c.max_percent_of_rent}% of rent`];
    case "approval_threshold":
      return [`refund > ${rp(c.refund_above)}`];
    case "revenue_target":
      return [rp(c.monthly_target), c.basis, `check day ${c.alert_day}`];
    case "reorder_point":
      return [`below ${c.below_units}`, `up to ${c.order_up_to_units}`, `supplier ${c.supplier}`];
    case "supplier_fallback":
      return [`${c.late_days} days late`, `switch to ${c.backup_supplier}`];
    case "expiry_markdown":
      return [`H-${c.days_before_expiry}`, `${c.percent}% off`];
    case "slow_mover_stop":
      return [`no sale ${c.no_sale_days} days`];
    case "po_approval_threshold":
      return [`PO > ${rp(c.po_above)}`];
    case "markdown_floor":
      return [`never below ${c.floor}`];
    case "expiring_value_limit":
      return [`≤ ${rp(c.max_value)}`, `${c.window_days} days ahead`, `weekday ${c.check_weekday}`];
    case "generic_rule":
      return [scheduleText(c.schedule), ...c.conditions.map(conditionText), `${c.action.tool}${c.once_per_record ? " · once" : ""}`];
    case "generic_never":
      return [`never ${c.tool === "*" ? "any action" : c.tool}`, ...c.conditions.map(conditionText)];
    case "generic_approval":
      return [`${c.tool === "*" ? "any action" : c.tool} > ${rp(c.amount_above)}`];
    case "generic_kpi":
      return [scheduleText(c.schedule), `${c.aggregate}${c.field ? ` of ${c.field}` : ""} ${c.alert_if} ${c.field || c.aggregate === "sum" ? rp(c.threshold) : c.threshold}`, ...c.conditions.map(conditionText)];
  }
}

const OP_TEXT: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=", neq: "≠", days_until_lte: "due within", days_since_gte: "overdue ≥", empty: "is empty", not_empty: "is set" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function conditionText(c: { field: string; op: string; value: string | number | null }) {
  if (c.op === "days_until_lte" || c.op === "days_since_gte") return `${c.field} ${OP_TEXT[c.op]} ${c.value} days`;
  return `${c.field} ${OP_TEXT[c.op] ?? c.op}${c.value === null ? "" : ` ${c.value}`}`;
}
function scheduleText(s: { every: string; weekday: number | null; day_of_month: number | null }) {
  return s.every === "week" ? `every ${DAYS[s.weekday ?? 0]}` : s.every === "month" ? `monthly, day ${s.day_of_month}` : "daily";
}

const KIND: Record<RuleCard["kind"], string> = { rule: "Rule", constraint: "Limit", kpi: "KPI" };

/** One bar split by kind: how much of the rulebook acts, limits, or watches a number. Words sit next to the colours. */
function KindBar({ cards }: { cards: RuleCard[] }) {
  const kinds = (["rule", "constraint", "kpi"] as const).map((k) => ({ k, n: cards.filter((c) => c.kind === k).length })).filter((x) => x.n > 0);
  return (
    <figure className="kind-bar" aria-label={kinds.map((x) => `${x.n} ${KIND[x.k].toLowerCase()}${x.n === 1 ? "" : "s"}`).join(", ")}>
      <div className="kind-bar__track" aria-hidden>
        {kinds.map((x) => (
          <span key={x.k} className={`kind-bar__seg kind-${x.k}`} style={{ flexGrow: x.n }} />
        ))}
      </div>
      <figcaption className="kind-bar__legend">
        {kinds.map((x) => (
          <span key={x.k}>
            <i className={`key kind-${x.k}`} aria-hidden /> <b>{x.n}</b> {KIND[x.k].toLowerCase()}
            {x.n === 1 ? "" : "s"}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Rulebook({ record }: { record: RulebookRecord }) {
  const rb = record.rulebook;
  return (
    <div className="grid-2">
      <div>
        <KindBar cards={rb.cards} />
        <ol className="rules">
          {rb.cards.map((c, i) => (
            <li key={c.id} className="rule">
              <span className="rule__n mono" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="rule__body">
                <p className="rule__title">
                  <span className={`badge kind-${c.kind}`}>{KIND[c.kind]}</span> {c.title}
                </p>
                <p className="rule__params mono">
                  {cardParams(c).join("  ·  ")} <span className="dim">· {c.id}</span>
                </p>
                <p className="quote">“{c.source_quote}”</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <aside className="asks">
        <h3 className="eyebrow">Builder asks</h3>
        <ol className="questions">
          {rb.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
        {rb.assumptions.length > 0 && (
          <>
            <h3 className="eyebrow">Assumed until you answer</h3>
            <ul className="questions muted">
              {rb.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
        <p className="mono dim small">parsed by {record.provider}</p>
      </aside>
    </div>
  );
}

function GlassBox({ run }: { run: RunRecord }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [run.log.length]);
  return (
    <div className="glass" ref={ref}>
      {run.log.map((l, i) => (
        <div key={i} className={`log ${l.line.startsWith("error") ? "err" : l.line.includes("verdict: PASS") ? "ok" : l.line.includes("verdict: FAIL") ? "bad" : ""}`}>
          <span className="t">{(l.ms / 1000).toFixed(2).padStart(6, " ")}s</span> {l.line}
        </div>
      ))}
      {(run.status === "queued" || run.status === "running") && <div className="log cursor">▍</div>}
    </div>
  );
}

function Verdict({ run }: { run: RunRecord }) {
  if (!run.verdict || !run.results) return run.error ? <p className="err-text">{run.error}</p> : null;
  const r = run.results;
  const v = run.verdict;
  const checks = [
    { label: "Builder tests", hint: "grading its own work", ok: r.builder_tests.ran - r.builder_tests.failed, of: r.builder_tests.ran },
    { label: "Auditor spec", hint: "written from the rulebook", ok: r.audit_spec.ran - r.audit_spec.failed, of: r.audit_spec.ran },
    { label: "Planted defects caught", hint: "mutation testing", ok: r.mutation.killed, of: r.mutation.total },
  ];
  const violations = r.constraints.violations.length;
  return (
    <div className="verdict">
      <div className={`verdict__head ${v.status}`}>
        <span className="eyebrow">Auditor verdict</span>
        <strong>{v.status === "pass" ? "Pass" : "Fail"}</strong>
        <span className="mono small">mutation score {(v.mutation_score * 100).toFixed(0)}%</span>
      </div>
      <ul className="bars">
        {checks.map((c) => {
          const share = c.of ? c.ok / c.of : 0;
          return (
            <li key={c.label} className="bar">
              <span className="bar__label">
                {c.label} <span className="dim small mono">{c.hint}</span>
              </span>
              <span className="bar__value mono">
                {c.ok}/{c.of}
              </span>
              <span className="bar__track" role="meter" aria-label={c.label} aria-valuemin={0} aria-valuemax={c.of} aria-valuenow={c.ok}>
                <span className={`bar__fill${share < 1 ? " is-short" : ""}`} style={{ width: `${share * 100}%` }} />
              </span>
            </li>
          );
        })}
        <li className="bar bar--count">
          <span className="bar__label">
            Constraint violations <span className="dim small mono">fee cap, approvals</span>
          </span>
          <span className={`badge ${violations ? "is-bad" : "is-ok"}`}>{violations ? `${violations} found` : "none"}</span>
        </li>
      </ul>
      {v.findings.filter((f) => f.severity !== "info").length > 0 && (
        <ul className="findings">
          {v.findings
            .filter((f) => f.severity !== "info")
            .map((f, i) => (
              <li key={i}>
                <span className={`badge sev-${f.severity}`}>{f.severity}</span>
                <span>
                  {f.message} <span className="mono dim small">{f.code}</span>
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/** Per pack: which event wins a timeline cell (most important first), the result title, and the month's totals. */
const RESULT: Record<PackId, { order: SimEvent["type"][]; title: string; totals: [string, string, boolean][] }> = {
  "rent-collection": {
    order: ["notice", "late_fee", "reminder", "payment", "credit", "invoice"],
    title: "45 simulated days · 30 rooms · first cycle shown",
    totals: [
      ["invoiced", "invoiced", true],
      ["collected", "collected", true],
      ["late fees", "fees", true],
      ["credits", "credits", true],
      ["KPI alerts", "kpi_alerts", false],
    ],
  },
  minimarket: {
    order: ["stockout", "writeoff", "po_approval_request", "supplier_switched", "markdown", "reorder_stopped", "po_created", "po_received"],
    title: "30 simulated days · 24 items · two suppliers",
    totals: [
      ["sales", "sales", true],
      ["purchase orders", "purchase_orders", false],
      ["ordered", "purchase_value", true],
      ["markdowns", "markdowns", false],
      ["written off", "writeoff_value", true],
      ["KPI alerts", "kpi_alerts", false],
    ],
  },
  generic: {
    order: ["blocked", "approval_request", "action", "kpi_alert"],
    title: "30 simulated days over your records",
    totals: [
      ["records", "records", false],
      ["actions", "actions", false],
      ["waiting for you", "approval_requests", false],
      ["blocked by a never rule", "blocked", false],
      ["KPI alerts", "kpi_alerts", false],
    ],
  },
};

function Timeline({ run, pack }: { run: RunRecord; pack: PackId }) {
  const events = run.results?.simulation.events ?? [];
  if (!events.length) return null;
  const { order, totals } = RESULT[pack];
  const tenants = [...new Set(events.filter((e) => order.includes(e.type)).map((e) => e.tenant_id).filter((t) => t !== "-"))].sort();
  const days = 30;
  const start = new Date(`${events.reduce((m, e) => (e.date < m ? e.date : m), events[0]!.date)}T00:00:00Z`);
  const dateOf = (i: number) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
  const byCell = new Map<string, SimEvent[]>();
  for (const e of events) {
    const k = `${e.tenant_id}|${e.date}`;
    byCell.set(k, [...(byCell.get(k) ?? []), e]);
  }
  const s = run.results!.simulation.summary;
  return (
    <div>
      <dl className="figures">
        {totals.map(([label, key, money]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{money ? rp(s[key] ?? 0) : (s[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <PerDay events={events} order={order} days={days} dateOf={dateOf} />
      <div className="timeline-scroll">
      <div className="timeline" style={{ gridTemplateColumns: `56px repeat(${days}, minmax(14px, 1fr))` }}>
        <div />
        {Array.from({ length: days }, (_, i) => (
          <div key={i} className="day mono">
            {i + 1}
          </div>
        ))}
        {tenants.map((t) => (
          <Row key={t} tenant={t} days={days} dateOf={dateOf} byCell={byCell} order={order} />
        ))}
      </div>
      </div>
      <div className="legend mono small">
        {order.map((t) => (
          <span key={t}>
            <i className={`dot ${t}`} aria-hidden /> {t.replaceAll("_", " ")}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Column chart: how many events the rules produced on each simulated day. */
function PerDay(props: { events: SimEvent[]; order: SimEvent["type"][]; days: number; dateOf: (i: number) => string }) {
  const counts = Array.from({ length: props.days }, (_, i) => props.events.filter((e) => e.date === props.dateOf(i) && props.order.includes(e.type)).length);
  const max = Math.max(1, ...counts);
  const busiest = counts.indexOf(Math.max(...counts));
  return (
    <figure className="per-day">
      <figcaption className="eyebrow">
        Events per day · busiest day {busiest + 1} ({counts[busiest]})
      </figcaption>
      <div className="per-day__cols" style={{ gridTemplateColumns: `repeat(${props.days}, minmax(0, 1fr))` }}>
        {counts.map((n, i) => (
          <span key={i} className="per-day__col" title={`Day ${i + 1}: ${n} events`} style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%` }} />
        ))}
      </div>
    </figure>
  );
}

function Row(props: { tenant: string; days: number; dateOf: (i: number) => string; byCell: Map<string, SimEvent[]>; order: SimEvent["type"][] }) {
  return (
    <>
      <div className="tenant mono">{props.tenant}</div>
      {Array.from({ length: props.days }, (_, i) => {
        const evs = props.byCell.get(`${props.tenant}|${props.dateOf(i)}`) ?? [];
        const top = props.order.find((t) => evs.some((e) => e.type === t));
        const title = evs.map((e) => `${e.type}${e.amount ? ` ${rp(e.amount)}` : ""}`).join(", ");
        return <div key={i} className="cell" title={title ? `${props.dateOf(i)}: ${title}` : undefined}>{top && <i className={`dot ${top}`} />}</div>;
      })}
    </>
  );
}

const BUG_LABEL: Record<PackId, string> = {
  "rent-collection": "make the Builder misread the tenure grace (demo)",
  minimarket: "make the Builder forget “never below cost” (demo)",
  generic: "make the Builder forget the “never” rules (demo)",
};

/** Business type and SOP reader. Owners on a small budget pick a cheaper or free model; the Auditor checks every one the same way. */
function Pickers(props: {
  packs: PackInfo[];
  pack: PackId;
  onPack: (p: PackId) => void;
  providers: ProviderInfo[];
  provider: string;
  onProvider: (id: string) => void;
}) {
  const chosen = props.providers.find((p) => p.id === props.provider);
  const vendors = [...new Set(props.providers.map((p) => p.vendor))];
  return (
    <div className="pickers">
      <div className="picker">
        <span className="eyebrow">Business type</span>
        <div className="segmented" role="radiogroup" aria-label="Business type">
          {props.packs.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === props.pack}
              className={p.id === props.pack ? "on" : ""}
              onClick={() => props.onPack(p.id)}
            >
              {p.domain}
              <small>{p.example}</small>
            </button>
          ))}
        </div>
      </div>
      <label className="picker">
        <span className="eyebrow">Who reads your SOP</span>
        <select value={props.provider} onChange={(e) => props.onProvider(e.target.value)}>
          {vendors.map((v) => (
            <optgroup key={v} label={v}>
              {props.providers
                .filter((p) => p.vendor === v)
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.available}>
                    {p.available ? p.label : `${p.label} · add ${p.setup} to reeve/.env`}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {chosen && (
          <span className="mono dim small">
            {chosen.price} · {chosen.note}
          </span>
        )}
      </label>
    </div>
  );
}

function Studio({ onOwner }: { onOwner: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [pack, setPack] = useState<PackId>("rent-collection");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("");
  const [sop, setSop] = useState("");
  const phone = usePhone();
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setOpenStep((e as CustomEvent<string>).detail);
    window.addEventListener("reeve:open", on);
    return () => window.removeEventListener("reeve:open", on);
  }, []);
  const [datasetId, setDatasetId] = useState("sample");
  const [rentDataset, setRentDataset] = useState("");
  const sample = useRef("");
  const [record, setRecord] = useState<RulebookRecord | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [injectBug, setInjectBug] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const refresh = useCallback(async () => {
    setHealth(await api.health());
    setLedger(await api.ledger());
  }, []);

  // Show a pack's sample SOP, unless the owner has already typed their own.
  const loadSample = useCallback(async (p: PackId) => {
    const { sop: text } = await api.defaultSop(p);
    const previous = sample.current;
    sample.current = text;
    setSop((current) => (current.trim() === "" || current === previous ? text : current));
  }, []);

  useEffect(() => {
    void refresh();
    void api.packs().then(setPacks);
    void api.providers().then((r) => {
      setProviders(r.providers);
      setProvider(r.default);
    });
    void api.rulebooks().then(async (list) => {
      if (!list[0]) return void loadSample("rent-collection");
      const rb = await api.rulebook(list[0].id);
      setRecord(rb);
      setPack(packOf(rb.rulebook));
      void loadSample(packOf(rb.rulebook));
      if (rb.lastRunId) setRun(await api.run(rb.lastRunId));
    });
  }, [refresh, loadSample]);

  const choosePack = (p: PackId) => {
    setPack(p);
    void loadSample(p);
  };

  // Poll the active run until it finishes.
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const t = setInterval(async () => {
      const next = await api.run(run.id);
      setRun(next);
      if (next.status === "done" || next.status === "error") {
        setRecord(await api.rulebook(next.rulebookId));
        void refresh();
      }
    }, 700);
    return () => clearInterval(t);
  }, [run, refresh]);

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const compile = () =>
    guard("compile", async () => {
      const rb = await api.compile(sop, pack, provider, pack === "generic" ? datasetId : pack === "rent-collection" && rentDataset ? rentDataset : undefined);
      setRecord(rb);
      setRun(null);
    });

  const revise = (text: string) =>
    guard("revise", async () => {
      if (!record) return;
      setRecord(await api.revise(record.id, { text, provider }));
      setRun(null);
    });

  const simulate = () =>
    guard("run", async () => {
      if (!record) return;
      setRun(await api.startRun(record.id, injectBug));
    });

  const registerPasskey = () =>
    guard("passkey", async () => {
      const optionsJSON = await api.registerOptions();
      const response = await startRegistration({ optionsJSON: optionsJSON as never });
      await api.registerVerify(response);
      await refresh();
    });

  const approve = () =>
    guard("approve", async () => {
      if (!record) return;
      const { options } = await api.approveOptions(record.id);
      const response = await startAuthentication({ optionsJSON: options as never });
      setRecord(await api.approveVerify(record.id, response));
      await refresh();
    });

  const running = run && (run.status === "queued" || run.status === "running");
  const canApprove = record && run?.status === "done" && run.verdict?.status === "pass" && record.status !== "approved";

  /** One sentence on what to do now, in the order the pipeline runs. */
  const nextStep = (): { text: string; action?: { label: string; onClick: () => void; disabled?: boolean } } => {
    if (!record) return { text: "Pick your business type and who reads your SOP, write the SOP in your own words, then compile it into rules.", action: { label: "Compile SOP", onClick: compile, disabled: busy !== null || !provider } };
    if (record.issues.length) return { text: `The rules have ${record.issues.length} problem(s) to fix first. Change the SOP and compile again.`, action: { label: "See the rules", onClick: () => goTo("compile") } };
    if (running) return { text: "The Builder's code is running in the sandbox while the Auditor tries to break it. This takes a few seconds." };
    if (!run || run.rulebookId !== record.id) return { text: "Check the rules and the questions on the right. Then let the Auditor test them on a simulated month.", action: { label: "Simulate & audit", onClick: simulate, disabled: busy !== null } };
    if (run.status === "error" || run.verdict?.status === "fail") return { text: "The Auditor stopped this version. Read its findings, change the SOP or a rule, and compile again.", action: { label: "See the findings", onClick: () => goTo("audit") } };
    if (record.status !== "approved")
      return health?.passkeys
        ? { text: "Passed the audit. Approve this exact run with your passkey to go live.", action: { label: "Approve with passkey", onClick: approve, disabled: busy !== null } }
        : { text: "Passed the audit. Set up your passkey once, then approve this run.", action: { label: "Set up passkey", onClick: registerPasskey, disabled: busy !== null } };
    if (["rent-collection", "generic"].includes(packOf(record.rulebook))) return { text: "Approved. Start running the rules for real; anything above your limits still waits for you.", action: { label: "Go to Run", onClick: () => goTo("run") } };
    return { text: "Approved. Every run and approval is on the ledger below.", action: { label: "See the track record", onClick: () => goTo("prove") } };
  };

  const steps = stepsFor(record, run, Boolean(record && ["rent-collection", "generic"].includes(packOf(record.rulebook))));
  const attention = steps.find((st) => st.state === "current" || st.state === "fail" || st.state === "running")?.id ?? "describe";
  // When the pipeline moves on (compiled, audited, approved), unfold the step that now needs attention.
  useEffect(() => setOpenStep(null), [attention]);
  const fold = {
    phone,
    open: openStep ?? attention,
    toggle: (id: string) => setOpenStep(id),
    summaries: {
      describe: `${packs.find((p) => p.id === pack)?.domain ?? pack} · ${providers.find((p) => p.id === provider)?.label ?? provider}`,
      compile: record ? `${record.rulebook.cards.length} rules · ${record.rulebook.questions.length} questions · ${record.status}` : "Not compiled yet",
      audit: run ? (run.status === "done" ? `Auditor ${run.verdict?.status.toUpperCase()} · ${run.results ? `${run.results.mutation.killed}/${run.results.mutation.total} planted bugs caught` : ""}` : run.status) : "Not run yet",
      result: run?.results ? Object.entries(run.results.simulation.summary).slice(0, 3).map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`).join(" · ") : "",
      approve: record?.status === "approved" ? "Approved with passkey" : canApprove ? "Ready for your passkey" : "After the audit passes",
      run: record?.status === "approved" ? "Ready to run" : "After you approve",
      prove: ledger ? `${ledger.intact ? "Chain intact" : "Chain broken"} · ${ledger.entries.length} recent entries` : "",
    },
  };

  return (
    <FoldContext.Provider value={fold}>
    <div className={`shell${phone ? " shell--phone" : ""}`}>
      <header className={`hero${phone && !showSystem ? " hero--compact" : ""}`}>
        <div className="hero__title">
          <h1>
            Reeve <span className="hero__mode">Developer</span>
          </h1>
          <p className="hero__sub">Logs, code and receipts behind the owner studio.</p>
        </div>
        <nav className="hero__links" aria-label="Views">
          <a className="ghost button-link" href="?view=studio">
            Studio
          </a>
          <button type="button" className="ghost" onClick={onOwner}>
            Owner app
          </button>
          <a className="ghost button-link" href="?view=apps">
            Apps
          </a>
          {phone && (
            <button type="button" className="ghost status__toggle" onClick={() => setShowSystem((v) => !v)} aria-expanded={showSystem} aria-label={showSystem ? "Hide system status" : "Show system status"}>
              <i className={`status-dot ${health?.ledgerIntact ? "ok" : ""}`} />
            </button>
          )}
        </nav>
        <ul className="status mono small" aria-label="System status">
          <li>
            <i className="status-dot ok" aria-hidden /> llm · {health?.llm ?? "…"}
          </li>
          <li>
            <i className="status-dot ok" aria-hidden /> sandbox · {health?.sandbox ?? "…"}
          </li>
          <li className={health?.passkeys ? "ok" : ""}>
            <i className={`status-dot ${health?.passkeys ? "ok" : ""}`} aria-hidden /> owner passkey · {health?.passkeys ? "registered" : "not registered"}
          </li>
          <li className={health?.ledgerIntact ? "ok" : "bad"}>
            <i className={`status-dot ${health?.ledgerIntact ? "ok" : "bad"}`} aria-hidden /> ledger · {health?.ledgerIntact ? "intact" : "…"}
          </li>
        </ul>
      </header>

      <Stepper steps={steps} />
      <NextStep {...nextStep()} dock={phone} />

      {error && <div className="error-bar">{error}</div>}

      <Section id="describe" n="01" label="Describe" title="Tell Reeve how your business runs">
        <Pickers packs={packs} pack={pack} onPack={choosePack} providers={providers} provider={provider} onProvider={setProvider} />
        {pack === "generic" && <DataSource datasetId={datasetId} onDataset={setDatasetId} />}
        {pack === "rent-collection" && <DataSource datasetId={rentDataset} onDataset={setRentDataset} sampleLabel="Sample: Kos Melati (30 rooms)" hint="Columns Reeve looks for: kamar/room, nama/name, sewa/rent, tanggal_masuk/move_in (YYYY-MM-DD)." />}
        <textarea className="sop" value={sop} onChange={(e) => setSop(e.target.value)} spellCheck={false} />
        <div className="actions">
          <button className="primary" onClick={compile} disabled={busy !== null || !provider}>
            {busy === "compile" ? "Builder is reading your SOP…" : "Compile SOP"}
          </button>
          <span className="mono dim small">The model only sees this text, never customer or payment data. Whichever model you pick, the Auditor checks its work the same way.</span>
        </div>
      </Section>

      {record && (
        <Section
          id="compile"
          n="02"
          label="Compile"
          title={`${record.rulebook.business_name}: ${record.rulebook.cards.length} rule cards`}
          aside={
            <span className="aside-row">
              <span className="mono dim small">read by {record.provider}</span>
              <span className={`badge status-${record.status}`}>{record.status}</span>
            </span>
          }
        >
          {record.diff && record.diff.length > 0 && <RevisionDiff diff={record.diff} />}
          <Rulebook record={record} />
          {record.toolChecks && <ToolChecks checks={record.toolChecks} />}
          {(record.status === "approved" || record.status === "audited") && <RevisePanel record={record} busy={busy === "revise"} onRevise={revise} />}
        </Section>
      )}

      {record && (
        <Section id="audit" n="03" label="Simulate & audit" title="The Builder's code runs in an isolated sandbox. The Auditor tries to break it.">
          <div className="actions">
            <button className="primary" onClick={simulate} disabled={busy !== null || Boolean(running)}>
              {running ? "Running in sandbox…" : "Simulate & audit"}
            </button>
            <label className="toggle mono small">
              <input type="checkbox" checked={injectBug} onChange={(e) => setInjectBug(e.target.checked)} /> {BUG_LABEL[record ? packOf(record.rulebook) : pack]}
            </label>
            {run?.rulesPy && (
              <button className="ghost" onClick={() => setShowCode((s) => !s)}>
                {showCode ? "Hide" : "Show"} generated rules.py
              </button>
            )}
          </div>
          {run && (
            <div className="grid-2 top">
              <GlassBox run={run} />
              <Verdict run={run} />
            </div>
          )}
          {showCode && run?.rulesPy && <pre className="code">{run.rulesPy}</pre>}
        </Section>
      )}

      {run?.results && (
        <Section id="result" n="04" label="Result" title={RESULT[record ? packOf(record.rulebook) : pack].title}>
          {record?.impact && <ImpactPanel impact={record.impact} />}
          <Timeline run={run} pack={record ? packOf(record.rulebook) : pack} />
        </Section>
      )}

      {record && (
        <Section id="approve" n="05" label="Approve" title="Nothing goes live without the owner's passkey">
          <div className="approve">
            {!health?.passkeys ? (
              <button className="ghost" onClick={registerPasskey} disabled={busy !== null}>
                {busy === "passkey" ? "Waiting for your device…" : "Register owner passkey"}
              </button>
            ) : null}
            <button className="primary big" onClick={approve} disabled={!canApprove || !health?.passkeys || busy !== null}>
              {record.status === "approved" ? "Approved ✓" : busy === "approve" ? "Confirm on your device…" : "Approve with passkey"}
            </button>
            <p className="mono dim small">
              {record.status === "approved" && record.approval
                ? `Approved ${new Date(record.approval.at).toLocaleString()} · signed receipt ${record.approval.receiptHash.slice(0, 16)}… · ledger #${record.approval.ledgerSeq}`
                : canApprove
                  ? `The passkey signs a challenge bound to receipt ${run?.receipt?.receipt_hash.slice(0, 16)}… — you approve exactly this audited run.`
                  : "Available once the latest run passes the Auditor."}
            </p>
          </div>
        </Section>
      )}

      {record && packOf(record.rulebook) === "rent-collection" && (
        <Section id="run" n="06" label="Run" title="The broker bills on a real payment rail, in test mode">
          <RunPanel record={record} hasPasskey={Boolean(health?.passkeys)} onChange={() => void refresh()} />
        </Section>
      )}
      {record && packOf(record.rulebook) === "generic" && (
        <Section id="run" n="06" label="Run" title="The broker acts through your connected apps">
          <GenericRunPanel record={record} hasPasskey={Boolean(health?.passkeys)} onChange={() => void refresh()} />
        </Section>
      )}

      {ledger && (
        <Section
          id="prove"
          n="07"
          label="Prove"
          title="Track record"
          aside={<span className={`badge ${ledger.intact ? "status-approved" : "status-draft"}`}>{ledger.intact ? "chain intact" : "chain broken"}</span>}
        >
          <p className="mono small dim">merkle root · {ledger.merkleRoot ?? "—"}</p>
          <ol className="chain">
            {ledger.entries.slice(0, 12).map((e) => (
              <li key={e.seq} className={`chain__link ledger-${e.kind}`}>
                <span className="chain__node" aria-hidden />
                <div className="chain__body">
                  <p className="chain__head">
                    <span className="mono">#{e.seq}</span> <span className={`badge ledger-${e.kind}`}>{e.kind}</span>{" "}
                    <span className="chain__what">
                      {e.kind === "operation" ? `${String(e.event).replaceAll("_", " ")}${e.tenant ? ` · ${String(e.tenant)}` : ""}${typeof e.amount === "number" ? ` · ${rp(e.amount)}` : ""}` : String(e.verdict ?? e.rulebook_id ?? `${e.leaves ?? ""} leaves`)}
                    </span>
                  </p>
                  <p className="mono dim small">
                    {new Date(e.at).toLocaleString()} · {String(e.kind === "operation" ? (e.ref ?? e.receipt_hash) : (e.receipt_hash ?? e.merkle_root ?? "")).slice(0, 24)}…
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <footer className="mono dim small">reeve · maker-checker agents · receipts on an append-only ledger</footer>
    </div>
    </FoldContext.Provider>
  );
}

type View = "owner" | "studio" | "studio-pro";

/** Phones (and the installed PWA) open the owner app; wide screens open the studio. */
function initialView(): View {
  const param = new URLSearchParams(window.location.search).get("view");
  if (param === "owner" || param === "studio" || param === "studio-pro") return param;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return standalone || window.matchMedia("(max-width: 760px)").matches ? "owner" : "studio";
}

export function App() {
  const [view, setView] = useState<View>(initialView);
  const go = (v: View) => {
    setView(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
    window.scrollTo(0, 0);
  };
  // "studio" is the owner-facing iOS studio; "studio-pro" keeps the developer studio with logs and code.
  if (view === "owner") return <OwnerApp onStudio={() => go("studio")} />;
  if (view === "studio") return <OwnerStudio />;
  return <Studio onOwner={() => go("owner")} />;
}
