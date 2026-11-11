import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal shape of the browser's speech recognizer (Chrome, Edge, Safari). */
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type Ctor = new () => Recognizer;

const ctor = (): Ctor | undefined => {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const MESSAGES: Record<string, string> = {
  "not-allowed": "Izin mikrofon ditolak. Aktifkan di pengaturan browser.",
  "service-not-allowed": "Izin mikrofon ditolak. Aktifkan di pengaturan browser.",
  "no-speech": "Suara tidak terdengar. Coba lagi.",
  "audio-capture": "Mikrofon tidak ditemukan.",
  network: "Pengenalan suara butuh internet.",
};

/**
 * Dictation into a text box. `base` is the text already there; the spoken words stream after it.
 * `supported` is false where the browser has no speech API: hide the button then.
 */
export function useVoice(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognizer | null>(null);
  const supported = typeof window !== "undefined" && Boolean(ctor());

  useEffect(() => () => rec.current?.stop(), []);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(
    (base: string) => {
      const C = ctor();
      if (!C) return;
      setError(null);
      const r = new C();
      r.lang = "id-ID";
      r.continuous = true;
      r.interimResults = true;
      const prefix = base && !/\s$/.test(base) ? `${base} ` : base;
      let finalText = "";
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res) continue;
          const part = res[0].transcript;
          if (res.isFinal) finalText += part;
          else interim += part;
        }
        onText(`${prefix}${finalText}${interim}`.replace(/\s+/g, " ").trimStart());
      };
      r.onerror = (e) => {
        if (e.error !== "aborted") setError(MESSAGES[e.error] ?? "Suara tidak bisa dikenali.");
      };
      r.onend = () => {
        setListening(false);
        rec.current = null;
      };
      rec.current = r;
      try {
        r.start();
        setListening(true);
      } catch {
        setError("Mikrofon sedang dipakai.");
      }
    },
    [onText],
  );

  return { supported, listening, error, start, stop };
}
