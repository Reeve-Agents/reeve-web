import "../studio/studio.css";
import "./auth.css";
import { Mail, MailCheck, ScanFace, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Banner, Button, Group, Screen, Sheet } from "../studio/ui";
import { auth, emailLinkToken } from "./session";

/** Where every signed-out visit lands, and where the email link comes back to. */
export function SignIn(props: { emailLogin: boolean; onSignedIn: () => void }) {
  const [busy, setBusy] = useState<"passkey" | "create" | "email" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  // "Start free" on the landing page arrives with ?new=1: open account creation straight away.
  const [creating, setCreating] = useState(() => new URLSearchParams(window.location.search).get("new") === "1");
  const [name, setName] = useState("");

  const run = async (label: typeof busy, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      props.onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Back from the email link: trade Supabase's token for a Reeve session, then clean the URL.
  useEffect(() => {
    const token = emailLinkToken();
    if (!token) return;
    history.replaceState(null, "", `${location.pathname}?view=studio`);
    void run("link", () => auth.finishEmailLink(token));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendLink = async () => {
    setBusy("email");
    setError(null);
    try {
      await auth.sendEmailLink(email);
      setSentTo(email.trim().toLowerCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ios">
      <div className="ios-shell auth">
        <Screen
          title={
            <>
              Masuk ke Reeve, <em>tanpa kata sandi.</em>
            </>
          }
        >
          <p className="ios-lede">Pakai passkey: Face ID, sidik jari, atau PIN HP kamu. Passkey yang sama dipakai untuk menyetujui aturan dan pembayaran.</p>

          {busy === "link" && <Banner tone="info">Membuka akun dari link email…</Banner>}
          {error && (
            <Banner tone="danger" onClose={() => setError(null)}>
              {error}
            </Banner>
          )}

          <div className="auth__actions">
            <Button icon={ScanFace} busy={busy === "passkey"} disabled={busy !== null} onClick={() => void run("passkey", auth.signInWithPasskey)}>
              Masuk dengan passkey
            </Button>
            <Button kind="tinted" icon={UserPlus} disabled={busy !== null} onClick={() => setCreating(true)}>
              Buat akun baru
            </Button>
          </div>

          {props.emailLogin && (
            <Group header="Atau lewat email" footer="Kami kirim link masuk sekali pakai. Cocok kalau HP-mu hilang atau perangkat ini belum punya passkey.">
              {sentTo ? (
                <li className="auth__sent">
                  <MailCheck size={22} strokeWidth={2.2} aria-hidden />
                  <span>
                    Link masuk sudah dikirim ke <b>{sentTo}</b>. Buka emailnya di perangkat ini.
                  </span>
                </li>
              ) : (
                <li className="ios-field">
                  <label htmlFor="auth-email">Email</label>
                  <input
                    id="auth-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="nama@usaha.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && email && void sendLink()}
                  />
                </li>
              )}
            </Group>
          )}
          {props.emailLogin && !sentTo && (
            <Button kind="plain" icon={Mail} busy={busy === "email"} disabled={busy !== null || !email.includes("@")} onClick={() => void sendLink()}>
              Kirim link masuk
            </Button>
          )}
          {sentTo && (
            <Button kind="plain" onClick={() => setSentTo(null)}>
              Pakai email lain
            </Button>
          )}
        </Screen>
      </div>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Buat akun baru">
        <p className="auth__sheet-lede">Perangkat ini akan membuat passkey untuk akun Reeve kamu. Tidak ada kata sandi yang perlu diingat.</p>
        <Group footer="Boleh dikosongkan. Bisa diubah nanti.">
          <li className="ios-field">
            <label htmlFor="auth-name">Nama usaha</label>
            <input id="auth-name" autoComplete="organization" placeholder="Bimbel Cerdas" value={name} onChange={(e) => setName(e.target.value)} />
          </li>
        </Group>
        <Button
          icon={ScanFace}
          busy={busy === "create"}
          disabled={busy !== null}
          onClick={() =>
            void run("create", async () => {
              await auth.createPasskey(name.trim() || undefined);
              setCreating(false);
            })
          }
        >
          Buat passkey
        </Button>
      </Sheet>
    </div>
  );
}
