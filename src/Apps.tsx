import "./studio/studio.css";
import "./apps.css";
import { ArrowLeft, Check, ExternalLink, KeyRound, Search, X, type LucideIcon, type LucideProps } from "lucide-react";
import { forwardRef, useCallback, useEffect, useState } from "react";
import { Banner, Button, Group, Row, Screen, Sheet } from "./studio/ui";

/**
 * Every app the owner can connect (Composio's catalog, about 1,600). The owner connects each one
 * themselves: Reeve asks Composio for a sign-in link and shows it in a sheet; the owner signs in or
 * enters the app's key on Composio's page, so Reeve never sees those credentials.
 */

interface AppInfo {
  name: string;
  slug: string;
  tools: number;
  triggers: number;
  auth: string[];
}

async function call<T>(method: string, path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { method });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

const AUTH_TEXT: Record<string, string> = { OAUTH2: "masuk akun", OAUTH1: "masuk akun", DCR_OAUTH: "masuk akun", API_KEY: "kunci API", BEARER_TOKEN: "token", BASIC: "nama pengguna + kata sandi", NO_AUTH: "tanpa masuk akun" };
const authText = (auth: string[]) => [...new Set(auth.map((a) => AUTH_TEXT[a] ?? a.toLowerCase().replace(/_/g, " ")))].join(" atau ");
const num = (n: number) => n.toLocaleString("id-ID");

/** The app's first letter drawn as an icon, so it sits in the same tile as the studio's icons. Cached per letter. */
const LETTERS = new Map<string, LucideIcon>();
function letterIcon(name: string): LucideIcon {
  const ch = (name.trim().slice(0, 1) || "?").toUpperCase();
  let icon = LETTERS.get(ch);
  if (!icon) {
    icon = forwardRef<SVGSVGElement, LucideProps>(({ size = 18 }, ref) => (
      <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <text x="12" y="17.5" textAnchor="middle" fill="currentColor" fontSize="17" fontWeight="700" fontFamily="inherit">
          {ch}
        </text>
      </svg>
    )) as LucideIcon;
    LETTERS.set(ch, icon);
  }
  return icon;
}

function ConnectSheet(props: { app: AppInfo; onClose: () => void; onConnected: () => void }) {
  const { app } = props;
  const [link, setLink] = useState<{ url: string; until: number } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "waiting" | "checking" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!link) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((link.until - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [link]);

  const start = async () => {
    setState("loading");
    setError(null);
    try {
      const r = await call<{ redirectUrl: string; expiresInMinutes: number }>("POST", `/apps/${app.slug}/connect`);
      setLink({ url: r.redirectUrl, until: Date.now() + r.expiresInMinutes * 60_000 });
      setLeft(r.expiresInMinutes * 60);
      setState("waiting");
      window.open(r.redirectUrl, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  const check = async () => {
    setState("checking");
    try {
      const s = await call<Record<string, number>>("GET", `/apps/status?slugs=${app.slug}`);
      if ((s[app.slug] ?? 0) > 0) {
        setState("done");
        props.onConnected();
      } else {
        setError("Belum tersambung. Selesaikan masuk akun di halaman Composio, lalu cek lagi.");
        setState("waiting");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("waiting");
    }
  };

  return (
    <Sheet open onClose={props.onClose} title={app.name}>
      <p className="apps-sheet__lede">
        {num(app.tools)} aksi yang bisa dipakai aturan Reeve · disambungkan dengan {authText(app.auth) || "masuk akun"}
      </p>
      {state === "done" ? (
        <Group>
          <Row icon={Check} tone="lime" title="Tersambung" subtitle={`Aturan sekarang bisa membaca dan bertindak di ${app.name}.`} />
        </Group>
      ) : (
        <Group header="Caranya">
          <Row icon={ExternalLink} tone="blue" title="Buka halaman masuk" subtitle="Halaman ini milik Composio, penghubung yang dipakai Reeve." />
          <Row icon={KeyRound} tone="violet" title={`Masuk ke ${app.name}`} subtitle="Atau tempel kunci API-nya di sana. Reeve tidak pernah melihatnya." />
          <Row icon={ArrowLeft} tone="teal" title="Kembali ke sini" subtitle={'Lalu ketuk "Sudah tersambung".'} />
        </Group>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="apps-sheet__actions">
        {state === "done" ? (
          <Button onClick={props.onClose}>Selesai</Button>
        ) : !link || left === 0 ? (
          <Button icon={ExternalLink} onClick={() => void start()} busy={state === "loading"}>
            {state === "loading" ? "Mengambil link…" : link ? "Ambil link baru" : "Buka halaman masuk"}
          </Button>
        ) : (
          <>
            <a className="ios-btn ios-btn--filled" href={link.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={20} strokeWidth={2.3} aria-hidden />
              <span>Buka halaman masuk</span>
            </a>
            <Button kind="tinted" icon={Check} onClick={() => void check()} busy={state === "checking"}>
              {state === "checking" ? "Mengecek…" : "Sudah tersambung"}
            </Button>
          </>
        )}
        {state !== "done" && (
          <Button kind="plain" onClick={props.onClose}>
            Batal
          </Button>
        )}
        {link && left > 0 && state !== "done" && (
          <p className="apps-sheet__timer">
            Link berlaku {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} lagi
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function AppsDirectory() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState<{ total: number; apps: AppInfo[]; canConnect: boolean } | null>(null);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const LIMIT = 24;

  const load = useCallback(async (query: string, from: number) => {
    setError(null);
    try {
      const p = await call<{ total: number; apps: AppInfo[]; canConnect: boolean }>("GET", `/apps?q=${encodeURIComponent(query)}&limit=${LIMIT}&offset=${from}`);
      setPage(p);
      if (p.apps.length) setStatus(await call<Record<string, number>>("GET", `/apps/status?slugs=${p.apps.map((a) => a.slug).join(",")}`).catch(() => ({})));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q, offset), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, offset, load]);

  const close = useCallback(() => setOpen(null), []);
  const search = (value: string) => (setOffset(0), setQ(value));
  const query = q.trim();

  return (
    <div className="ios">
      <div className="ios-shell apps">
        <Screen title="Sambungkan aplikasi" back={{ label: "Reeve", onClick: () => window.location.assign("/?view=studio") }}>
          <div className="apps__intro">
            <p className="ios-lede">
              {page && query ? `${num(page.total)} aplikasi cocok dengan "${query}".` : `${page ? `${num(page.total)} aplikasi` : "Aplikasi"} lewat Composio.`} Sambungkan yang dipakai SOP-mu. Setelah itu aturan Reeve bisa membaca dan bertindak di sana, dan setiap tindakan tetap dicek Auditor dan batas yang kamu atur.
            </p>
            <label className="apps-search">
              <Search size={18} strokeWidth={2.4} aria-hidden />
              <input type="search" placeholder="Cari: gmail, notion, clickup, odoo…" value={q} onChange={(e) => search(e.target.value)} aria-label="Cari aplikasi" enterKeyHint="search" autoComplete="off" />
              {q && (
                <button type="button" className="apps-search__clear" onClick={() => search("")} aria-label="Hapus pencarian">
                  <X size={14} strokeWidth={3} />
                </button>
              )}
            </label>
          </div>

          {page && !page.canConnect && <Banner tone="info">Composio belum disiapkan di server ini (COMPOSIO_API_KEY), jadi aplikasi bisa dilihat tapi belum bisa disambungkan.</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}

          {!page && !error && <p className="ios-empty">Memuat aplikasi…</p>}
          {page && page.apps.length === 0 && <p className="ios-empty">Tidak ada aplikasi yang cocok dengan "{query}".</p>}
          {page && page.apps.length > 0 && (
            <Group
              className="apps-list"
              header={query ? "Hasil pencarian" : "Semua aplikasi"}
              footer={page.total > LIMIT ? `${num(offset + 1)}–${num(Math.min(offset + LIMIT, page.total))} dari ${num(page.total)}` : undefined}
            >
              {page.apps.map((a) => {
                const connected = (status[a.slug] ?? 0) > 0;
                return (
                  <Row
                    key={a.slug}
                    icon={letterIcon(a.name)}
                    tone={connected ? "lime" : "plain"}
                    title={a.name}
                    subtitle={`${num(a.tools)} aksi${a.triggers ? ` · ${num(a.triggers)} pemicu` : ""} · ${authText(a.auth)}`}
                    chevron={false}
                    trailing={
                      connected ? (
                        <span className="ios-pill ios-pill--ok">Tersambung</span>
                      ) : (
                        <Button kind="tinted" small disabled={!page.canConnect} onClick={() => setOpen(a)}>
                          Sambungkan
                        </Button>
                      )
                    }
                  />
                );
              })}
            </Group>
          )}

          {page && page.total > LIMIT && (
            <nav className="apps__pager" aria-label="Halaman">
              <Button kind="tinted" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                Sebelumnya
              </Button>
              <Button kind="tinted" disabled={offset + LIMIT >= page.total} onClick={() => setOffset(offset + LIMIT)}>
                Berikutnya
              </Button>
            </nav>
          )}
        </Screen>
      </div>

      {open && <ConnectSheet app={open} onClose={close} onConnected={() => setStatus((s) => ({ ...s, [open.slug]: 1 }))} />}
    </div>
  );
}
