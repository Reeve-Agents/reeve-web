import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PlainRule } from "./plain";

/** iOS building blocks on the landing's night palette: inset grouped lists, filled buttons, sheets. */

export function useWide(): boolean {
  const query = "(min-width: 960px)";
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Navigation bar: a back button on pushed screens, then the large title. */
export function Screen(props: {
  title: ReactNode;
  back?: { label: string; onClick: () => void };
  trailing?: ReactNode;
  children: ReactNode;
  dock?: ReactNode;
  bottom?: ReactNode;
  id?: string;
}) {
  return (
    <section
      className="ios-screen"
      id={props.id}
      aria-label={typeof props.title === "string" ? props.title : undefined}
    >
      <header className="ios-nav">
        {props.back ? (
          <button
            type="button"
            className="ios-back"
            onClick={props.back.onClick}
          >
            <ChevronLeft size={24} strokeWidth={2.4} aria-hidden />
            <span>{props.back.label}</span>
          </button>
        ) : (
          <span />
        )}
        {props.trailing}
      </header>
      <h1 className="ios-large-title">{props.title}</h1>
      <div className="ios-body">{props.children}</div>
      {props.dock && <div className="ios-dock">{props.dock}</div>}
      {props.bottom}
    </section>
  );
}

export function Group(props: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ios-group ${props.className ?? ""}`}>
      {props.header && <h2 className="ios-group__header">{props.header}</h2>}
      <ul className="ios-group__list">{props.children}</ul>
      {props.footer && <p className="ios-group__footer">{props.footer}</p>}
    </div>
  );
}

export type Tone =
  "lime" | "violet" | "blue" | "teal" | "green" | "plain" | "danger";

export function Tile({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <span className={`ios-tile ios-tile--${tone}`} aria-hidden>
      <Icon size={18} strokeWidth={2.2} />
    </span>
  );
}

/** One row of an inset list. With onClick or href it becomes a 44pt+ tap target with a chevron. */
export function Row(props: {
  icon?: LucideIcon;
  tone?: Tone;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  chevron?: boolean;
  current?: boolean;
  disabled?: boolean;
}) {
  const inner = (
    <>
      {props.icon && <Tile icon={props.icon} tone={props.tone ?? "plain"} />}
      <span className="ios-row__text">
        <span className="ios-row__title">{props.title}</span>
        {props.subtitle && (
          <span className="ios-row__subtitle">{props.subtitle}</span>
        )}
      </span>
      {props.value !== undefined && (
        <span className="ios-row__value">{props.value}</span>
      )}
      {props.trailing}
      {(props.chevron ?? Boolean(props.onClick || props.href)) && (
        <ChevronRight
          className="ios-row__chevron"
          size={18}
          strokeWidth={2.4}
          aria-hidden
        />
      )}
    </>
  );
  const cls = `ios-row${props.icon ? " ios-row--icon" : ""}${props.current ? " ios-row--current" : ""}`;
  return (
    <li className={cls} aria-current={props.current ? "step" : undefined}>
      {props.href ? (
        <a className="ios-row__hit" href={props.href}>
          {inner}
        </a>
      ) : props.onClick ? (
        <button
          type="button"
          className="ios-row__hit"
          onClick={props.onClick}
          disabled={props.disabled}
        >
          {inner}
        </button>
      ) : (
        <div className="ios-row__hit">{inner}</div>
      )}
    </li>
  );
}

export function Button(props: {
  kind?: "filled" | "tinted" | "plain" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  children: ReactNode;
  icon?: LucideIcon;
  small?: boolean;
  type?: "button" | "submit";
}) {
  const Icon = props.icon;
  return (
    <button
      type={props.type ?? "button"}
      className={`ios-btn ios-btn--${props.kind ?? "filled"}${props.small ? " ios-btn--small" : ""}${props.busy ? " is-busy" : ""}`}
      onClick={props.onClick}
      disabled={props.disabled || props.busy}
      aria-busy={props.busy || undefined}
    >
      {props.busy ? (
        <span className="ios-spinner" aria-hidden />
      ) : (
        Icon && (
          <Icon size={props.small ? 16 : 20} strokeWidth={2.3} aria-hidden />
        )
      )}
      <span>{props.children}</span>
    </button>
  );
}

/** Bottom sheet with a grabber; closes on the backdrop, the close button or Escape. */
export function Sheet(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", key);
    document.body.classList.add("ios-locked");
    return () => {
      window.removeEventListener("keydown", key);
      document.body.classList.remove("ios-locked");
      prev?.focus();
    };
  }, [props.open, props.onClose]);
  if (!props.open) return null;
  // Portalled to <body> so no animated ancestor can capture its fixed position.
  return createPortal(
    <div className="ios ios-portal">
      <div className="ios-sheet" role="presentation" onClick={props.onClose}>
        <div
          className="ios-sheet__panel"
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          tabIndex={-1}
          ref={panel}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="ios-sheet__grabber" aria-hidden />
          <header className="ios-sheet__head">
            <h2>{props.title}</h2>
            <button
              type="button"
              className="ios-sheet__close"
              onClick={props.onClose}
              aria-label="Tutup"
            >
              <X size={18} strokeWidth={2.6} />
            </button>
          </header>
          <div className="ios-sheet__body">{props.children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Bubble(props: {
  from: "reeve" | "owner";
  children: ReactNode;
}) {
  return (
    <div className={`ios-bubble ios-bubble--${props.from}`}>
      {props.children}
    </div>
  );
}

const TOKEN: Record<PlainRule["kind"], [string, string]> = {
  when: ["Kalau", "Lakukan"],
  never: ["", ""],
  target: ["Target", "Lalu"],
};

/** The signature object: a rule as a Shortcuts-style block, the same in chat, rules, test results and edits. */
export function RuleBlock({
  rule,
  onClick,
  changed,
}: {
  rule: PlainRule;
  onClick?: () => void;
  changed?: "added" | "changed";
}) {
  const [a, b] = TOKEN[rule.kind];
  const body = (
    <>
      {rule.kind === "never" ? (
        <p className="rule-block__line">
          <span className="rule-token">{rule.when}</span>
          <span>{rule.then}</span>
        </p>
      ) : (
        <>
          <p className="rule-block__line">
            <span className="rule-token">{a}</span>
            <span>
              {rule.kind === "target"
                ? rule.when.replace(/^Target /, "")
                : rule.when}
            </span>
          </p>
          <p className="rule-block__line">
            <span className="rule-token rule-token--then">{b}</span>
            <span>{rule.then}</span>
          </p>
        </>
      )}
      {rule.note && <p className="rule-block__note">{rule.note}</p>}
      {changed && (
        <span className="rule-block__badge">
          {changed === "added" ? "Baru" : "Diubah"}
        </span>
      )}
    </>
  );
  const cls = `rule-block rule-block--${rule.kind}`;
  return onClick ? (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-label={`Ubah aturan: ${rule.when} ${rule.then}`}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div
      className="ios-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`${done} dari ${total} langkah selesai`}
    >
      <span style={{ width: `${(done / total) * 100}%` }} />
    </div>
  );
}

export function Banner(props: {
  tone: "danger" | "info";
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className={`ios-banner ios-banner--${props.tone}`}
      role={props.tone === "danger" ? "alert" : "status"}
    >
      <p>{props.children}</p>
      {props.onClose && (
        <button type="button" onClick={props.onClose} aria-label="Tutup">
          <X size={16} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}
