// "Temukan SOP": the owner has no written SOP. Reeve reads the WhatsApp chat export and the
// payments sheet, proposes rules with a confidence and the line it learned from, shows where the
// rules would have acted differently from the owner, and the owner taps Ya/Tidak on each one.
// Every tap is a receipt and a Meko trace. Signed-in only.
import { useState } from "react";
import "../explain/explain.css";
import "./temukan.css";
import "../kendali/kendali.css";

interface Cite {
  ref: string;
  text: string;
}
interface Candidate {
  id: string;
  kind: "card" | "exception";
  title: string;
  confidence: number;
  evidence: string;
  cites: Cite[];
}
interface Diff {
  month: string;
  subject: string;
  room: string;
  what: "reminder" | "fee" | "notice";
  rule: string;
  owner: string;
  cites: Cite[];
}
interface Replay {
  bills: number;
  agree: number;
  rate: number;
  diffs: Diff[];
}
interface State {
  id: string;
  business: string;
  stats: { chat_lines: number; payment_rows: number; tenants: number; months: string[] };
  candidates: Candidate[];
  replay: Replay;
  answers: Record<string, { yes: boolean; receipt: string }>;
  receipts: { mine: string; replay: string };
}
interface Result {
  mode: "aktif" | "belajar";
  confirmed: string[];
  rulebook?: { cards: { id: string; title: string }[] };
  replay?: Replay;
  audit?: { status: string; cases: number; killed: number; total: number };
  exceptions: string[];
  receipt: string;
  message: string;
}

const API = "/api/meko/owner/discovery";
const MIN = 3;
const WHAT: Record<Diff["what"], string> = { reminder: "Pengingat", fee: "Denda", notice: "Surat peringatan" };
const MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const month = (ym: string) => `${MONTH[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;
const jejak = (r: string) => `/?view=jejak&receipt=${r}`;

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: body === undefined ? "GET" : "POST", credentials: "include", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Gagal (${res.status})`);
  return json;
}

async function sheetRows(file: File): Promise<{ csv?: string; rows?: Record<string, unknown>[] }> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return { csv: await file.text() };
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : undefined;
  if (!sheet) throw new Error("File Excel ini kosong.");
  return { rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true }) };
}

export function TemukanPage() {
  const [chat, setChat] = useState<{ name: string; text: string } | null>(null);
  const [pay, setPay] = useState<{ name: string; csv?: string; rows?: Record<string, unknown>[] } | null>(null);
  const [business, setBusiness] = useState("Kos Melati");
  const [st, setSt] = useState<State | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const useSample = () =>
    run("sample", async () => {
      const s = await call<{ business: string; chat: string; payments: string }>("/sample");
      setChat({ name: "Chat WhatsApp Kos Melati.txt (contoh)", text: s.chat });
      setPay({ name: "pembayaran-kos-melati.csv (contoh)", csv: s.payments });
      setBusiness(s.business);
    });

  const start = () =>
    run("start", async () => {
      if (!chat || !pay) throw new Error("Pilih chat WhatsApp dan data pembayaran dulu.");
      setSt(await call<State>("", { chat: chat.text, payments_csv: pay.csv, payments_rows: pay.rows, business }));
      setResult(null);
      window.scrollTo({ top: 0 });
    });

  const answer = (c: Candidate, yes: boolean) =>
    run(c.id, async () => {
      if (!st) return;
      const r = await call<{ receipt: string; answers: State["answers"] }>(`/${st.id}/answer`, { candidate: c.id, yes });
      setSt({ ...st, answers: r.answers });
    });

  const finish = () =>
    run("finish", async () => {
      if (!st) return;
      setResult(await call<Result>(`/${st.id}/finish`, {}));
      window.scrollTo({ top: 0 });
    });

  const confirmedRules = st ? st.candidates.filter((c) => c.kind === "card" && st.answers[c.id]?.yes).length : 0;
  const answered = st ? Object.keys(st.answers).length : 0;

  return (
    <div className="jejak temukan">
      <header className="jejak-head">
        <a className="jejak-brand" href="/?view=studio">
          Reeve
        </a>
        <nav className="kd-nav">
          <a className="jejak-report" href="/?view=kendali">
            Kendali
          </a>
          <a className="jejak-report" href="/?view=jejak">
            Jejak keputusan
          </a>
        </nav>
      </header>
      <main>
        <h1>Temukan SOP dari kebiasaan Anda</h1>
        <p className="jejak-sub">Belum punya SOP tertulis? Reeve membaca chat WhatsApp dan catatan pembayaran, lalu mengusulkan aturan. Anda tinggal jawab Ya atau Tidak.</p>
        {error && <p className="jejak-verdict bad">{error}</p>}

        {result ? (
          <Done result={result} onAgain={() => (setResult(null), setSt(null))} />
        ) : !st ? (
          <section className="tm-input">
            <div className="jejak-group">
              <label className="tm-file">
                <span className="tm-file-label">1. Chat WhatsApp</span>
                <span className="tm-file-hint">{chat ? chat.name : "WhatsApp > grup/chat > Ekspor chat > Tanpa media (.txt)"}</span>
                <input type="file" accept=".txt,text/plain" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void f.text().then((text) => setChat({ name: f.name, text }));
                }} />
              </label>
              <label className="tm-file">
                <span className="tm-file-label">2. Data pembayaran</span>
                <span className="tm-file-hint">{pay ? pay.name : "Excel atau CSV: tanggal, kamar, nama, jenis, jumlah, mulai sewa"}</span>
                <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void run("sheet", async () => setPay({ name: f.name, ...(await sheetRows(f)) }));
                }} />
              </label>
              <label className="tm-file">
                <span className="tm-file-label">Nama usaha</span>
                <input className="tm-text" value={business} onChange={(e) => setBusiness(e.target.value)} maxLength={80} />
              </label>
            </div>
            <p className="tm-note">Nama penghuni diganti kode (K01, K02, …) sebelum disimpan. Aturan dicari oleh kode, bukan AI, jadi riwayat Anda tidak dikirim ke model bahasa.</p>
            <div className="tm-actions">
              <button type="button" className="tm-primary" disabled={!chat || !pay || !!busy} onClick={start}>
                {busy === "start" ? "Membaca riwayat…" : "Cari aturannya"}
              </button>
              <button type="button" className="tm-secondary" disabled={!!busy} onClick={useSample}>
                Pakai contoh Kos Melati
              </button>
            </div>
            <TenantLink />
            <ShareRapor />
          </section>
        ) : (
          <>
            <p className="tm-stats">
              {st.stats.chat_lines} pesan · {st.stats.payment_rows} pembayaran · {st.stats.tenants} kamar · {st.stats.months.map(month).join(", ")}
            </p>
            <h2>Usulan aturan</h2>
            <ul className="tm-cards">
              {st.candidates.map((c) => {
                const a = st.answers[c.id];
                return (
                  <li key={c.id} className={`tm-card${a ? (a.yes ? " yes" : " no") : ""}`}>
                    <div className="tm-card-head">
                      <span className="tm-id">{c.kind === "exception" ? "Pengecualian" : c.id}</span>
                      <span className="tm-conf" aria-label={`Keyakinan ${Math.round(c.confidence * 100)}%`}>
                        <span className="tm-bar">
                          <span style={{ width: `${Math.round(c.confidence * 100)}%` }} />
                        </span>
                        {Math.round(c.confidence * 100)}%
                      </span>
                    </div>
                    <p className="tm-title">{c.title}</p>
                    <p className="tm-evidence">{c.evidence}</p>
                    {c.cites.map((x) => (
                      <blockquote key={x.ref} className="tm-cite">
                        <span className="tm-ref">{x.ref.replace("chat:", "chat baris ").replace("bayar:", "pembayaran baris ")}</span>
                        {x.text}
                      </blockquote>
                    ))}
                    {a ? (
                      <p className="tm-answered">
                        {a.yes ? "Disetujui" : "Ditolak"} ·{" "}
                        <a href={jejak(a.receipt)} target="_blank" rel="noreferrer">
                          lihat bukti
                        </a>
                      </p>
                    ) : (
                      <div className="tm-yesno">
                        <button type="button" className="tm-yes" disabled={!!busy} onClick={() => answer(c, true)}>
                          Ya, benar
                        </button>
                        <button type="button" className="tm-no" disabled={!!busy} onClick={() => answer(c, false)}>
                          Tidak
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <h2>Kalau aturan ini dipakai di bulan-bulan lalu</h2>
            <p className="jejak-why">
              Aturan cocok dengan tindakan Anda di <b>{st.replay.agree}</b> dari {st.replay.bills} tagihan. {st.replay.diffs.length ? "Yang berbeda:" : "Tidak ada yang berbeda."}
            </p>
            {st.replay.diffs.length > 0 && <Diffs diffs={st.replay.diffs} />}
            <p className="tm-note">
              Usulan dan uji ulang ini tercatat sebagai jejak: <a href={jejak(st.receipts.mine)}>Builder</a> · <a href={jejak(st.receipts.replay)}>Auditor</a>
            </p>

            <div className="tm-finish">
              <p>
                {answered}/{st.candidates.length} dijawab · {confirmedRules} aturan disetujui{confirmedRules < MIN ? ` (minimal ${MIN} supaya Reeve bisa jalan sendiri)` : ""}
              </p>
              <button type="button" className="tm-primary" disabled={!!busy || answered === 0} onClick={finish}>
                {busy === "finish" ? "Menguji aturan…" : "Selesai, uji aturannya"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Diffs({ diffs }: { diffs: Diff[] }) {
  return (
    <ul className="tm-diffs">
      {diffs.map((d, i) => (
        <li key={i}>
          <p className="tm-diff-head">
            {month(d.month)} · kamar {d.room} ({d.subject}) · {WHAT[d.what]}
          </p>
          <p>
            Aturan: {d.rule}. Anda: {d.owner}.
          </p>
          {d.cites.map((x) => (
            <blockquote key={x.ref} className="tm-cite">
              <span className="tm-ref">{x.ref}</span>
              {x.text}
            </blockquote>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Done({ result, onAgain }: { result: Result; onAgain: () => void }) {
  const ok = result.mode === "aktif";
  return (
    <section>
      <p className={`jejak-verdict ${ok ? "ok" : "bad"}`}>{result.message}</p>
      {ok && result.rulebook && (
        <>
          <h2>SOP Anda</h2>
          <ul className="tm-rules">
            {result.rulebook.cards.map((c) => (
              <li key={c.id}>
                <span className="tm-id">{c.id}</span> {c.title}
              </li>
            ))}
          </ul>
          {result.audit && (
            <p className="jejak-why">
              Auditor menulis {result.audit.cases} kasus uji dari aturan ini dan menanam {result.audit.total} cacat sengaja: {result.audit.killed} tertangkap.
            </p>
          )}
          {result.replay && (
            <p className="jejak-why">
              Dengan aturan yang Anda setujui saja, hasilnya cocok dengan tindakan Anda di {result.replay.agree} dari {result.replay.bills} tagihan.
            </p>
          )}
        </>
      )}
      {!ok && (
        <p className="jejak-why">
          Reeve tidak menagih atau mengirim apa pun sendiri. Anda bisa <a href="/?view=studio">mulai dari SOP contoh</a> dan mengubahnya, atau mengunggah riwayat yang lebih panjang.
        </p>
      )}
      <div className="tm-actions">
        <a className="tm-primary" href={jejak(result.receipt)}>
          Lihat jejak keputusannya
        </a>
        <button type="button" className="tm-secondary" onClick={onAgain}>
          Ulangi dengan file lain
        </button>
      </div>
    </section>
  );
}

/** "Kenapa saya didenda?": link one tenant's Telegram, or send the traced answer by wa.me yourself. */
function TenantLink() {
  const [subject, setSubject] = useState("K05");
  const [out, setOut] = useState<{ url?: string | null; code?: string; wa?: string; text?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const post = async <T,>(path: string, body: unknown) => {
    const res = await fetch(`/api/meko/owner${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(j.error ?? `Gagal (${res.status})`);
    return j;
  };
  const go = (fn: () => Promise<void>) => {
    setErr(null);
    fn().catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  };
  return (
    <section className="tm-tenant">
      <h2>Penghuni bertanya "kenapa saya didenda?"</h2>
      <p className="tm-note">Jawaban diambil dari jejak keputusan dan ledger, dengan tautan bukti. Reeve tidak mengirim WhatsApp sendiri: tautan wa.me Anda buka dan kirim sendiri.</p>
      <div className="tm-actions">
        <input className="tm-text" value={subject} onChange={(e) => setSubject(e.target.value.toUpperCase())} maxLength={4} aria-label="Kode penghuni" />
        <button type="button" className="tm-secondary" onClick={() => go(async () => setOut(await post<{ url: string | null; code: string }>("/telegram/link", { subject })))}>
          Tautan Telegram
        </button>
        <button type="button" className="tm-secondary" onClick={() => go(async () => {
          const a = await post<{ wa_me: string; text: string }>("/explain/whatsapp", { subject, question: "Kenapa saya didenda?" });
          setOut({ wa: a.wa_me, text: a.text });
        })}>
          Jawaban lewat WhatsApp
        </button>
      </div>
      {err && <p className="jejak-verdict bad">{err}</p>}
      {out?.code && (
        <p className="tm-note">
          {out.url ? <a href={out.url}>{out.url}</a> : <>Kirim <code>/start {out.code}</code> ke bot Telegram kos.</>} Berlaku 24 jam, sekali pakai.
        </p>
      )}
      {out?.wa && (
        <>
          <blockquote className="tm-cite">{out.text}</blockquote>
          <div className="tm-actions">
            <a className="tm-primary" href={out.wa} target="_blank" rel="noreferrer">
              Buka WhatsApp
            </a>
          </div>
        </>
      )}
    </section>
  );
}

interface Share {
  subject: string;
  created_at: string;
  active: boolean;
  receipt: string;
}

/** Rapor Usaha share links: metrics only, revocable; whether a link works is read from the ledger. */
function ShareRapor() {
  const [label, setLabel] = useState("");
  const [shares, setShares] = useState<Share[] | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const req = async <T,>(path: string, body?: unknown) => {
    const res = await fetch(`/api/meko/owner/rapor${path}`, { method: body === undefined ? "GET" : "POST", credentials: "include", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(j.error ?? `Gagal (${res.status})`);
    return j;
  };
  const refresh = async () => setShares((await req<{ shares: Share[] }>("/shares")).shares);
  const go = (fn: () => Promise<void>) => {
    setErr(null);
    fn().catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  };
  return (
    <section className="tm-tenant">
      <h2>Bagikan Rapor Usaha</h2>
      <p className="tm-note">Tautan hanya berisi angka, tanpa nama penghuni dan isi percakapan. Penerima bisa menghitung ulang buktinya di browser. Bisa dicabut kapan saja.</p>
      <div className="tm-actions">
        <input className="tm-text tm-wide" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Untuk siapa (mis. Bank BPR)" aria-label="Untuk siapa" />
        <button type="button" className="tm-secondary" onClick={() => go(async () => {
          const s = await req<{ url: string }>("/share", { label: label || undefined });
          setMade(s.url);
          await refresh();
        })}>
          Buat tautan
        </button>
        <button type="button" className="tm-secondary" onClick={() => go(refresh)}>
          Lihat tautan
        </button>
      </div>
      {err && <p className="jejak-verdict bad">{err}</p>}
      {made && (
        <p className="tm-note">
          Tautan baru (simpan sekarang, tidak ditampilkan lagi): <a href={made}>{made}</a>
        </p>
      )}
      {shares && (
        <ul className="tm-rules">
          {shares.length === 0 && <li>Belum ada tautan.</li>}
          {shares.map((s) => (
            <li key={s.subject}>
              {new Date(s.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} · {s.active ? "aktif" : "dicabut"} · <a href={`/?view=jejak&receipt=${s.receipt}`}>bukti</a>{" "}
              {s.active && (
                <button type="button" className="tm-no" onClick={() => go(async () => {
                  await req("/revoke", { subject: s.subject });
                  await refresh();
                })}>
                  Cabut
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
