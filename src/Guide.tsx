import { createContext, useEffect, useRef, useState } from "react";
import type { RulebookRecord, RunRecord } from "./api";

export type StepState = "done" | "current" | "running" | "fail" | "locked";
export interface Step {
  id: string;
  label: string;
  state: StepState;
}

/** Open a step (on a phone only one is open at a time) and scroll to it. */
export const goTo = (id: string) => {
  window.dispatchEvent(new CustomEvent("reeve:open", { detail: id }));
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
};

/** True on phone-sized screens; the studio folds into one open step with a docked action bar. */
export function usePhone(): boolean {
  const query = "(max-width: 640px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

/** Which step is unfolded on a phone, plus a one-line summary for each folded one. */
export interface Fold {
  phone: boolean;
  open: string;
  summaries: Record<string, string>;
  toggle: (id: string) => void;
}
export const FoldContext = createContext<Fold>({ phone: false, open: "", summaries: {}, toggle: () => undefined });

/** Where the owner is in Describe → Rules → Audit → Approve → Run → Proof. */
export function stepsFor(record: RulebookRecord | null, run: RunRecord | null, hasRun: boolean): Step[] {
  const running = run?.status === "queued" || run?.status === "running";
  const passed = run?.status === "done" && run.verdict?.status === "pass";
  const failed = run?.status === "error" || (run?.status === "done" && run.verdict?.status === "fail");
  const approved = record?.status === "approved";
  const steps: Step[] = [
    { id: "describe", label: "Describe", state: record ? "done" : "current" },
    { id: "compile", label: "Rules", state: !record ? "locked" : record.issues.length ? "fail" : "done" },
    { id: "audit", label: "Audit", state: !record ? "locked" : running ? "running" : passed ? "done" : failed ? "fail" : "current" },
    { id: "approve", label: "Approve", state: approved ? "done" : passed ? "current" : "locked" },
  ];
  if (hasRun) steps.push({ id: "run", label: "Run", state: approved ? "current" : "locked" });
  steps.push({ id: "prove", label: "Proof", state: run?.receipt ? "done" : "locked" });
  return steps;
}

const MARK: Record<StepState, string> = { done: "✓", current: "•", running: "…", fail: "!", locked: "" };

/** Sticky progress bar; on a phone it scrolls sideways. */
export function Stepper({ steps }: { steps: Step[] }) {
  const nav = useRef<HTMLElement>(null);
  const key = steps.map((s) => s.state).join(",");
  // Keep the step that needs attention visible when the bar scrolls sideways on a phone.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>(".step--current, .step--fail, .step--running");
    if (el && nav.current) nav.current.scrollTo({ left: el.offsetLeft - nav.current.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [key]);
  return (
    <nav className="stepper" aria-label="Progress" ref={nav}>
      <ol>
        {steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={`step step--${s.state}`} onClick={() => goTo(s.id)} aria-current={s.state === "current" ? "step" : undefined}>
              <span className="step__n">{MARK[s.state] || i + 1}</span>
              <span>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** One plain sentence on what to do now, with the button that does it. */
export function NextStep(props: { text: string; action?: { label: string; onClick: () => void; disabled?: boolean }; dock?: boolean }) {
  return (
    <div className={`next-step${props.dock ? " next-step--dock" : ""}`} role="status">
      <span className="eyebrow">Next</span>
      <p>{props.text}</p>
      {props.action && (
        <button className="primary" onClick={props.action.onClick} disabled={props.action.disabled}>
          {props.action.label}
        </button>
      )}
    </div>
  );
}
