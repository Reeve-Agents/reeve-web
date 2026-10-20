import {
  ArrowUp,
  BedDouble,
  CircleUserRound,
  CodeXml,
  FileSpreadsheet,
  FlaskConical,
  ListChecks,
  MessageCircle,
  Play,
  Plug,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PackId } from "../api";
import { plainRule, toolWords, type PlainRule } from "./plain";
import { ApproveScreen, ProofScreen, TestScreen, summaryOf } from "./Steps";
import { RunScreen } from "./Run";
import {
  Banner,
  Bubble,
  Button,
  Group,
  Progress,
  Row,
  RuleBlock,
  Screen,
  Sheet,
  useWide,
  type Tone,
} from "./ui";
import { businessName, type Go, type ScreenProps } from "./nav";
import { packOf, useStudio, type StepId, type Studio } from "./useStudio";
import "./studio.css";

export const STEP: Record<
  StepId,
  { title: string; short: string; icon: LucideIcon; tone: Tone }
> = {
  tell: {
    title: "Ceritakan bisnismu",
    short: "Ceritakan",
    icon: MessageCircle,
    tone: "blue",
  },
  rules: {
    title: "Periksa aturannya",
    short: "Aturan",
    icon: ListChecks,
    tone: "violet",
  },
  test: {
    title: "Uji coba sebulan",
    short: "Uji coba",
    icon: FlaskConical,
    tone: "teal",
  },
  approve: {
    title: "Setujui",
    short: "Setujui",
    icon: ScanFace,
    tone: "green",
  },
  run: { title: "Jalankan", short: "Jalankan", icon: Play, tone: "lime" },
  proof: { title: "Bukti", short: "Bukti", icon: ShieldCheck, tone: "plain" },
};

const PACK: Record<PackId, { label: string; icon: LucideIcon; who: string }> = {
  "rent-collection": {
    label: "Kos / kontrakan",
    icon: BedDouble,
    who: "penghuni",
  },
  minimarket: { label: "Toko / minimarket", icon: Store, who: "barang" },
  generic: { label: "Bisnis lain", icon: Sparkles, who: "pelanggan" },
};

/** The owner studio: an iOS-style checklist of six steps, one task per screen. */
export function OwnerStudio() {
  const s = useStudio();
  const wide = useWide();
  const [screen, setScreen] = useState<StepId | "home">(
    () =>
      (new URLSearchParams(window.location.search).get(
        "step",
      ) as StepId | null) ?? "home",
  );

  useEffect(() => {
    const pop = (e: PopStateEvent) =>
      setScreen((e.state as { step?: StepId } | null)?.step ?? "home");
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const go: Go = useCallback((next) => {
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("step");
    else url.searchParams.set("step", next);
    window.history.pushState(
      { step: next === "home" ? undefined : next },
      "",
      url,
    );
    setScreen(next);
    window.scrollTo({ top: 0 });
  }, []);

  if (!s.loaded) {
    return (
      <div className="ios">
        <div className="ios-shell">
          <p className="ios-empty" style={{ paddingTop: "40dvh" }}>
            Membuka Reeve…
          </p>
        </div>
      </div>
    );
  }

  const shown: StepId | "home" = wide && screen === "home" ? s.current : screen;
  const detail =
    shown === "home" ? null : (
      <StepScreen key={shown} id={shown} s={s} go={go} back={!wide} />
    );

  return (
    <div className="ios">
      {wide ? (
        <div className="ios-shell ios-shell--split">
          <aside className="ios-side">
            <Home
              s={s}
              go={go}
              selected={shown === "home" ? undefined : shown}
              wide
            />
          </aside>
          <main className="ios-main">{detail}</main>
        </div>
      ) : (
        <div className="ios-shell">{detail ?? <Home s={s} go={go} />}</div>
      )}
    </div>
  );
}

function StepScreen({
  id,
  s,
  go,
  back,
}: {
  id: StepId;
  s: Studio;
  go: Go;
  back: boolean;
}) {
  const props = {
    s,
    go,
    back: back ? { label: "Reeve", onClick: () => go("home") } : undefined,
  };
  switch (id) {
    case "tell":
      return <TellScreen {...props} />;
    case "rules":
      return <RulesScreen {...props} />;
    case "test":
      return <TestScreen {...props} />;
    case "approve":
      return <ApproveScreen {...props} />;
    case "run":
      return <RunScreen {...props} />;
    case "proof":
      return <ProofScreen {...props} />;
  }
}

/** What each step says under its title on the home list. */
function subtitle(s: Studio, id: StepId): string {
  const st = s.state[id];
  const rules = s.record?.rulebook.cards.length ?? 0;
  switch (id) {
    case "tell":
      return s.record
        ? PACK[packOf(s.record.rulebook)].label
        : "Jelaskan seperti ke karyawan baru";
    case "rules":
      return st === "later"
        ? "Muncul setelah kamu bercerita"
        : st === "problem"
          ? `${s.record!.issues.length} hal perlu jawabanmu`
          : `${rules} aturan`;
    case "test": {
      if (st === "busy") return "Sedang diuji…";
      if (st === "done" && s.run?.results) {
        const { passed, total } = summaryOf(s.run.results);
        return `Lulus ${passed} dari ${total} pemeriksaan`;
      }
      if (st === "problem") return "Belum lulus, perlu diperbaiki";
      return st === "later"
        ? "Setelah aturannya siap"
        : "Coba dulu di bulan latihan";
    }
    case "approve":
      return st === "done"
        ? `Disetujui ${new Date(s.record!.approval?.at ?? s.record!.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`
        : st === "now"
          ? "Dengan Face ID atau sidik jari"
          : "Setelah uji coba lulus";
    case "run":
      return !s.runnable
        ? "Untuk toko: segera"
        : st === "now"
          ? "Siap dijalankan"
          : "Setelah kamu setujui";
    case "proof":
      return s.ledger?.entries.length
        ? `${s.ledger.entries.length} catatan, ${s.ledger.intact ? "semua utuh" : "ada yang berubah"}`
        : "Muncul setelah uji coba";
  }
}

function Home({
  s,
  go,
  selected,
  wide,
}: {
  s: Studio;
  go: Go;
  selected?: StepId;
  wide?: boolean;
}) {
  const next = STEP[s.current];
  return (
    <Screen
      title={
        <>
          {businessName(s)}, <em>berjalan sendiri.</em>
        </>
      }
      dock={
        wide ? undefined : (
          <Button onClick={() => go(s.current)} icon={next.icon}>
            {s.state[s.current] === "problem"
              ? `Perbaiki: ${next.short}`
              : `Lanjut: ${next.title}`}
          </Button>
        )
      }
    >
      <div>
        <div className="ios-status">
          <span>
            <strong>{s.doneCount} dari 6</strong> langkah selesai
          </span>
          <span>{s.approved ? "Aktif" : "Belum aktif"}</span>
        </div>
        <Progress done={s.doneCount} total={6} />
      </div>
      {s.error && (
        <Banner tone="danger" onClose={() => s.setError(null)}>
          {s.error}
        </Banner>
      )}
      <Group>
        {s.order.map((id) => {
          const st = s.state[id];
          return (
            <Row
              key={id}
              icon={STEP[id].icon}
              tone={STEP[id].tone}
              title={STEP[id].title}
              subtitle={subtitle(s, id)}
              current={wide ? selected === id : id === s.current}
              trailing={
                st === "done" ? (
                  <span className="ios-pill ios-pill--ok">Selesai</span>
                ) : st === "problem" ? (
                  <span className="ios-pill ios-pill--bad">Perlu dicek</span>
                ) : st === "busy" ? (
                  <span className="ios-pill ios-pill--wait">Berjalan</span>
                ) : undefined
              }
              onClick={() => go(id)}
            />
          );
        })}
      </Group>
      <Group footer="Semua uji coba berjalan di sandbox terpisah. Kunci aplikasi dan pembayaranmu tidak pernah sampai ke program.">
        <Row
          icon={Plug}
          tone="blue"
          title="Aplikasi yang tersambung"
          subtitle="Gmail, Google Sheets, Telegram dan lainnya"
          href="?view=apps"
        />
        <Row
          icon={Smartphone}
          tone="plain"
          title="Aplikasi pemilik di HP"
          subtitle="Lihat hari ini dan setujui dari mana saja"
          href="?view=owner"
        />
        <Row
          icon={CodeXml}
          tone="plain"
          title="Mode developer"
          subtitle="Log, kode dan detail teknis lengkap"
          href="?view=studio-pro"
        />
        <Row
          icon={CircleUserRound}
          tone="plain"
          title="Akun"
          subtitle="Passkey, email cadangan dan keluar"
          href="?view=akun"
        />
      </Group>
    </Screen>
  );
}

// ── Ceritakan: a chat with Reeve ──

function TellScreen({ s, go, back }: ScreenProps) {
  const [change, setChange] = useState("");
  const [lastChange, setLastChange] = useState<string | null>(null);
  const [sheets, setSheets] = useState(false);
  const [models, setModels] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const samePack = s.record && packOf(s.record.rulebook) === s.pack;
  const revising = Boolean(samePack);
  const busy = s.busy === "compile" || s.busy === "revise";
  const who = PACK[s.pack].who;
  const model = s.providers.find((p) => p.id === s.provider);
  const rules = s.record?.rulebook.cards.map(plainRule) ?? [];

  // Grow the composer with its text, up to the cap in CSS.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [s.sop, change, revising]);

  const send = () => {
    if (revising) {
      const text = change.trim();
      if (!text) return;
      setLastChange(text);
      setChange("");
      void s.revise(`${s.record!.sop}\n\nPerubahan dari pemilik: ${text}`);
    } else void s.compile(s.sop);
  };
  const canSend =
    !busy && (revising ? change.trim().length > 3 : s.sop.trim().length >= 20);

  return (
    <Screen
      title="Ceritakan"
      back={back}
      bottom={
        <div className="ios-composer">
          <div className="ios-composer__field">
            <textarea
              ref={area}
              rows={1}
              aria-label={
                revising ? "Tulis perubahan" : "Cerita cara kerja bisnismu"
              }
              placeholder={
                revising ? "Tulis perubahan…" : "Ceritakan cara kerja bisnismu…"
              }
              value={revising ? change : s.sop}
              onChange={(e) =>
                revising ? setChange(e.target.value) : s.setSop(e.target.value)
              }
            />
            <button
              type="button"
              className="ios-send"
              onClick={send}
              disabled={!canSend}
              aria-label="Kirim ke Reeve"
            >
              <ArrowUp size={20} strokeWidth={2.8} />
            </button>
          </div>
          <p className="ios-composer__hint">
            Dibaca oleh {model?.label ?? "model AI"} ·{" "}
            <button
              type="button"
              className="ios-btn--plain"
              style={{ color: "var(--tint)", cursor: "pointer" }}
              onClick={() => setModels(true)}
            >
              ganti
            </button>
          </p>
        </div>
      }
    >
      <div className="ios-chat" aria-live="polite">
        <Bubble from="reeve">
          Halo, aku Reeve. Bisnis apa yang mau kamu jalankan otomatis?
        </Bubble>
        <div className="ios-choices" role="group" aria-label="Jenis bisnis">
          {(s.packs.length
            ? s.packs.map((p) => p.id)
            : (Object.keys(PACK) as PackId[])
          ).map((id) => {
            const P = PACK[id];
            return (
              <button
                key={id}
                type="button"
                className="ios-choice"
                aria-pressed={s.pack === id}
                onClick={() => s.choosePack(id)}
                disabled={busy}
              >
                <P.icon size={18} aria-hidden /> {P.label}
              </button>
            );
          })}
        </div>

        {(s.pack === "generic" || s.pack === "rent-collection") && (
          <>
            <Bubble from="reeve">
              Daftar {who}mu ada di mana? Pakai contoh dulu juga boleh.
            </Bubble>
            <div className="ios-choices" role="group" aria-label="Sumber data">
              <button
                type="button"
                className="ios-choice"
                aria-pressed={s.datasetId === "" || s.datasetId === "sample"}
                onClick={() =>
                  s.setDatasetId(s.pack === "generic" ? "sample" : "")
                }
              >
                Pakai contoh
              </button>
              {s.datasets.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="ios-choice"
                  aria-pressed={s.datasetId === d.id}
                  onClick={() => s.setDatasetId(d.id)}
                >
                  {d.name}
                </button>
              ))}
              <button
                type="button"
                className="ios-choice"
                onClick={() => setSheets(true)}
              >
                <FileSpreadsheet size={18} aria-hidden /> Google Sheets
              </button>
              <button
                type="button"
                className="ios-choice"
                onClick={() => file.current?.click()}
                disabled={s.busy === "upload"}
              >
                <Upload size={18} aria-hidden />{" "}
                {s.busy === "upload" ? "Mengunggah…" : "File CSV"}
              </button>
              <input
                ref={file}
                className="ios-hidden-input"
                type="file"
                accept=".csv,text/csv"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void s.uploadCsv(f);
                  e.target.value = "";
                }}
              />
            </div>
          </>
        )}

        <Bubble from="reeve">
          {revising
            ? "Ini ceritamu yang sudah aku pahami. Mau ubah sesuatu? Tulis saja di bawah, misalnya “denda jadi 3%”."
            : "Sekarang ceritakan cara kerjamu sehari-hari, seperti menjelaskan ke karyawan baru. Aku sudah isi contoh di bawah, ubah sesukamu."}
        </Bubble>

        {s.record && revising && (
          <Bubble from="owner">
            {s.record.sop.split("\n").filter(Boolean).slice(0, 6).join("\n")}
            {s.record.sop.split("\n").filter(Boolean).length > 6 ? "\n…" : ""}
          </Bubble>
        )}
        {lastChange && <Bubble from="owner">{lastChange}</Bubble>}

        {busy && (
          <Bubble from="reeve">
            <span
              className="ios-spinner"
              style={{
                display: "inline-block",
                verticalAlign: "-3px",
                marginRight: 8,
              }}
              aria-hidden
            />
            Sedang membaca ceritamu…
          </Bubble>
        )}

        {s.record && revising && !busy && (
          <Bubble from="reeve">
            {s.record.parentId ? "Sudah aku perbarui. " : ""}Aku menemukan{" "}
            {rules.length} aturan.
            {s.record.issues.length
              ? ` Ada ${s.record.issues.length} hal yang perlu kamu jawab.`
              : ""}
            <div className="rule-stack" style={{ marginTop: 10 }}>
              {rules.slice(0, 2).map((r) => (
                <RuleBlock key={r.id} rule={r} />
              ))}
            </div>
            <Button kind="tinted" small onClick={() => go("rules")}>
              Lihat semua aturan
            </Button>
          </Bubble>
        )}

        {s.error && (
          <Banner tone="danger" onClose={() => s.setError(null)}>
            {s.error}
          </Banner>
        )}
      </div>

      <SheetsImport open={sheets} onClose={() => setSheets(false)} s={s} />
      <Sheet
        open={models}
        onClose={() => setModels(false)}
        title="Siapa yang membaca ceritamu"
      >
        <Group footer="Model mana pun yang kamu pilih, Auditor memeriksa hasilnya dengan cara yang sama.">
          {s.providers.map((p) => (
            <Row
              key={p.id}
              title={p.label}
              subtitle={
                p.available
                  ? `${p.price}${p.note ? ` · ${p.note}` : ""}`
                  : "Belum diatur di server"
              }
              disabled={!p.available}
              onClick={() => {
                s.setProvider(p.id);
                setModels(false);
              }}
              chevron={false}
              trailing={
                p.id === s.provider ? (
                  <span className="ios-pill ios-pill--ok">Dipakai</span>
                ) : undefined
              }
            />
          ))}
        </Group>
      </Sheet>
    </Screen>
  );
}

/** Pull rows from a Google Sheet through the connected Google account. */
function SheetsImport({
  open,
  onClose,
  s,
}: {
  open: boolean;
  onClose: () => void;
  s: Studio;
}) {
  const [link, setLink] = useState("");
  const [range, setRange] = useState("Sheet1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id =
    link.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] ??
    (/^[a-zA-Z0-9-_]{20,}$/.test(link.trim()) ? link.trim() : "");
  const pull = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api.datasetFromApp(
        `Google Sheets ${range}`,
        "GOOGLESHEETS_VALUES_GET",
        { spreadsheet_id: id, range },
      );
      s.setDatasetId(d.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Ambil dari Google Sheets">
      <Group
        footer={
          <>
            Lewat akun Google yang tersambung. Belum tersambung? Buka{" "}
            <a href="?view=apps">Aplikasi yang tersambung</a>.
          </>
        }
      >
        <li className="ios-field">
          <label htmlFor="sheet-link">Link spreadsheet</label>
          <input
            id="sheet-link"
            inputMode="url"
            autoComplete="off"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </li>
        <li className="ios-field ios-row">
          <label htmlFor="sheet-range">Nama tab</label>
          <input
            id="sheet-range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          />
        </li>
      </Group>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button onClick={pull} disabled={!id || !range.trim()} busy={busy}>
        Ambil datanya
      </Button>
    </Sheet>
  );
}

// ── Aturan: Shortcuts-style blocks ──

function RulesScreen({ s, go, back }: ScreenProps) {
  const [editing, setEditing] = useState<PlainRule | null>(null);
  const [answer, setAnswer] = useState<{
    card: string;
    message: string;
  } | null>(null);
  const [text, setText] = useState("");
  const [detail, setDetail] = useState(false);
  if (!s.record) {
    return (
      <Screen
        title="Aturan"
        back={back}
        dock={
          <Button onClick={() => go("tell")}>Ceritakan bisnismu dulu</Button>
        }
      >
        <p className="ios-lede">
          Aturan muncul di sini setelah kamu bercerita ke Reeve.
        </p>
      </Screen>
    );
  }
  const rules = s.record.rulebook.cards.map(plainRule);
  const changed = new Map(
    (s.record.diff ?? [])
      .filter((d) => d.kind !== "removed")
      .map((d) => [d.id, d.kind as "added" | "changed"]),
  );
  const groups: [PlainRule["kind"], string][] = [
    ["when", "Yang Reeve kerjakan"],
    ["never", "Batasan"],
    ["target", "Target"],
  ];
  const checks = (s.record.toolChecks ?? []).filter(
    (c, i, all) => all.findIndex((x) => x.tool === c.tool) === i,
  );
  const save = () => {
    const what = editing
      ? `aturan "${editing.when}: ${editing.then}"`
      : answer
        ? `pertanyaan "${answer.message}"`
        : "aturan";
    void s
      .revise(
        `${s.record!.sop}\n\nPerubahan dari pemilik untuk ${what}: ${text.trim()}`,
      )
      .then((ok) => {
        if (!ok) return;
        setEditing(null);
        setAnswer(null);
        setText("");
      });
  };
  const close = () => {
    setEditing(null);
    setAnswer(null);
    setText("");
  };

  return (
    <Screen
      title="Aturan"
      back={back}
      trailing={
        <button
          type="button"
          className="ios-btn ios-btn--plain"
          onClick={() => setDetail(true)}
        >
          Lihat detail
        </button>
      }
      dock={
        <Button
          onClick={() => {
            void s.test();
            go("test");
          }}
          disabled={s.busy !== null || s.record.issues.length > 0}
          icon={FlaskConical}
        >
          Uji coba aturan ini
        </Button>
      }
    >
      <p className="ios-lede">
        Ini yang Reeve pahami dari ceritamu. Ketuk aturan untuk mengubahnya.
      </p>

      {s.error && (
        <Banner tone="danger" onClose={() => s.setError(null)}>
          {s.error}
        </Banner>
      )}

      {s.record.issues.length > 0 && (
        <Group
          header="Perlu jawabanmu"
          footer="Uji coba bisa dimulai setelah semua terjawab."
        >
          {s.record.issues.map((i) => (
            <Row
              key={i.card + i.message}
              icon={TriangleAlert}
              tone="danger"
              title={i.message}
              onClick={() => setAnswer(i)}
            />
          ))}
        </Group>
      )}

      {groups.map(([kind, header]) => {
        const list = rules.filter((r) => r.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <h2 className="ios-group__header">{header}</h2>
            <div className="rule-stack">
              {list.map((r) => (
                <RuleBlock
                  key={r.id}
                  rule={r}
                  changed={changed.get(r.id)}
                  onClick={() => setEditing(r)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {(s.record.rulebook.questions ?? []).length > 0 && (
        <Group
          header="Pertanyaan dari Reeve"
          footer="Tidak wajib. Jawabanmu membuat aturannya lebih tepat."
        >
          {s.record.rulebook.questions.map((q) => (
            <Row
              key={q}
              icon={MessageCircle}
              tone="blue"
              title={q}
              onClick={() => setAnswer({ card: "question", message: q })}
            />
          ))}
        </Group>
      )}

      {checks.length > 0 && (
        <Group
          header="Aplikasi yang dipakai"
          footer={
            <>
              Yang belum tersambung hanya dicatat, belum dikirim. Sambungkan di{" "}
              <a href="?view=apps">Aplikasi yang tersambung</a>.
            </>
          }
        >
          {checks.map((c) => (
            <Row
              key={c.tool}
              title={toolWords(c.tool)}
              trailing={
                c.status === "ok" ? (
                  <span className="ios-pill ios-pill--ok">Tersambung</span>
                ) : c.status === "log_only" ? (
                  <span className="ios-pill">Dicatat saja</span>
                ) : (
                  <span className="ios-pill ios-pill--bad">
                    {c.status === "not_connected"
                      ? "Belum tersambung"
                      : "Perlu dicek"}
                  </span>
                )
              }
            />
          ))}
        </Group>
      )}

      <Sheet
        open={Boolean(editing || answer)}
        onClose={close}
        title={answer ? "Jawab pertanyaan" : "Ubah aturan ini"}
      >
        {editing && <RuleBlock rule={editing} />}
        {answer && <Banner tone="info">{answer.message}</Banner>}
        <Group footer="Perubahan disimpan sebagai versi baru. Versi yang sudah disetujui tetap berlaku sampai kamu setujui yang baru.">
          <li className="ios-field">
            <label htmlFor="rule-change">
              {answer ? "Jawabanmu" : "Mau diubah jadi apa?"}
            </label>
            <textarea
              id="rule-change"
              autoFocus
              placeholder={
                answer ? "Tulis jawabanmu…" : "Contoh: kirim pengingat H+2 saja"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </li>
        </Group>
        {s.error && <Banner tone="danger">{s.error}</Banner>}
        <Button
          onClick={save}
          disabled={text.trim().length < 3}
          busy={s.busy === "revise"}
        >
          Simpan perubahan
        </Button>
      </Sheet>

      <Sheet
        open={detail}
        onClose={() => setDetail(false)}
        title="Detail aturan"
      >
        <Group>
          <Row title="Dibaca oleh" value={s.record.provider} />
          <Row
            title="Versi"
            value={
              s.record.parentId
                ? `revisi dari ${s.record.parentId.slice(0, 8)}`
                : "pertama"
            }
          />
          <Row title="Status" value={s.record.status} />
        </Group>
        <pre className="ios-code">
          {JSON.stringify(s.record.rulebook, null, 2)}
        </pre>
      </Sheet>
    </Screen>
  );
}
