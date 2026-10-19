import { startAuthentication } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";
import { api, type DatasetSummary, type GenericOperationRecord, type RulebookRecord, type ToolCheck } from "./api";

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const DAY = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Read tools for common apps, with the arguments each one needs (slugs checked against Composio, 19 Oct 2026). */
const APP_SOURCES: { label: string; tool: string; fields: { name: string; hint: string }[] }[] = [
  { label: "Google Sheets", tool: "GOOGLESHEETS_VALUES_GET", fields: [{ name: "spreadsheet_id", hint: "from the sheet's URL" }, { name: "range", hint: "e.g. Sheet1!A1:Z500" }] },
  { label: "Notion database", tool: "NOTION_QUERY_DATABASE", fields: [{ name: "database_id", hint: "from the database URL" }] },
  { label: "ClickUp list", tool: "CLICKUP_GET_TASKS", fields: [{ name: "list_id", hint: "from the list URL" }] },
  { label: "Airtable table", tool: "AIRTABLE_LIST_RECORDS", fields: [{ name: "baseId", hint: "app…" }, { name: "tableIdOrName", hint: "table name" }] },
  { label: "Any other app (tool slug + JSON)", tool: "", fields: [] },
];

function FromApp(props: { onDone: (id: string) => void }) {
  const [which, setWhich] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [tool, setTool] = useState("");
  const [json, setJson] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preset = APP_SOURCES[which]!;
  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const args = preset.tool ? Object.fromEntries(preset.fields.map((f) => [f.name, (values[f.name] ?? "").trim()])) : (JSON.parse(json) as Record<string, unknown>);
      const d = await api.datasetFromApp(preset.tool ? preset.label : tool, preset.tool || tool.trim(), args);
      props.onDone(d.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="from-app">
      <span className="eyebrow">Or read from an app (through your connectors)</span>
      <div className="actions">
        <select value={which} onChange={(e) => setWhich(Number(e.target.value))} aria-label="App">
          {APP_SOURCES.map((a, i) => (
            <option key={a.label} value={i}>
              {a.label}
            </option>
          ))}
        </select>
        {preset.fields.map((f) => (
          <input key={f.name} placeholder={`${f.name} (${f.hint})`} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
        ))}
        {!preset.tool && (
          <>
            <input placeholder="TOOL_SLUG, e.g. ODOO_SEARCH_READ" value={tool} onChange={(e) => setTool(e.target.value)} />
            <input placeholder='arguments as JSON, e.g. {"model":"res.partner"}' value={json} onChange={(e) => setJson(e.target.value)} />
          </>
        )}
        <button className="ghost" disabled={busy} onClick={() => void read()}>
          {busy ? "Reading…" : "Read rows"}
        </button>
      </div>
      {error && <div className="error-bar">{error}</div>}
      <p className="mono dim small">Rows read from an app are read again on every run step, so the rules always see today's data.</p>
    </div>
  );
}

/** Generic SOPs run over the owner's own records: pick the sample, upload a CSV, or read from a connected app. */
export function DataSource(props: { datasetId: string; onDataset: (id: string) => void; sampleLabel?: string; hint?: string }) {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [connectors, setConnectors] = useState<{ id: string; label: string; kind: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => void api.datasets().then(setDatasets), []);
  useEffect(() => {
    load();
    void api.connectors().then(setConnectors);
  }, [load]);
  const chosen = datasets.find((d) => d.id === props.datasetId);

  const upload = async (file: File) => {
    setError(null);
    try {
      const d = await api.uploadDataset(file.name.replace(/\.csv$/i, ""), await file.text());
      load();
      props.onDataset(d.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="panel data-source">
      <div className="pickers">
        <label className="picker">
          <span className="eyebrow">Your records</span>
          <select value={props.datasetId} onChange={(e) => props.onDataset(e.target.value)}>
            {props.sampleLabel && <option value="">{props.sampleLabel}</option>}
            {datasets.filter((d) => !props.sampleLabel || d.id !== "sample").map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.count} rows
              </option>
            ))}
          </select>
        </label>
        <label className="picker">
          <span className="eyebrow">Or upload a CSV (export from Google Sheets or Excel)</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </label>
      </div>
      {error && <div className="error-bar">{error}</div>}
      <FromApp
        onDone={(id) => {
          load();
          props.onDataset(id);
        }}
      />
      {chosen && (
        <div className="chips">
          {chosen.fields.map((f) => (
            <span key={f.name} className="chip" title={f.values ? `values: ${f.values.join(", ")}` : undefined}>
              {f.name} · {f.type}
              {f.values ? ` (${f.values.join("/")})` : ""}
            </span>
          ))}
        </div>
      )}
      {props.hint && <p className="mono dim small">{props.hint}</p>}
      <p className="mono dim small">
        The model sees these field names and category labels only, never names, phones or emails. Connected: {connectors.map((c) => c.label).join(", ") || "…"} · <a href="?view=apps">connect more apps</a>.
      </p>
    </div>
  );
}

const CHECK_LABEL: Record<ToolCheck["status"], string> = { ok: "ready", missing_args: "needs arguments", not_found: "no such tool", not_connected: "account not connected", log_only: "logged only" };

/** Build time: is every tool the rules use available on a connected service? */
export function ToolChecks({ checks }: { checks: ToolCheck[] }) {
  if (!checks.length) return null;
  const gaps = checks.filter((c) => c.status !== "ok" && c.status !== "log_only");
  return (
    <div className="panel tool-checks">
      <span className="eyebrow">Connectors</span>
      <ul>
        {checks.map((c) => (
          <li key={`${c.rule}-${c.tool}`} className={`check-${c.status}`}>
            <span className="mono">{c.rule}</span> {c.tool} <span className={`badge pay-${c.status === "ok" ? "paid" : c.status === "log_only" ? "open" : "void"}`}>{CHECK_LABEL[c.status]}</span>
            <span className="mono dim small"> {c.detail}</span>
          </li>
        ))}
      </ul>
      {gaps.length > 0 && (
        <p className="mono dim small">
          Until a service is connected, those actions are recorded, not sent. <a href="?view=apps">Connect the app</a>, or add an MCP server that offers the tool to REEVE_MCP_SERVERS.
        </p>
      )}
    </div>
  );
}

/** Run an approved generic rulebook: today's decisions go out through the connectors. */
export function GenericRunPanel(props: { record: RulebookRecord; hasPasskey: boolean; onChange: () => void }) {
  const { record } = props;
  const [op, setOp] = useState<GenericOperationRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.operations().then((list) => setOp((list.find((o) => o.rulebookId === record.id && "kind" in o && o.kind === "generic") as GenericOperationRecord | undefined) ?? null));
  }, [record.id]);

  useEffect(() => {
    if (op?.status !== "running") return;
    const t = setInterval(async () => {
      const next = await api.genericOperation(op.id);
      setOp(next);
      if (next.status !== "running") props.onChange();
    }, 700);
    return () => clearInterval(t);
  }, [op, props]);

  const guard = async (label: string, fn: () => Promise<GenericOperationRecord | void>) => {
    setBusy(label);
    setError(null);
    try {
      const next = await fn();
      if (next) setOp(next);
      props.onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const approve = (hid: string) =>
    guard(`approve-${hid}`, async () => {
      if (!op) return;
      const { options } = await api.heldApproveOptions(op.id, hid);
      const response = await startAuthentication({ optionsJSON: options as never });
      return api.heldApproveVerify(op.id, hid, response);
    });

  const approved = record.status === "approved";
  const next = op ? (op.clock ? addDays(op.clock, 1) : op.startDate) : null;
  const open = op?.held.filter((h) => h.status === "open") ?? [];

  return (
    <div className="run">
      {error && <div className="error-bar">{error}</div>}
      {!op ? (
        <div className="actions">
          <button className="primary" disabled={!approved || busy !== null} onClick={() => guard("start", () => api.startGeneric(record.id))}>
            Start running these rules
          </button>
          <span className="mono dim small">{approved ? "Each day the approved rules run over your records; the broker sends only what they decide." : "Available once you approve the audited rulebook with your passkey."}</span>
        </div>
      ) : (
        <>
          <div className="run-head">
            <div>
              <span className="eyebrow">Connectors</span>
              <h3>{op.clock ? `Through ${shortDate(op.clock)}` : "Not started"}</h3>
              <p className="mono dim small">Each step runs the approved rules.py in the sandbox over your current records, then calls only the tools the rulebook names.</p>
            </div>
            <div className="actions">
              {next && (
                <button className="primary" disabled={op.status === "running" || busy !== null} onClick={() => guard("advance", () => api.advanceGeneric(op.id, next))}>
                  {op.status === "running" ? "Rules running in the sandbox…" : `Run ${shortDate(next)}`}
                </button>
              )}
            </div>
          </div>
          {op.error && <div className="error-bar">{op.error}</div>}
          {open.length > 0 && (
            <div className="run-exceptions">
              {open.map((h) => (
                <div key={h.id} className="run-exception">
                  <p>
                    <span className="badge is-wait">{h.kind === "approval_request" ? "waiting for you" : "note"}</span> {h.text}
                  </p>
                  <div className="actions">
                    {h.kind === "approval_request" && (
                      <button className="primary" disabled={busy !== null || !props.hasPasskey} onClick={() => approve(h.id)}>
                        {busy === `approve-${h.id}` ? "Confirm on your device…" : `Send with passkey`}
                      </button>
                    )}
                    <button className="ghost" disabled={busy !== null} onClick={() => guard(`decline-${h.id}`, () => api.heldDecline(op.id, h.id))}>
                      {h.kind === "approval_request" ? "Don't send" : "Noted"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {op.sent.length > 0 && (
            <div className="run-table-wrap">
              <table className="ledger run-table">
                <tbody>
                  {[...op.sent].reverse().map((a, i) => (
                    <tr key={i}>
                      <td className="mono">{shortDate(a.date)}</td>
                      <td className="mono">{a.key}</td>
                      <td>{a.tool}</td>
                      <td className="mono dim">{a.amount !== undefined ? rp(a.amount) : ""}</td>
                      <td>
                        <span className={`badge pay-${a.ok ? (a.via === "log" ? "open" : "paid") : "void"}`}>{a.ok ? (a.via === "log" ? "logged" : `sent · ${a.via}`) : "not sent"}</span>
                      </td>
                      <td className="mono dim small">{a.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {op.clock && op.sent.length === 0 && open.length === 0 && <p className="mono dim small">Nothing for the rules to do yet on these days.</p>}
        </>
      )}
    </div>
  );
}
