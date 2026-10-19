import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { packFor, type DomainPack, type PackView } from "@reeve/core/packs";
import { shortDate as enDate } from "@reeve/core/simview";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type GenericOperationRecord, type Health, type LedgerView, type RulebookRecord, type RunRecord } from "../api";
import { longDate, rupiah, toolWords } from "../studio/plain";
import { loadMinimarketSample } from "./sample";

/** The owner app speaks Indonesian, like the owner studio: "15 Nov". */
const shortDate = (date: string) => enDate(date, "id");

/** ?sample=minimarket shows the minimarket pack's real CreateOS run, read-only. */
const SAMPLE = new URLSearchParams(window.location.search).get("sample") === "minimarket";

/*
 * The owner's side of Reeve, built for a phone and installable as a PWA: what happened today,
 * what needs approval, how each room stands, and the signed track record.
 */

type Tab = "today" | "approvals" | "entities" | "ledger";

export function OwnerApp({ onStudio }: { onStudio: () => void }) {
  const [tab, setTab] = useState<Tab>("today");
  const [health, setHealth] = useState<Health | null>(null);
  const [record, setRecord] = useState<RulebookRecord | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [h, l, list] = await Promise.all([api.health(), api.ledger(), api.rulebooks()]);
    setHealth(h);
    setLedger(l);
    if (SAMPLE) {
      const sample = await loadMinimarketSample();
      setRecord(sample.record);
      setRun(sample.run);
      setLoaded(true);
      return;
    }
    const latest = list[0];
    if (latest) {
      const rb = await api.rulebook(latest.id);
      setRecord(rb);
      setRun(rb.lastRunId ? await api.run(rb.lastRunId) : null);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      setLoaded(true);
    });
  }, [load]);

  const events = run?.results?.simulation.events ?? [];
  // The domain pack decides the nouns, statuses and KPIs; the tabs stay the same for every business.
  const pack = useMemo(() => packFor(record?.rulebook, "id"), [record]);
  const days = useMemo(() => pack.days(events), [pack, events]);
  const firstMonth = days.filter((d) => d.slice(0, 7) === days[0]?.slice(0, 7));
  // Open on the KPI check day (the 15th) when the run has one, else the last day of the first month.
  const defaultDay = events.find((e) => e.type === "kpi_alert")?.date ?? firstMonth.at(-1) ?? null;
  const current = day ?? defaultDay;
  const view = useMemo(() => (current ? pack.view(events, current, record?.rulebook) : null), [pack, events, current, record]);
  const tabs: { key: Tab; label: string }[] = [
    { key: "today", label: "Hari ini" },
    { key: "approvals", label: "Persetujuan" },
    { key: "entities", label: pack.entity.many },
    { key: "ledger", label: "Bukti" },
  ];

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

  const registerPasskey = () =>
    guard("passkey", async () => {
      const optionsJSON = await api.registerOptions();
      const response = await startRegistration({ optionsJSON: optionsJSON as never });
      await api.registerVerify(response);
      setHealth(await api.health());
    });

  const approve = () =>
    guard("approve", async () => {
      if (!record) return;
      const { options } = await api.approveOptions(record.id);
      const response = await startAuthentication({ optionsJSON: options as never });
      setRecord(await api.approveVerify(record.id, response));
      setLedger(await api.ledger());
    });

  const needsApproval = Boolean(record && run?.status === "done" && run.verdict?.status === "pass" && record.status !== "approved");
  const name = record?.rulebook.business_name ?? "Reeve";
  const pending = (needsApproval ? 1 : 0) + (view?.exceptions.length ?? 0);

  return (
    <div className="owner">
      <header className="owner__bar">
        <div className="owner__title">
          <span className="owner__brand">REEVE</span>
          <span className="owner__biz">{name}</span>
          <span className="owner__domain">{pack.domain}</span>
        </div>
        <button type="button" className="owner__switch" onClick={onStudio}>
          Studio
        </button>
      </header>

      {SAMPLE && (
        <p className="owner__sample">
          Contoh usaha: uji coba asli paket minimarket di CreateOS. Hanya untuk dilihat; persetujuan dilakukan di ruang kerjamu sendiri.
        </p>
      )}

      {error && (
        <p className="owner__error" role="alert">
          {error}
        </p>
      )}

      <main className="owner__main">
        {!loaded && <p className="owner__empty">Memuat usahamu…</p>}
        {loaded && !record && (
          <div className="owner__empty">
            <p>Belum ada aturan.</p>
            <p>Ceritakan SOP-mu di studio, nanti Reeve menyusunnya jadi aturan.</p>
            <button type="button" className="o-btn" onClick={onStudio}>
              Buka studio
            </button>
          </div>
        )}

        {loaded && record && tab === "today" && (
          <Today
            run={run}
            view={view}
            days={firstMonth}
            current={current}
            onDay={setDay}
            needsApproval={needsApproval}
            onApprovals={() => setTab("approvals")}
          />
        )}
        {loaded && record && tab === "approvals" && (
          <Approvals
            record={record}
            run={run}
            view={view}
            hasPasskey={Boolean(health?.passkeys)}
            needsApproval={needsApproval}
            busy={busy}
            sample={SAMPLE}
            onRegister={registerPasskey}
            onApprove={approve}
          />
        )}
        {loaded && record && tab === "entities" && <Entities pack={pack} view={view} days={firstMonth} current={current} onDay={setDay} />}
        {loaded && tab === "ledger" && <Ledger ledger={ledger} />}
      </main>

      <nav className="tabbar" aria-label="Aplikasi pemilik">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className="tabbar__btn"
            aria-current={tab === t.key ? "page" : undefined}
            onClick={() => setTab(t.key)}
          >
            <TabIcon tab={t.key} />
            <span>{t.label}</span>
            {t.key === "approvals" && pending > 0 && <i className="tabbar__badge">{pending}</i>}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------------- Today ---------------- */
function Today(props: {
  run: RunRecord | null;
  view: PackView | null;
  days: string[];
  current: string | null;
  onDay: (d: string) => void;
  needsApproval: boolean;
  onApprovals: () => void;
}) {
  const { run, view, days, current, onDay, needsApproval, onApprovals } = props;
  if (!run?.results || !current || !view) {
    return (
      <div className="owner__empty">
        <p>Belum ada bulan latihan.</p>
        <p>Jalankan uji coba di studio, nanti tiap harinya muncul di sini.</p>
      </div>
    );
  }
  const waiting = (needsApproval ? 1 : 0) + view.exceptions.length;

  return (
    <div className="o-stack">
      {waiting > 0 && (
        <button type="button" className="o-notice" onClick={onApprovals}>
          <b>{waiting} menunggu kamu</b>
          <span>{needsApproval ? "Aturanmu lolos pemeriksaan Auditor. Setujui supaya mulai jalan." : "Reeve menandai hal yang tidak akan diputuskannya sendiri."}</span>
        </button>
      )}

      <DayPicker days={days} current={current} onDay={onDay} />

      {view.kpis.map((k) => (
        <section className={`o-card o-kpi tone-${k.tone ?? "ok"}`} aria-label={k.label} key={k.id}>
          <span className="o-label">{k.label}</span>
          <span className="o-kpi__value">{k.display}</span>
          {k.target ? (
            <>
              <span className="o-kpi__of">
                {k.targetKind === "limit" ? `batas ${k.targetDisplay}` : `dari target ${k.targetDisplay}`}
              </span>
              <span className="o-track">
                <span className="o-track__fill" style={{ transform: `scaleX(${Math.min(1, k.value / k.target).toFixed(3)})` }} />
              </span>
            </>
          ) : null}
          {k.note && <span className="o-kpi__note">{k.note}</span>}
        </section>
      ))}

      <div className="o-stats">
        {view.stats.map((st) => (
          <span key={st.label} className={st.tone ? `tone-${st.tone}` : undefined}>
            <b>{st.value}</b>
            {st.label}
          </span>
        ))}
      </div>

      <section className="o-card" aria-label="Yang dikerjakan Reeve">
        <span className="o-label">Yang dikerjakan Reeve, {shortDate(current)}</span>
        {view.lines.length ? (
          <ul className="o-list">
            {view.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="o-muted">Tidak ada yang perlu dikerjakan.</p>
        )}
      </section>

      <p className="o-foot">Bulan latihan dari uji coba {run.id}, diperiksa Auditor sebelum ada yang jalan sungguhan.</p>
    </div>
  );
}

function DayPicker({ days, current, onDay }: { days: string[]; current: string; onDay: (d: string) => void }) {
  const i = days.indexOf(current);
  return (
    <div className="o-day" role="group" aria-label="Hari">
      <button type="button" className="o-day__btn" disabled={i <= 0} onClick={() => onDay(days[i - 1]!)} aria-label="Hari sebelumnya">
        ‹
      </button>
      <span className="o-day__label">
        <b>{shortDate(current)}</b>
        <span>hari latihan</span>
      </span>
      <button
        type="button"
        className="o-day__btn"
        disabled={i < 0 || i >= days.length - 1}
        onClick={() => onDay(days[i + 1]!)}
        aria-label="Hari berikutnya"
      >
        ›
      </button>
    </div>
  );
}

/* ---------------- Approvals ---------------- */
function Approvals(props: {
  record: RulebookRecord;
  run: RunRecord | null;
  view: PackView | null;
  hasPasskey: boolean;
  needsApproval: boolean;
  busy: string | null;
  sample: boolean;
  onRegister: () => void;
  onApprove: () => void;
}) {
  const { record, run, view, hasPasskey, needsApproval, busy, sample, onRegister, onApprove } = props;
  const questions = record.rulebook.questions ?? [];
  const mutation = run?.results?.mutation;

  return (
    <div className="o-stack">
      {record.status === "approved" && record.approval ? (
        <section className="o-card o-done">
          <span className="o-label">Semua beres</span>
          <h2 className="o-h">{record.rulebook.business_name} sudah jalan</h2>
          <p className="o-muted">
            Disetujui {longDate(record.approval.at)} dengan sidik jarimu. Tercatat di bukti #{record.approval.ledgerSeq}.
          </p>
        </section>
      ) : needsApproval ? (
        <section className="o-card o-approve">
          <span className="o-label o-label--signal">Perlu persetujuanmu</span>
          <h2 className="o-h">Aturan {record.rulebook.business_name}</h2>
          <p className="o-muted">
            {record.rulebook.cards.length} aturan · Auditor {run?.verdict?.status === "pass" ? "LULUS" : "GAGAL"}
            {mutation ? ` · ${mutation.killed} dari ${mutation.total} kesalahan yang ditanam ketahuan` : ""}
          </p>
          <ul className="o-list o-list--checks">
            {record.rulebook.cards.slice(0, 4).map((c) => (
              <li key={c.id}>{c.title}</li>
            ))}
          </ul>
          {sample ? (
            <p className="o-muted">Di ruang kerjamu sendiri, di sinilah kamu menyetujui dengan sidik jari.</p>
          ) : !hasPasskey ? (
            <button type="button" className="o-btn" onClick={onRegister} disabled={busy !== null}>
              {busy === "passkey" ? "Menunggu perangkatmu…" : "Daftarkan sidik jarimu dulu"}
            </button>
          ) : (
            <button type="button" className="o-btn" onClick={onApprove} disabled={busy !== null}>
              {busy === "approve" ? "Konfirmasi di perangkatmu…" : "Setujui dengan sidik jari"}
            </button>
          )}
          <p className="o-foot">
            Kamu menyetujui persis uji coba yang sudah diaudit ini: tanda terima {run?.receipt?.receipt_hash.slice(0, 12)}…
          </p>
        </section>
      ) : (
        <section className="o-card">
          <span className="o-label">Tidak ada yang perlu disetujui</span>
          <p className="o-muted">
            {run?.verdict?.status === "fail"
              ? "Auditor menghentikan uji coba terakhir. Builder harus memperbaikinya dulu sebelum sampai ke kamu."
              : "Begitu Auditor meloloskan uji coba, aturannya muncul di sini untuk kamu setujui."}
          </p>
        </section>
      )}

      {!sample && record.status === "approved" && record.rulebook.pack === "generic" && <LiveHeld record={record} hasPasskey={hasPasskey} />}

      {view && view.exceptions.length > 0 && (
        <section className="o-card">
          <span className="o-label">{record.status === "approved" && record.rulebook.pack === "generic" ? "Di bulan yang diaudit" : "Ditandai untukmu"}</span>
          <p className="o-muted">Kasus di luar aturan. Reeve tidak memutuskannya sendiri.</p>
          <ul className="o-list">
            {view.exceptions.map((x) => (
              <li key={x.id} className="o-flag">
                <span className="o-flag__date">{shortDate(x.date)}</span>
                <span>{x.text}</span>
                <span className="o-flag__opts">
                  Pilihan: {orWords(x.options)}
                  {x.needsPasskey ? " (pakai sidik jari)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions.length > 0 && (
        <section className="o-card">
          <span className="o-label">Pertanyaan untukmu</span>
          <ul className="o-list">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------------- Entities (rooms, SKUs, tickets...: named by the pack) ---------------- */
function Entities(props: { pack: DomainPack; view: PackView | null; days: string[]; current: string | null; onDay: (d: string) => void }) {
  const { pack, view, days, current, onDay } = props;
  const [open, setOpen] = useState<string | null>(null);
  if (!current || !view) return <p className="owner__empty">Belum ada bulan latihan.</p>;
  const sel = view.entities.find((e) => e.id === open);
  const tone = (status: string) => pack.statuses[status]?.tone ?? "idle";
  const label = (status: string) => pack.statuses[status]?.label ?? status;
  const used = [...new Set(view.entities.map((e) => e.status))];
  return (
    <div className="o-stack">
      <DayPicker days={days} current={current} onDay={onDay} />
      <div className="o-ents" role="list">
        {view.entities.map((e) => (
          <button
            type="button"
            role="listitem"
            key={e.id}
            className={`o-ent tone-${tone(e.status)} ${open === e.id ? "is-open" : ""}`}
            onClick={() => setOpen(open === e.id ? null : e.id)}
            aria-label={`${pack.entity.one} ${e.label}: ${label(e.status)}`}
          >
            {e.label}
            {e.flags.length > 0 && <i className="o-ent__flag" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {sel ? (
        <section className="o-card" aria-live="polite">
          <span className="o-label">
            {pack.entity.one} {sel.label}
          </span>
          <h2 className="o-h">{label(sel.status)}</h2>
          <p className="o-muted">{sel.detail}</p>
          {sel.flags.length > 0 && <p className="o-foot">{sel.flags.join(" · ")}</p>}
        </section>
      ) : (
        <p className="o-muted">Ketuk {pack.entity.one.toLowerCase()} untuk melihat kondisinya.</p>
      )}
      <ul className="o-legend">
        {used.map((st) => (
          <li key={st}>
            <i className={`tone-${tone(st)}`} />
            {label(st)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Ledger ---------------- */
/* ---------------- Live run (Any SOP) ---------------- */
/** "A, B atau C". */
const orWords = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} atau ${xs.at(-1)}` : (xs[0] ?? ""));

/** A held action in Indonesian; the API's own text is English. */
const heldWords = (h: GenericOperationRecord["held"][number]) =>
  `${h.tool ? toolWords(h.tool) : "Aksi"} untuk ${h.key}${h.amount !== undefined ? `, sekitar ${rupiah(h.amount)}` : ""}. Di atas batasmu, kirim?`;

/** Actions the approved rules held above your limit in the live run: send each with your fingerprint, or don't. */
function LiveHeld({ record, hasPasskey }: { record: RulebookRecord; hasPasskey: boolean }) {
  const [op, setOp] = useState<GenericOperationRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const list = await api.operations();
    setOp((list.find((o) => o.rulebookId === record.id && "kind" in o && o.kind === "generic") as GenericOperationRecord | undefined) ?? null);
  }, [record.id]);
  useEffect(() => {
    void reload();
  }, [reload]);
  if (!op) return null;
  const open = op.held.filter((h) => h.status === "open" && h.kind === "approval_request");
  const sent = op.sent.filter((a) => a.ok).length;
  const act = async (id: string, send: boolean) => {
    setBusy(id);
    setError(null);
    try {
      if (send) {
        const { options } = await api.heldApproveOptions(op.id, id);
        const response = await startAuthentication({ optionsJSON: options as never });
        setOp(await api.heldApproveVerify(op.id, id, response));
      } else setOp(await api.heldDecline(op.id, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="o-card">
      <span className="o-label">{open.length ? "Menunggu kamu" : "Berjalan"}</span>
      <p className="o-muted">
        Berjalan {op.clock ? `sampai ${shortDate(op.clock)}` : "sejak hari ini"} · {sent} terkirim · {op.held.filter((h) => h.kind === "blocked").length} ditahan aturan larangan
      </p>
      {error && <p className="owner__error">{error}</p>}
      <ul className="o-list">
        {open.map((h) => (
          <li key={h.id} className="o-flag">
            <span className="o-flag__date">{shortDate(h.date)}</span>
            <span>{heldWords(h)}</span>
            <span className="o-actions">
              <button type="button" className="o-btn" disabled={busy !== null || !hasPasskey} onClick={() => void act(h.id, true)}>
                {busy === h.id ? "Konfirmasi di perangkatmu…" : "Kirim dengan sidik jari"}
              </button>
              <button type="button" className="o-btn o-btn--ghost" disabled={busy !== null} onClick={() => void act(h.id, false)}>
                Jangan kirim
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ledger rows in short words for the pills (the owner studio's Bukti screen has the long ones). */
const KIND: Record<string, string> = { receipt: "Uji coba", approval: "Disetujui", operation: "Berjalan", anchor: "Disegel" };
const VERDICT: Record<string, string> = { pass: "Lulus", fail: "Gagal" };
function ledgerWord(e: LedgerView["entries"][number]): string {
  if (e.kind === "receipt" && typeof e.verdict === "string") return VERDICT[e.verdict] ?? e.verdict;
  if (e.kind === "anchor" && !e.tx) return "Segel lokal";
  return KIND[e.kind] ?? e.kind;
}
const stamp = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Ledger({ ledger }: { ledger: LedgerView | null }) {
  if (!ledger) return <p className="owner__empty">Memuat bukti…</p>;
  return (
    <div className="o-stack">
      <section className="o-card">
        <span className="o-label">Rekam jejak</span>
        <h2 className="o-h">{ledger.intact ? "Semua catatan utuh" : "Ada catatan yang berubah"}</h2>
        <p className="o-muted">Setiap uji coba, persetujuan dan hari berjalan dicatat berantai. Mengubah satu catatan merusak semua catatan sesudahnya.</p>
      </section>
      <ul className="o-ledger">
        {[...ledger.entries].reverse().slice(0, 20).map((e) => (
          <li key={e.seq} className={`o-ledger__row is-${e.kind}`}>
            <span className="o-ledger__node" aria-hidden="true" />
            <span className="o-ledger__seq">#{e.seq}</span>
            <span className="o-ledger__kind">{ledgerWord(e)}</span>
            <span className="o-ledger__at">{stamp(e.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  const paths: Record<Tab, string> = {
    today: "M4 5h16v14H4z M4 9h16 M8 3v4 M16 3v4",
    approvals: "M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v9H5z M12 15v2",
    entities: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
    ledger: "M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h4",
  };
  return (
    <svg className="tabbar__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[tab]} />
    </svg>
  );
}
