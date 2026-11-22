// "Kendali": the owner's review queue (approve, edit or reject each draft with one tap) and the
// autonomy ladder (which kinds of work Reeve may do alone, and when it earns the right to ask for
// more). Every tap is a traced owner decision with a receipt. Signed-in only.
import { useCallback, useEffect, useState } from "react";
import "../explain/explain.css";
import "../discovery/temukan.css";
import "./kendali.css";

interface Hit {
  rule: string;
  message: string;
}
interface Item {
  id: string;
  step: string;
  step_title: string;
  action_class: string;
  kind: "draft" | "escalation" | "contract" | "action";
  subject: string;
  text: string;
  status: "pending" | "approved" | "rejected" | "edited";
  receipt: string;
  hits?: Hit[];
  decision_receipt?: string;
}
type Level = "ask" | "ask_if_unusual" | "auto_digest" | "auto";
interface Cls {
  cls: string;
  label: string;
  level: Level;
  max_level: Level;
  locked: boolean;
  promote_after: number | null;
  evidence: { clean: number; bad: number; receipts: string[] };
  proposal: { question: string; from: Level; to: Level } | null;
  needs: number | null;
}

const API = "/api/meko/owner";
const LEVELS: Level[] = ["ask", "ask_if_unusual", "auto_digest", "auto"];
const LEVEL_NAME: Record<Level, string> = {
  ask: "Tanya dulu",
  ask_if_unusual: "Tanya jika tidak biasa",
  auto_digest: "Jalan sendiri + ringkasan harian",
  auto: "Jalan sendiri",
};
const KIND: Record<Item["kind"], string> = { draft: "Draf teks", escalation: "Perlu keputusan Anda", contract: "Kontrak", action: "Tindakan" };
const STATUS: Record<Item["status"], string> = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak", edited: "Disetujui dengan perubahan" };
const jejak = (r: string) => `/?view=jejak&receipt=${r}`;

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: body === undefined ? "GET" : "POST", credentials: "include", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; hits?: Hit[] };
  if (!res.ok) throw new Error(`${json.error ?? `Gagal (${res.status})`}${json.hits?.length ? `: ${json.hits.map((h) => h.message).join(" ")}` : ""}`);
  return json;
}

export function KendaliPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [classes, setClasses] = useState<Cls[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([call<{ items: Item[] }>("/review"), call<{ classes: Cls[] }>("/autonomy")]);
      setItems(r.items);
      setClasses(a.classes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const pending = items?.filter((i) => i.status === "pending") ?? [];
  const done = items?.filter((i) => i.status !== "pending") ?? [];

  return (
    <div className="jejak temukan kendali">
      <header className="jejak-head">
        <a className="jejak-brand" href="/?view=studio">
          Reeve
        </a>
        <nav className="kd-nav">
          <a className="jejak-report" href="/?view=temukan">
            Temukan SOP
          </a>
          <a className="jejak-report" href="/?view=jejak">
            Jejak keputusan
          </a>
        </nav>
      </header>
      <main>
        <h1>Kendali</h1>
        <p className="jejak-sub">Tinjau draf sebelum keluar, dan atur seberapa jauh Reeve boleh jalan sendiri. Setiap ketukan tercatat sebagai bukti.</p>
        {error && <p className="jejak-verdict bad">{error}</p>}

        <h2>Antrean tinjauan</h2>
        {!items ? (
          <p className="tm-note">Memuat…</p>
        ) : pending.length === 0 ? (
          <p className="jejak-why">Tidak ada yang menunggu. Semua draf sudah Anda putuskan.</p>
        ) : (
          <ul className="tm-cards kd-queue">
            {pending.map((i) => (
              <ReviewCard key={i.id} item={i} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <details className="kd-done">
            <summary>Sudah diputuskan ({done.length})</summary>
            <ul className="tm-cards">
              {done.map((i) => (
                <li key={i.id} className={`tm-card ${i.status === "rejected" ? "no" : "yes"}`}>
                  <p className="tm-id">{i.step_title}</p>
                  <p className="tm-title">{i.subject}</p>
                  <p className="tm-answered">
                    {STATUS[i.status]} · <a href={jejak(i.decision_receipt ?? i.receipt)}>{i.decision_receipt ? "lihat bukti" : "lihat jejak draf"}</a>
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}

        <h2>Tangga otonomi</h2>
        <p className="jejak-why">Setiap jenis pekerjaan mulai dari “Tanya dulu”. Reeve baru boleh bertanya untuk naik setelah cukup bukti bersih, dan Anda selalu bisa menurunkannya lagi.</p>
        {!classes ? (
          <p className="tm-note">Memuat…</p>
        ) : (
          <ul className="tm-cards kd-ladder">
            {classes.map((c) => (
              <ClassCard key={c.cls} c={c} onDone={load} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function ReviewCard({ item }: { item: Item }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ receipt: string; status: Item["status"] } | null>(null);

  const decide = async (action: "approve" | "reject" | "edit") => {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ receipt: string; item: Item }>(`/review/${item.id}`, action === "edit" ? { action, text } : { action });
      setSaved({ receipt: r.receipt, status: r.item.status });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`tm-card kd-card${saved ? (saved.status === "rejected" ? " no" : " yes") : ""}`}>
      <div className="tm-card-head">
        <span className="tm-id">{KIND[item.kind]}</span>
        <span>{item.step_title}</span>
      </div>
      <p className="tm-title">{item.subject}</p>
      {editing ? (
        <textarea className="kd-text" value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={3000} aria-label="Ubah teks draf" />
      ) : (
        <p className="kd-draft">{saved && saved.status === "edited" ? text : item.text}</p>
      )}
      {!!item.hits?.length && (
        <ul className="kd-hits">
          {item.hits.map((h) => (
            <li key={h.rule}>
              <b>{h.rule}</b> {h.message}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="jejak-verdict bad">{error}</p>}
      {saved ? (
        <p className="tm-answered kd-saved">
          Tercatat · {STATUS[saved.status]} ·{" "}
          <a href={jejak(saved.receipt)}>lihat bukti</a>
          <br />
          Belum ada pesan terkirim; pengiriman lewat konektor terjadi di jalan berikutnya.
        </p>
      ) : editing ? (
        <div className="tm-yesno">
          <button type="button" className="tm-yes" disabled={busy || !text.trim()} onClick={() => decide("edit")}>
            Simpan
          </button>
          <button type="button" className="tm-no" disabled={busy} onClick={() => (setEditing(false), setText(item.text), setError(null))}>
            Batal
          </button>
        </div>
      ) : (
        <div className="tm-yesno kd-three">
          <button type="button" className="tm-yes" disabled={busy} onClick={() => decide("approve")}>
            Setujui
          </button>
          <button type="button" className="tm-secondary" disabled={busy} onClick={() => setEditing(true)}>
            Ubah
          </button>
          <button type="button" className="tm-no" disabled={busy} onClick={() => decide("reject")}>
            Tolak
          </button>
        </div>
      )}
    </li>
  );
}

function ClassCard({ c, onDone }: { c: Cls; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const max = LEVELS.indexOf(c.max_level);
  const cur = LEVELS.indexOf(c.level);

  const act = async (path: "promote" | "demote") => {
    setBusy(true);
    setError(null);
    try {
      await call(`/autonomy/${path}`, { cls: c.cls });
      setSaved(path === "promote" ? "Level dinaikkan" : "Level diturunkan");
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="tm-card kd-class">
      <div className="tm-card-head">
        <span className="tm-id">{c.label}</span>
        <span>{LEVEL_NAME[c.level]}</span>
      </div>
      {c.locked ? (
        <p className="tm-evidence kd-locked">Selalu tanya pemilik. Jenis ini tidak pernah jalan sendiri.</p>
      ) : (
        <>
          <ol className="kd-steps" aria-label="Tangga otonomi">
            {LEVELS.map((l, i) => (
              <li key={l} className={`${i <= cur ? "on" : ""}${i === cur ? " now" : ""}${i > max ? " off" : ""}`}>
                <span className="kd-dot" />
                <span className="kd-step-name">{LEVEL_NAME[l]}</span>
              </li>
            ))}
          </ol>
          <p className="tm-evidence">
            {c.evidence.clean} dari {c.promote_after ?? "?"} bersih, {c.evidence.bad} masalah
          </p>
          {c.evidence.receipts.length > 0 && (
            <p className="tm-evidence kd-rcpts">
              Bukti:
              {c.evidence.receipts.map((r, i) => (
                <a key={r} href={jejak(r)} target="_blank" rel="noreferrer" className="kd-rcpt">
                  {i + 1}
                </a>
              ))}
            </p>
          )}
          {c.proposal ? (
            <div className="kd-proposal">
              <p>{c.proposal.question}</p>
              <p className="tm-note">Naik ke: {LEVEL_NAME[c.proposal.to]}</p>
            </div>
          ) : cur >= max ? (
            <p className="tm-note">Sudah di level tertinggi untuk jenis ini.</p>
          ) : c.evidence.bad > 0 ? (
            <p className="tm-note">Ada {c.evidence.bad} masalah sejak perubahan terakhir. Reeve menunggu bukti bersih yang baru.</p>
          ) : (
            <p className="tm-note">Masih perlu {c.needs} kali jalan bersih lagi sebelum Reeve boleh bertanya.</p>
          )}
        </>
      )}
      {error && <p className="jejak-verdict bad">{error}</p>}
      {saved && <p className="tm-answered kd-saved">{saved}. Tercatat di jejak keputusan.</p>}
      <div className="tm-yesno">
        {c.proposal && (
          <button type="button" className="tm-yes" disabled={busy} onClick={() => act("promote")}>
            Setuju, naikkan
          </button>
        )}
        {c.level !== "ask" && (
          <button type="button" className="tm-secondary" disabled={busy} onClick={() => act("demote")}>
            Turunkan
          </button>
        )}
      </div>
    </li>
  );
}
