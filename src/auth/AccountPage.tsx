import "../studio/studio.css";
import "./auth.css";
import { KeyRound, LogOut, Mail, MailCheck, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";
import { Banner, Button, Group, Row, Screen } from "../studio/ui";
import { auth, type Account } from "./session";

/** ?view=akun: who is signed in, this device's passkey, the backup email, and signing out. */
export function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [emailLogin, setEmailLogin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    void auth.me().then((r) => {
      setAccount(r.account);
      setEmailLogin(r.emailLogin);
    });
  }, []);

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ios">
      <div className="ios-shell">
        <Screen title="Akun" back={{ label: "Reeve", onClick: () => window.location.assign("/?view=studio") }}>
          {error && (
            <Banner tone="danger" onClose={() => setError(null)}>
              {error}
            </Banner>
          )}
          {notice && <Banner tone="info">{notice}</Banner>}

          <Group header="Masuk">
            <Row icon={KeyRound} tone="lime" title="Passkey" subtitle="Face ID, sidik jari atau PIN untuk masuk dan menyetujui" value={account ? String(account.passkeys) : "…"} />
            <Row icon={Mail} tone="blue" title="Email cadangan" subtitle={account?.email ?? "Belum ada. Dipakai kalau passkey tidak bisa."} />
          </Group>

          <Button
            kind="tinted"
            icon={ScanFace}
            busy={busy === "passkey"}
            disabled={busy !== null}
            onClick={() =>
              void act("passkey", async () => {
                setAccount(await auth.createPasskey());
                setNotice("Passkey perangkat ini sudah ditambahkan.");
              })
            }
          >
            Tambah passkey di perangkat ini
          </Button>

          {emailLogin && !account?.email && (
            <>
              <Group header="Tambah email cadangan" footer="Kami kirim link sekali pakai. Setelah dibuka, email ini bisa dipakai untuk masuk.">
                <li className="ios-field">
                  <label htmlFor="acct-email">Email</label>
                  <input id="acct-email" type="email" inputMode="email" autoComplete="email" placeholder="nama@usaha.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </li>
              </Group>
              <Button
                kind="plain"
                icon={MailCheck}
                busy={busy === "email"}
                disabled={busy !== null || !email.includes("@")}
                onClick={() =>
                  void act("email", async () => {
                    await auth.sendEmailLink(email);
                    setNotice(`Link dikirim ke ${email.trim().toLowerCase()}. Buka di perangkat ini untuk menyambungkannya.`);
                  })
                }
              >
                Kirim link
              </Button>
            </>
          )}

          <Button
            kind="danger"
            icon={LogOut}
            busy={busy === "out"}
            disabled={busy !== null}
            onClick={() =>
              void act("out", async () => {
                await auth.signOut();
                window.location.assign("/?view=masuk");
              })
            }
          >
            Keluar
          </Button>
        </Screen>
      </div>
    </div>
  );
}
