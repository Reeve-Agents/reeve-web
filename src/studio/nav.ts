import type { StepId, Studio } from "./useStudio";

export type Go = (s: StepId | "home") => void;

export interface ScreenProps {
  s: Studio;
  go: Go;
  back?: { label: string; onClick: () => void };
}

export function businessName(s: Studio) {
  return s.record?.rulebook.business_name?.trim() || "Bisnismu";
}
