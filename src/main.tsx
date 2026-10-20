import "./styles.css";
import "./owner/owner.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppsDirectory } from "./Apps";
import { AccountPage } from "./auth/AccountPage";
import { auth, emailLinkToken, watchForSignOut } from "./auth/session";
import { SignIn } from "./auth/SignIn";

const view = () => new URLSearchParams(window.location.search).get("view");

/** Everything sits behind a session: signed out (or back from an email link), the sign-in page shows. */
function Root() {
  const [state, setState] = useState<{ signedIn: boolean | null; emailLogin: boolean }>({ signedIn: null, emailLogin: false });

  useEffect(() => {
    watchForSignOut(() => setState((s) => ({ ...s, signedIn: false })));
    void auth.me().then((r) => setState({ signedIn: Boolean(r.account) && !emailLinkToken(), emailLogin: r.emailLogin }));
  }, []);

  if (state.signedIn === null) return <div className="auth-splash" aria-busy="true" />;
  if (!state.signedIn || view() === "masuk") {
    if (state.signedIn && view() === "masuk") window.history.replaceState(null, "", "/?view=studio");
    else
      return (
        <SignIn
          emailLogin={state.emailLogin}
          onSignedIn={() => {
            if (view() === "masuk" || !view()) window.history.replaceState(null, "", "/?view=studio");
            setState((s) => ({ ...s, signedIn: true }));
          }}
        />
      );
  }
  // ?view=apps and ?view=akun are kept outside App so the studio layout stays its own.
  if (view() === "apps") return <AppsDirectory />;
  if (view() === "akun") return <AccountPage />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// The owner app installs from the browser. The service worker only runs in production builds,
// so it never caches the dev server's modules.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
