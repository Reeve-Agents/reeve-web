import type { RuleCard, SimEvent } from "../api";

/** Rule cards in the owner's words: a Shortcuts-style block of "kalau → lakukan", "jangan pernah", or "target". */
export interface PlainRule {
  id: string;
  kind: "when" | "never" | "target";
  when: string;
  then: string;
  note?: string;
}

export const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

const TOOLS: Record<string, string> = {
  GMAIL_SEND_EMAIL: "Kirim email lewat Gmail",
  TELEGRAM_SEND_MESSAGE: "Kirim pesan Telegram",
  WHATSAPP_SEND_MESSAGE: "Kirim pesan WhatsApp",
  GOOGLESHEETS_VALUES_UPDATE: "Tulis ke Google Sheets",
  GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND: "Tambah baris di Google Sheets",
  LOG: "Catat saja",
};
export const toolWords = (tool: string) => TOOLS[tool] ?? tool.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const OPS: Record<string, string> = { lt: "kurang dari", lte: "paling banyak", gt: "lebih dari", gte: "minimal", neq: "bukan" };
function condition(c: { field: string; op: string; value: string | number | null }) {
  const f = c.field.replace(/_/g, " ");
  if (c.op === "days_until_lte") return `${f} tinggal ${c.value} hari lagi atau kurang`;
  if (c.op === "days_since_gte") return `${f} sudah lewat ${c.value} hari`;
  if (c.op === "empty") return `${f} masih kosong`;
  if (c.op === "not_empty") return `${f} sudah terisi`;
  if (c.op === "eq") return `${f}: ${c.value}`;
  return `${f} ${OPS[c.op] ?? c.op} ${c.value}`;
}
function schedule(s: { every: string; weekday: number | null; day_of_month: number | null }) {
  if (s.every === "week") return `Setiap ${DAYS[s.weekday ?? 0]}`;
  if (s.every === "month") return `Setiap tanggal ${s.day_of_month}`;
  return "Setiap hari";
}

export function plainRule(c: RuleCard): PlainRule {
  const id = c.id;
  switch (c.type) {
    case "invoice_schedule":
      return { id, kind: "when", when: `Tanggal ${c.day_of_month} setiap bulan`, then: "Kirim tagihan sewa ke semua penghuni" };
    case "reminder":
      return { id, kind: "when", when: `Belum bayar, ${c.days_after_due.map((d) => `H+${d}`).join(" dan ")}`, then: "Kirim pengingat" };
    case "late_fee":
      return {
        id,
        kind: "when",
        when: `Masih belum lunas di H+${c.days_after_due}`,
        then: `Tambah denda ${c.percent}% dari ${c.basis === "rent" ? "harga sewa" : "sisa tagihan"}`,
        note: c.tenure_grace ? `Penghuni ${c.tenure_grace.min_months} bulan ke atas dapat tambahan ${c.tenure_grace.extra_days} hari` : undefined,
      };
    case "notice":
      return { id, kind: "when", when: `Masih belum lunas di H+${c.days_after_due}`, then: "Kirim surat peringatan untuk keluar" };
    case "overpayment":
      return { id, kind: "when", when: "Penghuni membayar lebih", then: c.policy === "credit_next_invoice" ? "Jadikan saldo untuk tagihan berikutnya" : "Kembalikan setelah kamu setujui" };
    case "max_fee":
      return { id, kind: "never", when: "Jangan pernah", then: `Total denda lebih dari ${c.max_percent_of_rent}% harga sewa` };
    case "approval_threshold":
      return { id, kind: "never", when: "Tanpa persetujuanmu", then: `Refund di atas ${rupiah(c.refund_above)}` };
    case "revenue_target":
      return { id, kind: "target", when: `Target ${rupiah(c.monthly_target)} per bulan`, then: `Dicek tanggal ${c.alert_day}; kamu dikabari kalau meleset` };
    case "reorder_point":
      return { id, kind: "when", when: `Stok di rak dan yang dipesan kurang dari ${c.below_units}`, then: `Pesan ke Supplier ${c.supplier} sampai ${c.order_up_to_units}` };
    case "supplier_fallback":
      return { id, kind: "when", when: `Supplier telat ${c.late_days} hari`, then: `Pindahkan pesanan ke Supplier ${c.backup_supplier}` };
    case "expiry_markdown":
      return { id, kind: "when", when: `${c.days_before_expiry} hari sebelum kedaluwarsa`, then: `Diskon ${c.percent}%` };
    case "slow_mover_stop":
      return { id, kind: "when", when: `Tidak laku ${c.no_sale_days} hari`, then: "Berhenti memesan ulang" };
    case "po_approval_threshold":
      return { id, kind: "never", when: "Tanpa persetujuanmu", then: `Pesanan di atas ${rupiah(c.po_above)}` };
    case "markdown_floor":
      return { id, kind: "never", when: "Jangan pernah", then: "Diskon sampai di bawah harga modal" };
    case "expiring_value_limit":
      return { id, kind: "target", when: `Barang hampir kedaluwarsa maksimal ${rupiah(c.max_value)}`, then: `Dicek tiap ${DAYS[c.check_weekday] ?? "minggu"} untuk ${c.window_days} hari ke depan` };
    case "generic_rule":
      return {
        id,
        kind: "when",
        when: [schedule(c.schedule), ...c.conditions.map(condition)].join(c.match === "any" ? ", atau " : ", "),
        then: toolWords(c.action.tool),
        note: c.once_per_record ? "Sekali saja per data" : undefined,
      };
    case "generic_never":
      return { id, kind: "never", when: "Jangan pernah", then: `${c.tool === "*" ? "Kirim apa pun" : toolWords(c.tool)} kalau ${c.conditions.map(condition).join(" dan ")}` };
    case "generic_approval":
      return { id, kind: "never", when: "Tanpa persetujuanmu", then: `${c.tool === "*" ? "Aksi apa pun" : toolWords(c.tool)} di atas ${rupiah(c.amount_above)}` };
    case "generic_kpi":
      return {
        id,
        kind: "target",
        when: `${c.aggregate === "sum" ? `Total ${c.field?.replace(/_/g, " ")}` : "Jumlah data"} ${c.alert_if === "above" ? "di atas" : "di bawah"} ${c.aggregate === "sum" ? rupiah(c.threshold) : c.threshold}`,
        then: `${schedule(c.schedule)}; kamu dikabari`,
      };
  }
}

/** Simulation totals, in words, for the practice month. */
export function monthWords(summary: Record<string, number>): { label: string; value: string }[] {
  const money = new Set(["invoiced", "collected", "fees", "credits", "purchase_value", "writeoff_value", "sales"]);
  const words: Record<string, string> = {
    invoiced: "Ditagihkan",
    collected: "Terkumpul",
    fees: "Denda",
    credits: "Saldo penghuni",
    kpi_alerts: "Peringatan target",
    refund_requests: "Permintaan refund",
    sales: "Penjualan",
    purchase_orders: "Pesanan ke supplier",
    purchase_value: "Nilai pesanan",
    approval_requests: "Menunggu persetujuanmu",
    supplier_switches: "Pindah supplier",
    markdowns: "Diskon kedaluwarsa",
    writeoff_value: "Dibuang",
    stockouts: "Stok habis",
    records: "Data",
    actions: "Aksi",
    blocked: "Ditahan aturan larangan",
  };
  return Object.entries(summary)
    .filter(([k]) => words[k])
    .map(([k, v]) => ({ label: words[k]!, value: money.has(k) ? rupiah(v) : String(v) }));
}

const EVENT: Partial<Record<SimEvent["type"], string>> = {
  invoice: "Tagihan dikirim",
  reminder: "Pengingat dikirim",
  late_fee: "Denda ditambahkan",
  notice: "Surat peringatan dikirim",
  payment: "Pembayaran masuk",
  credit: "Kelebihan bayar jadi saldo",
  refund_request: "Minta persetujuan refund",
  kpi_alert: "Target meleset",
  po_created: "Pesanan ke supplier",
  po_approval_request: "Pesanan menunggu persetujuanmu",
  po_received: "Barang datang",
  supplier_switched: "Pindah supplier",
  stockout: "Stok habis",
  markdown: "Diskon kedaluwarsa",
  writeoff: "Barang dibuang",
  reorder_stopped: "Berhenti pesan ulang",
  action: "Aksi",
  approval_request: "Menunggu persetujuanmu",
  blocked: "Ditahan aturan larangan",
};

/** One simulated or real event as a short line for an activity list. */
export function eventWords(e: Pick<SimEvent, "type" | "tool" | "amount">): string {
  const base = e.type === "action" && e.tool ? toolWords(e.tool) : (EVENT[e.type] ?? e.type);
  return e.amount ? `${base} · ${rupiah(e.amount)}` : base;
}

export const dayDate = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
export const longDate = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
