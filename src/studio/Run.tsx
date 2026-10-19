import { startAuthentication } from "@simplewebauthn/browser";
import {
  Banknote,
  Check,
  ExternalLink,
  Play,
  ScanFace,
  Store,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  type GenericOperationRecord,
  type OperationRecord,
  type RailInfo,
  type RulebookRecord,
} from "../api";
import { dayDate, rupiah, toolWords } from "./plain";
import type { ScreenProps } from "./nav";
import { packOf } from "./useStudio";
import { Banner, Button, Group, Row, Screen, Sheet } from "./ui";

const DAY = 86_400_000;
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY)
    .toISOString()
    .slice(0, 10);
const dayNumber = (start: string, date: string) =>
  Math.round((Date.parse(date) - Date.parse(start)) / DAY) + 1;

const PAY: Record<string, [string, string]> = {
  paid: ["Lunas", "ios-pill--ok"],
  open: ["Belum bayar", "ios-pill--wait"],
  expired: ["Kedaluwarsa", "ios-pill--bad"],
  void: ["Dibatalkan", ""],
};

const ACTION: Record<string, string> = {
  invoice: "Tagihan dikirim",
  reminder: "Pengingat dikirim",
  late_fee: "Denda ditagihkan",
  notice: "Surat peringatan dikirim",
  payment: "Pembayaran tercatat",
  credit: "Kelebihan jadi saldo",
  refund_request: "Minta persetujuan refund",
  kpi_alert: "Target meleset",
};

export function RunScreen(props: ScreenProps) {
  const { s, go, back } = props;
  if (!s.record || !s.approved) {
    return (
      <Screen
        title="Jalankan"
        back={back}
        dock={
          <Button onClick={() => go(s.passed ? "approve" : "test")}>
            {s.passed ? "Ke Setujui" : "Ke uji coba"}
          </Button>
        }
      >
        <div className="ios-hero">
          <span className="ios-hero__mark ios-hero__mark--wait">
            <Play size={40} strokeWidth={2} aria-hidden />
          </span>
          <h2 className="ios-hero__title">Setujui dulu</h2>
          <p className="ios-hero__sub">
            Reeve baru bekerja di aplikasimu yang sungguhan setelah kamu
            menyetujui aturan yang lulus uji coba.
          </p>
        </div>
      </Screen>
    );
  }
  const pack = packOf(s.record.rulebook);
  if (pack === "minimarket") {
    return (
      <Screen title="Jalankan" back={back}>
        <div className="ios-hero">
          <span className="ios-hero__mark ios-hero__mark--wait">
            <Store size={40} strokeWidth={2} aria-hidden />
          </span>
          <h2 className="ios-hero__title">Untuk toko: segera</h2>
          <p className="ios-hero__sub">
            Aturan tokomu sudah lulus uji coba dan disetujui. Sambungan ke kasir
            dan supplier sedang kami siapkan.
          </p>
        </div>
      </Screen>
    );
  }
  return pack === "generic" ? (
    <GenericRun
      record={s.record}
      hasKey={(s.health?.passkeys ?? 0) > 0}
      onChange={s.refresh}
      back={back}
    />
  ) : (
    <RentRun
      record={s.record}
      hasKey={(s.health?.passkeys ?? 0) > 0}
      onChange={s.refresh}
      back={back}
    />
  );
}

function useGuard<T>(set: (v: T) => void, onChange: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guard = useCallback(
    async (label: string, fn: () => Promise<T | void>) => {
      setBusy(label);
      setError(null);
      try {
        const next = await fn();
        if (next) set(next);
        void onChange();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [set, onChange],
  );
  return { busy, error, setError, guard };
}

interface RunProps {
  record: RulebookRecord;
  hasKey: boolean;
  onChange: () => Promise<void>;
  back?: ScreenProps["back"];
}

// ── Rent: bills on a payment rail (test mode) ──

function RentRun({ record, hasKey, onChange, back }: RunProps) {
  const lineage = (record.lineage ?? []).join(",");
  const [rails, setRails] = useState<RailInfo[]>([]);
  const [rail, setRail] = useState("mock");
  const [op, setOp] = useState<OperationRecord | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [tenant, setTenant] = useState("");
  const [amount, setAmount] = useState(1_500_000);
  const { busy, error, setError, guard } = useGuard<OperationRecord>(
    setOp,
    onChange,
  );

  useEffect(() => {
    void api.rails().then((list) => {
      setRails(list);
      const first =
        list.find((r) => r.available && r.id !== "mock") ??
        list.find((r) => r.available);
      if (first) setRail(first.id);
    });
    const ids = [record.id, ...lineage.split(",").filter(Boolean)];
    void api
      .operations()
      .then((list) =>
        setOp(
          (list.find((o) => ids.includes(o.rulebookId) && !("kind" in o)) as
            OperationRecord | undefined) ?? null,
        ),
      );
  }, [record.id, lineage]);

  useEffect(() => {
    if (op?.status !== "running") return;
    const t = setInterval(async () => {
      const next = await api.operation(op.id);
      setOp(next);
      if (next.status !== "running") void onChange();
    }, 700);
    return () => clearInterval(t);
  }, [op, onChange]);

  const refund = (exId: string, needsPasskey: boolean) =>
    guard(`refund-${exId}`, async () => {
      if (!op) return;
      if (!needsPasskey) return api.refund(op.id, exId);
      const { options } = await api.refundOptions(op.id, exId);
      const response = await startAuthentication({
        optionsJSON: options as never,
      });
      return api.refundVerify(op.id, exId, response);
    });

  if (!op) {
    const chosen = rails.find((r) => r.id === rail);
    return (
      <Screen
        title="Jalankan"
        back={back}
        dock={
          <Button
            onClick={() =>
              guard("start", () => api.startOperation(record.id, rail))
            }
            busy={busy === "start"}
            disabled={!chosen?.available}
            icon={Play}
          >
            Mulai jalankan
          </Button>
        }
      >
        <p className="ios-lede">
          Penghuni membayar tagihan lewat penyedia pembayaran. Pilih salah satu.
        </p>
        {error && <Banner tone="danger">{error}</Banner>}
        <Group
          header="Terima pembayaran lewat"
          footer="Mode uji: tidak ada uang sungguhan yang berpindah. Kunci asli ditolak."
        >
          {rails.map((r) => (
            <Row
              key={r.id}
              icon={Banknote}
              tone={r.id === "mock" ? "plain" : "green"}
              title={r.id === "mock" ? "Simulasi" : `${r.label} (uji)`}
              subtitle={r.available ? r.note : "Belum diatur di server"}
              disabled={!r.available}
              onClick={() => setRail(r.id)}
              chevron={false}
              trailing={
                r.id === rail ? (
                  <Check
                    className="ios-check"
                    size={22}
                    strokeWidth={2.6}
                    aria-label="dipilih"
                  />
                ) : undefined
              }
            />
          ))}
        </Group>
      </Screen>
    );
  }

  const next = op.clock ? addDays(op.clock, 1) : op.startDate;
  const running = op.status === "running";
  const open = op.exceptions.filter((x) => x.status === "open");
  const nameOf = (id: string) => {
    const t = op.tenants.find((x) => x.id === id);
    return t ? `${t.room} · ${t.name}` : id;
  };
  const railName = rails.find((r) => r.id === op.rail)?.label ?? op.rail;

  return (
    <Screen
      title={
        op.clock ? `Hari ke-${dayNumber(op.startDate, op.clock)}` : "Jalankan"
      }
      back={back}
      dock={
        <>
          <Button
            onClick={() => guard("advance", () => api.advance(op.id, next))}
            busy={running || busy === "advance"}
            disabled={busy !== null}
            icon={Play}
          >
            {running
              ? "Aturan sedang berjalan…"
              : op.clock
                ? `Jalankan ${dayDate(next)}`
                : `Mulai ${dayDate(next)}: kirim tagihan`}
          </Button>
          {op.clock && (
            <div className="ios-btn-row">
              <Button
                kind="tinted"
                small
                onClick={() =>
                  guard("advance7", () =>
                    api.advance(op.id, addDays(op.clock!, 7)),
                  )
                }
                disabled={running || busy !== null}
              >
                Lompat 7 hari
              </Button>
              {op.invoices.length > 0 && (
                <Button
                  kind="tinted"
                  small
                  onClick={() =>
                    guard(
                      "refresh",
                      async () => (await api.refreshOperation(op.id)).operation,
                    )
                  }
                  busy={busy === "refresh"}
                  disabled={busy !== null}
                >
                  Cek pembayaran
                </Button>
              )}
              <Button
                kind="tinted"
                small
                onClick={() => {
                  setTenant(op.tenants[0]?.id ?? "");
                  setTransfer(true);
                }}
              >
                Catat transfer
              </Button>
            </div>
          )}
        </>
      }
    >
      <p className="ios-lede">
        {op.clock ? `${dayDate(op.clock)} · lewat ${railName}. ` : ""}Setiap
        hari Reeve menjalankan aturanmu yang sudah disetujui, lalu menagih hanya
        yang diputuskan aturan itu.
      </p>
      {(error || op.error) && (
        <Banner tone="danger" onClose={() => setError(null)}>
          {error ?? op.error}
        </Banner>
      )}

      {op.rulebookId !== record.id && (
        <Group
          header="Ada aturan baru"
          footer="Tagihan dan pembayaran sejauh ini tetap. Aturan baru berlaku mulai hari berikutnya."
        >
          <Row
            title="Pindahkan ke aturan yang baru"
            onClick={() => guard("upgrade", () => api.upgradeOperation(op.id))}
            disabled={busy !== null || running}
          />
        </Group>
      )}

      {open.length > 0 && (
        <Group header="Butuh keputusanmu">
          {open.map((x) => (
            <li key={x.id} className="ios-row">
              <div
                className="ios-row__hit"
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 10,
                }}
              >
                <span className="ios-row__title">{x.text}</span>
                <div className="ios-btn-row">
                  {x.kind === "kpi_alert" ? (
                    <Button
                      kind="tinted"
                      small
                      onClick={() =>
                        guard(`keep-${x.id}`, () => api.keepCredit(op.id, x.id))
                      }
                    >
                      Oke, sudah tahu
                    </Button>
                  ) : (
                    <>
                      <Button
                        kind="tinted"
                        small
                        onClick={() =>
                          guard(`keep-${x.id}`, () =>
                            api.keepCredit(op.id, x.id),
                          )
                        }
                        disabled={busy !== null}
                      >
                        Jadikan saldo
                      </Button>
                      <Button
                        small
                        onClick={() => refund(x.id, x.needsPasskey)}
                        busy={busy === `refund-${x.id}`}
                        disabled={busy !== null || (x.needsPasskey && !hasKey)}
                        icon={x.needsPasskey ? ScanFace : undefined}
                      >
                        Kembalikan {rupiah(x.amount)}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </Group>
      )}

      {op.invoices.length > 0 && (
        <Group header="Tagihan">
          {op.invoices.map((i) => {
            const [word, cls] = PAY[i.status] ?? [i.status, ""];
            return (
              <Row
                key={i.key}
                title={nameOf(i.tenant)}
                subtitle={`${i.kind === "rent" ? "Sewa" : "Denda"} · ${rupiah(i.amount)}`}
                trailing={
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {i.status === "open" && (
                      <Button
                        kind="tinted"
                        small
                        onClick={() =>
                          guard(`pay-${i.invoiceId}`, () =>
                            api.simulatePayment(op.id, i.invoiceId),
                          )
                        }
                        busy={busy === `pay-${i.invoiceId}`}
                        disabled={busy !== null}
                      >
                        Bayar (uji)
                      </Button>
                    )}
                    {i.payUrl && i.status === "open" ? (
                      <a
                        className="ios-pill ios-pill--wait"
                        href={i.payUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Buka halaman bayar"
                      >
                        <ExternalLink size={14} aria-hidden /> Bayar
                      </a>
                    ) : (
                      <span className={`ios-pill ${cls}`}>{word}</span>
                    )}
                  </span>
                }
              />
            );
          })}
        </Group>
      )}

      {op.actions.length > 0 && (
        <Group header="Aktivitas">
          {op.actions
            .slice(-12)
            .reverse()
            .map((a, n) => (
              <Row
                key={n}
                title={`${ACTION[a.type] ?? a.type}${a.amount ? ` · ${rupiah(a.amount)}` : ""}`}
                subtitle={`${dayDate(a.date)} · ${nameOf(a.tenant)}`}
                trailing={
                  a.outcome === "blocked" ? (
                    <span className="ios-pill ios-pill--bad">Ditahan</span>
                  ) : a.outcome === "logged" ? (
                    <span className="ios-pill">Dicatat</span>
                  ) : undefined
                }
              />
            ))}
        </Group>
      )}

      <Sheet
        open={transfer}
        onClose={() => setTransfer(false)}
        title="Catat transfer bank"
      >
        <Group footer="Untuk penghuni yang membayar langsung ke rekeningmu, bukan lewat halaman bayar.">
          <li className="ios-field">
            <label htmlFor="tf-tenant">Penghuni</label>
            <select
              id="tf-tenant"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
            >
              {op.tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.room} · {t.name}
                </option>
              ))}
            </select>
          </li>
          <li className="ios-field ios-row">
            <label htmlFor="tf-amount">Jumlah (Rp)</label>
            <input
              id="tf-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </li>
        </Group>
        <Button
          onClick={() =>
            void guard("transfer", () =>
              api.transfer(op.id, tenant, amount),
            ).then(() => setTransfer(false))
          }
          busy={busy === "transfer"}
          disabled={!tenant || amount < 1}
        >
          Catat {rupiah(amount || 0)}
        </Button>
      </Sheet>
    </Screen>
  );
}

// ── Any SOP: tool calls on the owner's connected apps ──

function GenericRun({ record, hasKey, onChange, back }: RunProps) {
  const [op, setOp] = useState<GenericOperationRecord | null>(null);
  const { busy, error, setError, guard } = useGuard<GenericOperationRecord>(
    setOp,
    onChange,
  );

  useEffect(() => {
    void api
      .operations()
      .then((list) =>
        setOp(
          (list.find(
            (o) =>
              o.rulebookId === record.id && "kind" in o && o.kind === "generic",
          ) as GenericOperationRecord | undefined) ?? null,
        ),
      );
  }, [record.id]);

  useEffect(() => {
    if (op?.status !== "running") return;
    const t = setInterval(async () => {
      const next = await api.genericOperation(op.id);
      setOp(next);
      if (next.status !== "running") void onChange();
    }, 700);
    return () => clearInterval(t);
  }, [op, onChange]);

  const approve = (hid: string) =>
    guard(`approve-${hid}`, async () => {
      if (!op) return;
      const { options } = await api.heldApproveOptions(op.id, hid);
      const response = await startAuthentication({
        optionsJSON: options as never,
      });
      return api.heldApproveVerify(op.id, hid, response);
    });

  if (!op) {
    return (
      <Screen
        title="Jalankan"
        back={back}
        dock={
          <Button
            onClick={() => guard("start", () => api.startGeneric(record.id))}
            busy={busy === "start"}
            icon={Play}
          >
            Mulai jalankan
          </Button>
        }
      >
        <div className="ios-hero">
          <span className="ios-hero__mark">
            <Play size={40} strokeWidth={2} aria-hidden />
          </span>
          <h2 className="ios-hero__title">Siap jalan</h2>
          <p className="ios-hero__sub">
            Setiap hari Reeve membaca datamu dan hanya mengirim yang diputuskan
            aturanmu, lewat aplikasi yang kamu sambungkan.
          </p>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
      </Screen>
    );
  }

  const next = op.clock ? addDays(op.clock, 1) : op.startDate;
  const running = op.status === "running";
  const open = op.held.filter((h) => h.status === "open");

  return (
    <Screen
      title={
        op.clock ? `Hari ke-${dayNumber(op.startDate, op.clock)}` : "Jalankan"
      }
      back={back}
      dock={
        <Button
          onClick={() =>
            guard("advance", () => api.advanceGeneric(op.id, next))
          }
          busy={running || busy === "advance"}
          disabled={busy !== null}
          icon={Play}
        >
          {running ? "Aturan sedang berjalan…" : `Jalankan ${dayDate(next)}`}
        </Button>
      }
    >
      <p className="ios-lede">
        {op.clock ? `Sampai ${dayDate(op.clock)}. ` : ""}Reeve hanya memakai
        aplikasi yang disebut aturanmu.
      </p>
      {(error || op.error) && (
        <Banner tone="danger" onClose={() => setError(null)}>
          {error ?? op.error}
        </Banner>
      )}

      {open.length > 0 && (
        <Group header="Butuh keputusanmu">
          {open.map((h) => (
            <li key={h.id} className="ios-row">
              <div
                className="ios-row__hit"
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 10,
                }}
              >
                <span className="ios-row__title">{h.text}</span>
                <div className="ios-btn-row">
                  {h.kind === "approval_request" && (
                    <Button
                      small
                      onClick={() => approve(h.id)}
                      busy={busy === `approve-${h.id}`}
                      disabled={busy !== null || !hasKey}
                      icon={ScanFace}
                    >
                      Kirim dengan Face ID
                    </Button>
                  )}
                  <Button
                    kind="tinted"
                    small
                    onClick={() =>
                      guard(`decline-${h.id}`, () =>
                        api.heldDecline(op.id, h.id),
                      )
                    }
                    disabled={busy !== null}
                  >
                    {h.kind === "approval_request"
                      ? "Jangan kirim"
                      : "Oke, sudah tahu"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </Group>
      )}

      {op.sent.length > 0 ? (
        <Group header="Yang sudah dikerjakan">
          {[...op.sent].reverse().map((a, i) => (
            <Row
              key={i}
              title={`${toolWords(a.tool)}${a.amount !== undefined ? ` · ${rupiah(a.amount)}` : ""}`}
              subtitle={`${dayDate(a.date)} · ${a.key}${a.error ? ` · ${a.error}` : ""}`}
              trailing={
                <span
                  className={`ios-pill ${a.ok ? (a.via === "log" ? "" : "ios-pill--ok") : "ios-pill--bad"}`}
                >
                  {a.ok ? (a.via === "log" ? "Dicatat" : "Terkirim") : "Gagal"}
                </span>
              }
            />
          ))}
        </Group>
      ) : (
        op.clock &&
        open.length === 0 && (
          <p className="ios-empty">
            Belum ada yang perlu dikerjakan di hari-hari ini.
          </p>
        )
      )}
    </Screen>
  );
}
