// "Ketenangan pemilik": the daily digest preview and the 10-minute undo window for actions that run
// by themselves. Nothing here sends anything: the digest goes out only through a wa.me link the
// owner opens, and the outbox runs staged actions on the server once their window has passed.
import { useCallback, useEffect, useState } from "react";

interface OutItem {
  id: string;
  label: string;
  tool: string;
  subject?: string;
  status: "staged" | "running" | "done" | "undone" | "failed";
  seconds_left: number;
  stage_receipt: string;
  done_receipt?: string;
  undo_receipt?: string;
}
interface Outbox {
  items: OutItem[];
  staged: number;
  window_seconds: number;
}
interface DigestView {
  date: string;
  text: string;
  wa_me: string;
  channel: { telegram_linked: boolean; live: boolean; name: string };
  sent: { receipt: string; channel: string; delivered: boolean } | null;
}

const API = "/api/meko/owner";
const jejak = (r: string) => `/?view=jejak&receipt=${r}`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const TOOL: Record<string, string> = { TELEGRAM_SEND_MESSAGE: "Pesan", WHATSAPP_REPLY: "Balasan" };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: body === undefined ? "GET" : "POST", credentials: "include", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Gagal (${res.status})`);
  return json;
}

export function DigestSection() {
  const [d, setD] = useState<DigestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    call<DigestView>("/digest")
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <section className="kd-calm" aria-labelledby="kd-digest">
      <h2 id="kd-digest">Ringkasan hari ini</h2>
      {error && <p className="jejak-verdict bad">{error}</p>}
      {!d ? (
        !error && <p className="tm-note">Memuat…</p>
      ) : (
        <>
          <pre className="kd-digest" aria-label="Isi ringkasan">
            {d.text}
          </pre>
          <div className="tm-yesno">
            <a className="tm-yes kd-link-btn" href={d.wa_me} target="_blank" rel="noreferrer">
              Kirim lewat WhatsApp
            </a>
          </div>
          <p className="tm-note kd-channel">
            Telegram: {d.channel.telegram_linked ? "terhubung, kirim /ringkasan kapan saja" : "belum terhubung"}. Pengiriman otomatis: {d.channel.live ? "aktif" : "mati"}.
          </p>
          <p className="tm-note">Tidak ada yang dikirim sendiri kecuali Anda mengaktifkannya. Tombol WhatsApp hanya membuka pesan yang Anda kirim sendiri.</p>
        </>
      )}
    </section>
  );
}

export function OutboxSection({ onChange }: { onChange?: () => void }) {
  const [box, setBox] = useState<Outbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** When each staged item's window ends on this device's clock. */
  const [deadline, setDeadline] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const o = await call<Outbox>("/outbox");
      const t = Date.now();
      setDeadline(Object.fromEntries(o.items.filter((i) => i.status === "staged").map((i) => [i.id, t + i.seconds_left * 1000])));
      setBox(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const open = box?.items.some((i) => i.status === "staged") ?? false;
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);
  // When a countdown ends the server runs the item; fetch again to show "Sudah jalan".
  const expired = box?.items.some((i) => i.status === "staged" && (deadline[i.id] ?? 0) <= now) ?? false;
  useEffect(() => {
    if (!expired) return;
    const t = setTimeout(() => void load(), 1500);
    return () => clearTimeout(t);
  }, [expired, now, load]);

  return (
    <section className="kd-calm" aria-labelledby="kd-outbox">
      <h2 id="kd-outbox">Jalan sendiri, bisa dibatalkan</h2>
      <p className="jejak-why">Tindakan yang jalan sendiri menunggu {box ? Math.round(box.window_seconds / 60) : 10} menit dulu. Batalkan sebelum waktunya habis dan tindakan itu tidak pernah dikirim; jenisnya turun satu level. Setelah itu sudah jalan dan tidak bisa ditarik.</p>
      {error && <p className="jejak-verdict bad">{error}</p>}
      {!box ? (
        !error && <p className="tm-note">Memuat…</p>
      ) : box.items.length === 0 ? (
        <p className="tm-note">Belum ada tindakan yang jalan sendiri.</p>
      ) : (
        <ul className="tm-cards kd-outbox">
          {box.items.map((i) => (
            <OutCard key={i.id} item={i} left={Math.max(0, Math.ceil(((deadline[i.id] ?? now) - now) / 1000))} onDone={async () => (await load(), onChange?.())} />
          ))}
        </ul>
      )}
    </section>
  );
}

function OutCard({ item, left, onDone }: { item: OutItem; left: number; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState<string | null>(item.status === "undone" ? (item.undo_receipt ?? "") : null);
  const undo = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ receipt: string }>(`/outbox/${item.id}/undo`, {});
      setUndone(r.receipt);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await onDone();
    } finally {
      setBusy(false);
    }
  };
  const isUndone = undone !== null || item.status === "undone";
  const staged = item.status === "staged" && !isUndone;
  const receipt = isUndone ? (undone || item.undo_receipt) : (item.done_receipt ?? item.stage_receipt);
  return (
    <li className={`tm-card kd-out${isUndone ? " no" : item.status === "done" ? " yes" : ""}`}>
      <div className="tm-card-head">
        <span className="tm-id">{item.label}</span>
        <span>{item.subject ?? "-"}</span>
      </div>
      <p className="tm-title">{TOOL[item.tool] ?? item.tool}</p>
      {staged ? (
        <>
          <p className="kd-count" role="timer" aria-label="Sisa waktu untuk membatalkan">
            {mmss(left)}
          </p>
          <div className="tm-yesno">
            <button type="button" className="tm-no" disabled={busy || left <= 0} onClick={undo}>
              Batalkan
            </button>
          </div>
        </>
      ) : (
        <p className="tm-answered">
          {isUndone ? "Dibatalkan" : item.status === "done" ? "Sudah jalan" : item.status === "failed" ? "Gagal jalan" : "Sedang jalan"}
          {receipt && (
            <>
              {" "}
              · <a href={jejak(receipt)}>lihat bukti</a>
            </>
          )}
        </p>
      )}
      {error && <p className="jejak-verdict bad">{error}</p>}
    </li>
  );
}
