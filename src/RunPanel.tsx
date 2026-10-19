import { startAuthentication } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";
import { api, type OperationRecord, type RailInfo, type RulebookRecord } from "./api";

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const DAY = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Phase 3: Run. The approved rules decide, the broker bills on a real payment rail in test mode.
 * Keys never reach this page or the sandbox; the page only sees which rails are set up.
 */
export function RunPanel(props: { record: RulebookRecord; hasPasskey: boolean; onChange: () => void }) {
  const { record } = props;
  const lineage = (record.lineage ?? []).join(",");
  const [rails, setRails] = useState<RailInfo[]>([]);
  const [rail, setRail] = useState("mock");
  const [op, setOp] = useState<OperationRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferTenant, setTransferTenant] = useState("K01");
  const [transferAmount, setTransferAmount] = useState(1_500_000);

  useEffect(() => {
    void api.rails().then((list) => {
      setRails(list);
      const first = list.find((r) => r.available && r.id !== "mock") ?? list.find((r) => r.available);
      if (first) setRail(first.id);
    });
    // A revision shows the run of the version it replaces, so the owner can switch that run over.
    const ids = [record.id, ...lineage.split(",").filter(Boolean)];
    void api.operations().then((list) => setOp((list.find((o) => ids.includes(o.rulebookId) && !("kind" in o)) as OperationRecord | undefined) ?? null));
  }, [record.id, lineage]);

  // Poll while the sandbox runs the rules.
  useEffect(() => {
    if (op?.status !== "running") return;
    const t = setInterval(async () => {
      const next = await api.operation(op.id);
      setOp(next);
      if (next.status !== "running") props.onChange();
    }, 700);
    return () => clearInterval(t);
  }, [op, props]);

  const guard = useCallback(
    async (label: string, fn: () => Promise<OperationRecord | void>) => {
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
    },
    [props],
  );

  const approved = record.status === "approved";
  const chosen = rails.find((r) => r.id === rail);
  const nextDay = op ? (op.clock ? addDays(op.clock, 1) : op.startDate) : null;
  const dayNumber = (date: string) => (op ? Math.round((Date.parse(date) - Date.parse(op.startDate)) / DAY) + 1 : 0);

  const refund = (exId: string, needsPasskey: boolean) =>
    guard(`refund-${exId}`, async () => {
      if (!op) return;
      if (!needsPasskey) return api.refund(op.id, exId);
      const { options } = await api.refundOptions(op.id, exId);
      const response = await startAuthentication({ optionsJSON: options as never });
      return api.refundVerify(op.id, exId, response);
    });

  return (
    <div className="run">
      {error && <div className="error-bar">{error}</div>}

      {!op && (
        <div className="run-start">
          <div className="segmented" role="radiogroup" aria-label="Payment rail">
            {rails.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={r.id === rail} className={r.id === rail ? "on" : ""} disabled={!r.available} onClick={() => setRail(r.id)}>
                {r.label}
                <small>{r.available ? r.note : `add ${r.setup} to reeve/.env`}</small>
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="primary" disabled={!approved || !chosen?.available || busy !== null} onClick={() => guard("start", () => api.startOperation(record.id, rail))}>
              {busy === "start" ? "Starting…" : `Run on ${chosen?.label ?? rail}`}
            </button>
            <span className="mono dim small">{approved ? "Test mode only: live keys are refused." : "Available once you approve the audited rulebook with your passkey."}</span>
          </div>
        </div>
      )}

      {op && (
        <>
          <div className="run-head">
            <div>
              <span className="eyebrow">{rails.find((r) => r.id === op.rail)?.label ?? op.rail}</span>
              <h3>{op.clock ? `Day ${dayNumber(op.clock)} · ${shortDate(op.clock)}` : "Not started"}</h3>
              <p className="mono dim small">
                Reeve's business clock: each step runs the approved rules.py in the sandbox over the payments the rail has confirmed, then the broker bills what they decide.
              </p>
            </div>
            <div className="actions">
              {nextDay && (
                <button className="primary" disabled={op.status === "running" || busy !== null} onClick={() => guard("advance", () => api.advance(op.id, nextDay))}>
                  {op.status === "running" ? "Rules running in the sandbox…" : op.clock ? `Run ${shortDate(nextDay)}` : `Run day 1 (${shortDate(nextDay)}): send the bills`}
                </button>
              )}
              {op.clock && (
                <button className="ghost" disabled={op.status === "running" || busy !== null} onClick={() => guard("advance7", () => api.advance(op.id, addDays(op.clock!, 7)))}>
                  +7 days
                </button>
              )}
              {op.invoices.length > 0 && (
                <button className="ghost" disabled={busy !== null} onClick={() => guard("refresh", async () => (await api.refreshOperation(op.id)).operation)}>
                  {busy === "refresh" ? "Asking the rail…" : "Check payments"}
                </button>
              )}
            </div>
          </div>
          {op.error && <div className="error-bar">{op.error}</div>}
          {op.rulebookId !== record.id && (
            <div className="run-exception">
              <p>This run still uses the previous approved rules.</p>
              {approved ? (
                <div className="actions">
                  <button className="primary" disabled={busy !== null || op.status === "running"} onClick={() => guard("upgrade", () => api.upgradeOperation(op.id))}>
                    {busy === "upgrade" ? "Switching…" : "Switch this run to the new rules"}
                  </button>
                  <span className="mono dim small">Bills and payments so far stay; the new rules decide from the next business day.</span>
                </div>
              ) : (
                <p className="mono dim small">Approve this revision with your passkey to switch the run over.</p>
              )}
            </div>
          )}

          {op.exceptions.some((x) => x.status === "open") && (
            <div className="run-exceptions">
              {op.exceptions
                .filter((x) => x.status === "open")
                .map((x) => (
                  <div key={x.id} className="run-exception">
                    <p>
                      <span className="badge is-wait">{x.kind === "kpi_alert" ? "KPI alert" : "needs a decision"}</span> {x.text}
                    </p>
                    {x.kind !== "kpi_alert" ? (
                      <div className="actions">
                        <button className="ghost" disabled={busy !== null} onClick={() => guard(`keep-${x.id}`, () => api.keepCredit(op.id, x.id))}>
                          Keep as credit
                        </button>
                        <button className="primary" disabled={busy !== null || (x.needsPasskey && !props.hasPasskey)} onClick={() => refund(x.id, x.needsPasskey)}>
                          {busy === `refund-${x.id}` ? "Confirm on your device…" : x.needsPasskey ? `Refund ${rp(x.amount)} with passkey` : `Refund ${rp(x.amount)}`}
                        </button>
                      </div>
                    ) : (
                      <button className="ghost" disabled={busy !== null} onClick={() => guard(`keep-${x.id}`, () => api.keepCredit(op.id, x.id))}>
                        Noted
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}

          {op.invoices.length > 0 && (
            <div className="run-table-wrap">
              <table className="ledger run-table">
                <tbody>
                  {op.invoices.map((i) => {
                    const t = op.tenants.find((x) => x.id === i.tenant);
                    return (
                      <tr key={i.key}>
                        <td className="mono">{t?.room ?? i.tenant}</td>
                        <td>{i.kind === "rent" ? "rent" : "late fee"}</td>
                        <td className="mono">{rp(i.amount)}</td>
                        <td>
                          <span className={`badge pay-${i.status}`}>{i.status}</span>
                        </td>
                        <td className="run-cell-actions">
                          {i.payUrl && (
                            <a className="mono small" href={i.payUrl} target="_blank" rel="noreferrer">
                              pay page ↗
                            </a>
                          )}
                          {i.status === "open" && (
                            <button className="ghost small-btn" disabled={busy !== null} onClick={() => guard(`pay-${i.invoiceId}`, () => api.simulatePayment(op.id, i.invoiceId))}>
                              {busy === `pay-${i.invoiceId}` ? "Paying…" : "Pay (test)"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {op.clock && (
            <form
              className="run-transfer actions"
              onSubmit={(e) => {
                e.preventDefault();
                void guard("transfer", () => api.transfer(op.id, transferTenant, transferAmount));
              }}
            >
              <span className="mono dim small">A tenant paid by bank transfer instead:</span>
              <select value={transferTenant} onChange={(e) => setTransferTenant(e.target.value)} aria-label="Tenant">
                {op.tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.room}
                  </option>
                ))}
              </select>
              <input type="number" min={1} step={1} value={transferAmount} onChange={(e) => setTransferAmount(Number(e.target.value))} aria-label="Amount in rupiah" />
              <button className="ghost" disabled={busy !== null}>
                Record transfer
              </button>
            </form>
          )}

          {op.actions.length > 0 && (
            <ul className="run-log mono small">
              {op.actions
                .slice(-10)
                .reverse()
                .map((a, n) => (
                  <li key={n} className={`run-${a.outcome}`}>
                    <span className="dim">{shortDate(a.date)}</span> {a.detail}
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
