import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/**
 * The signed-in account. The session is an httpOnly cookie the API sets; this page never sees it.
 * A passkey (Face ID, fingerprint or the phone's PIN) is the account; an email link is the backup.
 */

export interface Account {
  id: string;
  name: string | null;
  email: string | null;
  passkeys: number;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

/** Turns the browser's own passkey errors into everyday words. */
function plain(err: unknown): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  if (e.name === "NotAllowedError" || e.name === "AbortError") return new Error("Dibatalkan. Coba lagi kapan saja.");
  if (e.name === "InvalidStateError") return new Error("Perangkat ini sudah punya passkey untuk akun ini.");
  if (e.name === "NotSupportedError") return new Error("Perangkat ini belum mendukung passkey. Pakai link email.");
  return e;
}

export const auth = {
  me: async (): Promise<{ account: Account | null; emailLogin: boolean }> => {
    const res = await fetch("/api/auth/me");
    const json = (await res.json().catch(() => ({}))) as { account?: Account; emailLogin?: boolean };
    return { account: res.ok ? (json.account ?? null) : null, emailLogin: Boolean(json.emailLogin) };
  },
  /** New account (signed out), or this device's passkey added to the signed-in account. */
  createPasskey: async (name?: string) => {
    try {
      const optionsJSON = await post<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/passkey/register/options", { name });
      const response = await startRegistration({ optionsJSON });
      return (await post<{ account: Account }>("/passkey/register/verify", { response })).account;
    } catch (err) {
      throw plain(err);
    }
  },
  signInWithPasskey: async () => {
    try {
      const optionsJSON = await post<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/passkey/login/options");
      const response = await startAuthentication({ optionsJSON });
      return (await post<{ account: Account }>("/passkey/login/verify", { response })).account;
    } catch (err) {
      throw plain(err);
    }
  },
  sendEmailLink: (email: string) => post<{ sent: true }>("/email/start", { email }),
  /** The magic link lands back here with Supabase's token in the URL fragment. */
  finishEmailLink: (accessToken: string) => post<{ account: Account }>("/email/verify", { access_token: accessToken }).then((r) => r.account),
  signOut: () => post<{ ok: true }>("/logout"),
};

/** Supabase's magic link puts `#access_token=…` on the URL it redirects back to. */
export function emailLinkToken(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return hash.get("access_token");
}

/** Any API call that comes back 401 means the session ended: tell the app to show the sign-in page. */
export function watchForSignOut(onSignedOut: () => void) {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (res.status === 401 && url.includes("/api/") && !url.includes("/api/auth/")) onSignedOut();
    return res;
  };
}
