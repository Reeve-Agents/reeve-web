import {
  Check,
  CircleCheck,
  CircleX,
  ExternalLink,
  FlaskConical,
  Landmark,
  LoaderCircle,
  Play,
  ScanFace,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, type LedgerView } from "../api";
import type { JobResults } from "@reeve/core";
import { dayDate, eventWords, longDate, monthWords, plainRule } from "./plain";
import { businessName, type ScreenProps } from "./nav";
import { Banner, Button, Group, Row, Screen, Sheet } from "./ui";

/** Every check the Builder's tests, the Auditor's spec and the planted defects ran, as one count. */
export function summaryOf(r: JobResults) {
  const total = r.builder_tests.ran + r.audit_spec.ran + r.mutation.total;
  const passed =
    r.builder_tests.ran -
    r.builder_tests.failed +
    (r.audit_spec.ran - r.audit_spec.failed) +
    r.mutation.killed;
  return { passed, total };
}

const STAGES = [
  "Menulis program dari aturanmu",
  "Menjalankan di sandbox terpisah",
  "Auditor mencoba merusaknya",
  "Mencatat hasil sebagai bukti",
];

function stageOf(log: { line: string }[], status: string): number {
  if (status === "queued") return 0;
  const text = log.map((l) => l.line.toLowerCase()).join("\n");
  if (/receipt|ledger/.test(text)) return 3;
  if (/audit|mutant|spec/.test(text)) return 2;
  if (/sandbox|createos|local/.test(text)) return 1;
  return 0;
}

// ── Uji coba ──

export function TestScreen({ s, go, back }: ScreenProps) {
  const [detail, setDetail] = useState(false);
  const run = s.run && s.run.rulebookId === s.record?.id ? s.run : null;
  const results = run?.results ?? null;

  if (!s.record) {
    return (
      <Screen
        title="Uji coba"
        back={back}
        dock={
          <Button onClick={() => go("tell")}>Ceritakan bisnismu dulu</Button>
        }
      >
        <p className="ios-lede">
          Uji coba dimulai setelah Reeve punya aturanmu.
        </p>
      </Screen>
    );
  }

  let hero: {
    mark: "ok" | "bad" | "wait";
    icon: typeof Check;
    title: string;
    sub: string;
  };
  let dock;
  if (!run) {
    hero = {
      mark: "wait",
      icon: FlaskConical,
      title: "Coba dulu di bulan latihan",
      sub: "Reeve menjalankan aturanmu pada satu bulan contoh. Lalu Auditor yang terpisah mencoba merusaknya, sebelum kamu menyetujui apa pun.",
    };
    dock = (
      <Button
        onClick={() => void s.test()}
        busy={s.busy === "test"}
        disabled={s.record.issues.length > 0}
        icon={Play}
      >
        Mulai uji coba
      </Button>
    );
  } else if (s.testing) {
    hero = {
      mark: "wait",
      icon: LoaderCircle,
      title: "Sedang diuji…",
      sub: "Biasanya kurang dari satu menit. Kamu boleh menutup layar ini.",
    };
    dock = undefined;
  } else if (run.status === "error") {
    hero = {
      mark: "bad",
      icon: CircleX,
      title: "Uji coba gagal berjalan",
      sub: "Ini masalah teknis, bukan aturanmu. Coba lagi sebentar lagi.",
    };
    dock = (
      <Button onClick={() => void s.test()} busy={s.busy === "test"}>
        Coba lagi
      </Button>
    );
  } else if (s.passed && results) {
    const { passed, total } = summaryOf(results);
    hero = {
      mark: "ok",
      icon: CircleCheck,
      title: `Lulus ${passed} dari ${total} pemeriksaan`,
      sub: `Auditor sengaja menanam ${results.mutation.total} kesalahan ke programnya, dan semuanya ketahuan. Aturanmu aman untuk disetujui.`,
    };
    dock = (
      <Button onClick={() => go("approve")} icon={ScanFace}>
        Lanjut: Setujui
      </Button>
    );
  } else {
    hero = {
      mark: "bad",
      icon: TriangleAlert,
      title: "Belum lulus",
      sub: "Auditor menemukan hal yang tidak sesuai ceritamu. Ubah aturannya, lalu uji lagi.",
    };
    dock = (
      <Button onClick={() => go("rules")} icon={TriangleAlert}>
        Ubah aturannya
      </Button>
    );
  }
  const Icon = hero.icon;
  const stage = run ? stageOf(run.log, run.status) : 0;
  const allFindings = run?.verdict?.findings ?? [];
  // On a pass the Auditor's notes are technical; they stay in "Lihat detail".
  const findings = s.passed
    ? []
    : allFindings.filter((f) => f.severity !== "info");
  const events =
    results?.simulation.events.filter(
      (e) => e.type !== "status" && e.type !== "sales",
    ) ?? [];

  return (
    <Screen
      title="Uji coba"
      back={back}
      trailing={
        run && (
          <button
            type="button"
            className="ios-btn ios-btn--plain"
            onClick={() => setDetail(true)}
          >
            Lihat detail
          </button>
        )
      }
      dock={dock}
    >
      <div className="ios-hero">
        <span
          className={`ios-hero__mark${hero.mark === "bad" ? " ios-hero__mark--bad" : hero.mark === "wait" ? " ios-hero__mark--wait" : ""}`}
        >
          <Icon
            size={40}
            strokeWidth={2}
            className={s.testing ? "ios-spin" : undefined}
            style={
              s.testing
                ? { animation: "ios-spin 1.1s linear infinite" }
                : undefined
            }
            aria-hidden
          />
        </span>
        <h2 className="ios-hero__title">{hero.title}</h2>
        <p className="ios-hero__sub">{hero.sub}</p>
      </div>

      {s.error && (
        <Banner tone="danger" onClose={() => s.setError(null)}>
          {s.error}
        </Banner>
      )}
      {run?.error && <Banner tone="danger">{run.error}</Banner>}

      {(s.testing || !run) && (
        <Group header={run ? "Langkahnya" : "Yang akan terjadi"}>
          {STAGES.map((label, i) => (
            <Row
              key={label}
              title={label}
              trailing={
                !run ? undefined : i < stage ? (
                  <Check
                    className="ios-check"
                    size={20}
                    strokeWidth={2.6}
                    aria-label="selesai"
                  />
                ) : i === stage ? (
                  <span className="ios-pill ios-pill--wait">Berjalan</span>
                ) : undefined
              }
            />
          ))}
        </Group>
      )}

      {findings.length > 0 && (
        <Group header="Yang ditemukan Auditor">
          {findings.map((f, i) => (
            <Row
              key={i}
              icon={TriangleAlert}
              tone={f.severity === "blocker" ? "danger" : "plain"}
              title={f.message}
              subtitle={
                f.severity === "blocker" ? "Harus diperbaiki" : "Catatan"
              }
            />
          ))}
        </Group>
      )}

      {results && !s.testing && (
        <>
          <Group
            header="Hasil bulan latihan"
            footer="Angka dari bulan contoh, bukan janji untuk bulan sungguhan."
          >
            {monthWords(results.simulation.summary).map((m) => (
              <Row key={m.label} title={m.label} value={m.value} />
            ))}
          </Group>
          {events.length > 0 && (
            <Group header="Contoh yang dikerjakan Reeve">
              {events.slice(0, 8).map((e, i) => (
                <Row
                  key={i}
                  title={eventWords(e)}
                  subtitle={`${dayDate(e.date)}${e.tenant_id && e.tenant_id !== "-" ? ` · ${e.tenant_id}` : ""}`}
                />
              ))}
            </Group>
          )}
        </>
      )}

      <Sheet
        open={detail}
        onClose={() => setDetail(false)}
        title="Detail uji coba"
      >
        {results && (
          <Group header="Pemeriksaan">
            <Row
              title="Tes dari Builder"
              value={`${results.builder_tests.ran - results.builder_tests.failed}/${results.builder_tests.ran}`}
            />
            <Row
              title="Spesifikasi Auditor"
              value={`${results.audit_spec.ran - results.audit_spec.failed}/${results.audit_spec.ran}`}
            />
            <Row
              title="Kesalahan tertanam yang ketahuan"
              value={`${results.mutation.killed}/${results.mutation.total}`}
            />
            <Row
              title="Batasan dilanggar"
              value={String(results.constraints.violations.length)}
            />
          </Group>
        )}
        {allFindings.length > 0 && (
          <Group header="Catatan Auditor">
            {allFindings.map((f, i) => (
              <Row
                key={i}
                title={f.message}
                subtitle={`${f.severity} · ${f.code}`}
              />
            ))}
          </Group>
        )}
        {run && (
          <Group header="Sandbox">
            <Row title="Tempat jalan" value={run.backend ?? "-"} />
            {run.sandboxId && (
              <Row
                title="Sandbox"
                subtitle={<span className="ios-mono">{run.sandboxId}</span>}
              />
            )}
            {run.receipt && (
              <Row
                title="Tanda terima"
                subtitle={
                  <span className="ios-mono">{run.receipt.receipt_hash}</span>
                }
              />
            )}
          </Group>
        )}
        {run?.rulesPy && (
          <div>
            <h2 className="ios-group__header">
              Program yang ditulis Builder (rules.py)
            </h2>
            <pre className="ios-code">{run.rulesPy}</pre>
          </div>
        )}
        {run && run.log.length > 0 && (
          <div>
            <h2 className="ios-group__header">Log</h2>
            <pre className="ios-code">
              {run.log
                .map(
                  (l) => `${(l.ms / 1000).toFixed(1).padStart(5)}s  ${l.line}`,
                )
                .join("\n")}
            </pre>
          </div>
        )}
      </Sheet>
    </Screen>
  );
}

// ── Setujui: a Face ID sheet ──

export function ApproveScreen({ s, go, back }: ScreenProps) {
  const [sheet, setSheet] = useState(false);
  const hasKey = (s.health?.passkeys ?? 0) > 0;
  const rules = s.record?.rulebook.cards.map(plainRule) ?? [];

  if (s.approved && s.record) {
    return (
      <Screen
        title="Setujui"
        back={back}
        dock={
          s.runnable ? (
            <Button onClick={() => go("run")} icon={Play}>
              Lanjut: Jalankan
            </Button>
          ) : undefined
        }
      >
        <div className="ios-hero">
          <span className="ios-hero__mark">
            <CircleCheck size={40} strokeWidth={2} aria-hidden />
          </span>
          <h2 className="ios-hero__title">Sudah kamu setujui</h2>
          <p className="ios-hero__sub">
            Reeve hanya menjalankan aturan ini. Perubahan apa pun butuh
            persetujuanmu lagi.
          </p>
        </div>
        <Group>
          <Row
            title="Disetujui"
            value={s.record.approval ? longDate(s.record.approval.at) : "-"}
          />
          {s.record.approval && (
            <Row
              title="Tercatat di bukti"
              value={`#${s.record.approval.ledgerSeq}`}
              onClick={() => go("proof")}
            />
          )}
        </Group>
      </Screen>
    );
  }

  if (!s.passed || !s.record || !s.run?.results) {
    return (
      <Screen
        title="Setujui"
        back={back}
        dock={<Button onClick={() => go("test")}>Ke uji coba</Button>}
      >
        <div className="ios-hero">
          <span className="ios-hero__mark ios-hero__mark--wait">
            <ScanFace size={40} strokeWidth={2} aria-hidden />
          </span>
          <h2 className="ios-hero__title">Uji coba dulu</h2>
          <p className="ios-hero__sub">
            Tombol setuju muncul setelah aturanmu lulus uji coba. Begitu Reeve
            menjaga bisnismu.
          </p>
        </div>
      </Screen>
    );
  }

  const { passed, total } = summaryOf(s.run.results);
  const nevers = rules.filter((r) => r.kind === "never").length;
  return (
    <Screen
      title="Setujui"
      back={back}
      dock={
        <Button onClick={() => setSheet(true)} icon={ScanFace}>
          Setujui dengan Face ID
        </Button>
      }
    >
      <p className="ios-lede">
        Periksa sekali lagi. Setelah kamu setujui, Reeve mulai bekerja dengan
        aturan ini.
      </p>
      <Group header="Yang kamu setujui">
        <Row
          icon={ShieldCheck}
          tone="violet"
          title={`${rules.length} aturan`}
          subtitle={nevers ? `Termasuk ${nevers} batasan` : undefined}
          onClick={() => go("rules")}
        />
        <Row
          icon={FlaskConical}
          tone="teal"
          title={`Lulus ${passed} dari ${total} pemeriksaan`}
          subtitle="Uji coba bulan latihan"
          onClick={() => go("test")}
        />
      </Group>
      <Group footer="Persetujuan memakai kunci perangkatmu (passkey). Reeve tidak pernah melihat sidik jari atau wajahmu.">
        <Row
          title="Perangkat ini"
          value={hasKey ? "Terdaftar" : "Belum terdaftar"}
        />
      </Group>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Setujui aturan"
      >
        <div className="ios-faceid">
          <span
            className={`ios-faceid__glyph${s.busy === "approve" || s.busy === "passkey" ? " is-busy" : ""}`}
          >
            <ScanFace size={52} strokeWidth={1.6} aria-hidden />
          </span>
          <h3 className="ios-hero__title">{businessName(s)}</h3>
          <p className="ios-hero__sub">
            {hasKey
              ? "Konfirmasi dengan Face ID, Touch ID atau kunci layar perangkatmu."
              : "Daftarkan perangkat ini sekali dulu, lalu setujui dengan Face ID, Touch ID atau kunci layar."}
          </p>
        </div>
        {s.error && <Banner tone="danger">{s.error}</Banner>}
        {!hasKey ? (
          <Button
            onClick={() => void s.registerPasskey()}
            busy={s.busy === "passkey"}
          >
            Daftarkan perangkat ini
          </Button>
        ) : (
          <Button
            onClick={() => void s.approve().then((ok) => ok && setSheet(false))}
            busy={s.busy === "approve"}
            icon={ScanFace}
          >
            {s.busy === "approve" ? "Menunggu perangkatmu…" : "Setujui"}
          </Button>
        )}
      </Sheet>
    </Screen>
  );
}

// ── Bukti: Wallet-style activity of the hash-chained ledger ──

const KIND: Record<string, string> = {
  receipt: "Uji coba",
  approval: "Persetujuan",
  operation: "Hari berjalan",
  anchor: "Disegel di blockchain",
};
type Entry = LedgerView["entries"][number];
const CHAIN: Record<string, string> = {
  "monad-testnet": "Monad (jaringan uji)",
  "base-sepolia": "Base Sepolia (jaringan uji)",
};
const kindWord = (e: Entry) =>
  e.kind === "anchor" && !e.tx
    ? "Disegel di catatan lokal"
    : (KIND[e.kind] ?? e.kind);

export function ProofScreen({ s, back }: ScreenProps) {
  const [anchor, setAnchor] = useState<{
    configured: boolean;
    chain?: string;
  } | null>(null);
  const [open, setOpen] = useState<Entry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{
    local: boolean;
    onChain: { ok: boolean; reason?: string } | null;
    reason?: string;
  } | null>(null);
  useEffect(() => {
    void api
      .anchorInfo()
      .then(setAnchor)
      .catch(() => setAnchor(null));
  }, []);
  const entries = s.ledger?.entries ?? [];
  const last = entries.find((e) => e.kind === "anchor");
  const receiptsSince = last
    ? entries.filter((e) => e.kind === "receipt" && e.seq > last.seq).length
    : entries.filter((e) => e.kind === "receipt").length;

  const seal = async () => {
    setBusy("seal");
    setError(null);
    try {
      await api.anchorNow();
      await s.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const verify = async (seq: number) => {
    setBusy("verify");
    setCheck(null);
    try {
      setCheck(await api.verifyAnchor(seq));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      title="Bukti"
      back={back}
      dock={
        anchor?.configured && receiptsSince > 0 ? (
          <Button onClick={seal} busy={busy === "seal"} icon={Landmark}>
            Segel {receiptsSince} catatan baru
          </Button>
        ) : undefined
      }
    >
      <div className="ios-hero">
        <span
          className={`ios-hero__mark${s.ledger && !s.ledger.intact ? " ios-hero__mark--bad" : ""}`}
        >
          <ShieldCheck size={40} strokeWidth={2} aria-hidden />
        </span>
        <h2 className="ios-hero__title">
          {!entries.length
            ? "Belum ada catatan"
            : s.ledger?.intact
              ? "Semua catatan utuh"
              : "Ada catatan yang berubah"}
        </h2>
        <p className="ios-hero__sub">
          Setiap uji coba, persetujuan dan hari berjalan dicatat berantai.
          Mengubah satu catatan akan merusak semua catatan sesudahnya.
        </p>
      </div>
      {error && (
        <Banner tone="danger" onClose={() => setError(null)}>
          {error}
        </Banner>
      )}

      {last && (
        <Group
          header="Segel terakhir"
          footer={
            last.tx
              ? "Sidik jari semua catatan diterbitkan di blockchain uji coba, jadi siapa pun bisa memeriksanya. Ini hanya bukti, bukan pembayaran."
              : "Segel ini hanya di catatan Reeve. Segel berikutnya diterbitkan di blockchain uji coba bila servernya sudah diatur."
          }
        >
          <Row
            icon={Landmark}
            tone="blue"
            title={
              last.tx
                ? `Disegel di ${CHAIN[String(last.anchor)] ?? String(last.anchor)}`
                : "Disegel di catatan lokal"
            }
            subtitle={`${String(last.leaves ?? "")} catatan · ${longDate(last.at)}`}
            onClick={() => setOpen(last)}
          />
        </Group>
      )}
      {!last && anchor && !anchor.configured && entries.length > 0 && (
        <Banner tone="info">
          Segel blockchain belum diatur di server ini. Catatan tetap berantai
          dan bisa diperiksa.
        </Banner>
      )}

      {entries.length > 0 && (
        <Group header="Catatan">
          {entries.map((e) => (
            <Row
              key={e.seq}
              title={kindWord(e)}
              subtitle={longDate(e.at)}
              value={`#${e.seq}`}
              onClick={() => setOpen(e)}
            />
          ))}
        </Group>
      )}

      <Sheet
        open={open !== null}
        onClose={() => {
          setOpen(null);
          setCheck(null);
        }}
        title={open ? `${kindWord(open)} #${open.seq}` : ""}
      >
        {open?.kind === "anchor" && (
          <>
            <div className="ios-btn-row">
              <Button
                kind="tinted"
                onClick={() => void verify(open.seq)}
                busy={busy === "verify"}
              >
                Periksa ke blockchain
              </Button>
              {typeof open.explorer === "string" && (
                <a
                  className="ios-btn ios-btn--tinted"
                  href={open.explorer}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={18} aria-hidden />{" "}
                  <span>Buka penjelajah</span>
                </a>
              )}
            </div>
            {check && (
              <Group>
                <Row
                  title="Catatan di Reeve cocok"
                  trailing={
                    <span
                      className={`ios-pill ${check.local ? "ios-pill--ok" : "ios-pill--bad"}`}
                    >
                      {check.local ? "Cocok" : "Tidak cocok"}
                    </span>
                  }
                />
                <Row
                  title="Blockchain memuat segel ini"
                  subtitle={check.onChain?.reason ?? check.reason}
                  trailing={
                    <span
                      className={`ios-pill ${check.onChain?.ok ? "ios-pill--ok" : "ios-pill--bad"}`}
                    >
                      {check.onChain === null
                        ? "Lokal saja"
                        : check.onChain.ok
                          ? "Cocok"
                          : "Tidak cocok"}
                    </span>
                  }
                />
              </Group>
            )}
          </>
        )}
        <pre className="ios-code">
          {open ? JSON.stringify(open, null, 2) : ""}
        </pre>
      </Sheet>
    </Screen>
  );
}
