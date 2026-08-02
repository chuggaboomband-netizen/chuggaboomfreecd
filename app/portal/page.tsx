import { redirect } from "next/navigation";

import { getPortalSecurityState, isAuthenticated } from "@/lib/auth";

import { loginAction } from "./actions";
import { PendingSubmitButton } from "./pending-submit-button";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  if (await isAuthenticated()) {
    redirect("/portal/dashboard");
  }

  const params = await searchParams;
  const security = getPortalSecurityState();

  return (
    <main className="section hero portal-surface">
      <div className="shell" style={{ maxWidth: 560 }}>
        <section className="summary-card stack portal-login-card">
          <div>
            <span className="eyebrow">Private access</span>
            <h1 className="section-heading">Secret Portal</h1>
            <p className="microcopy">
              Log in with your admin credentials to manage products, discounts, Shopify permalinks, and reporting without spreadsheets.
            </p>
          </div>

          {params.notice ? <div className="banner">{params.notice}</div> : null}
          {params.error ? <div className="banner warning">{params.error}</div> : null}

          <div className="microcopy">
            Username: <strong>{security.username}</strong>
            <br />
            {security.totpEnabled
              ? "Authenticator app protection is enabled for this portal."
              : "Authenticator app protection is not enabled yet. Add ADMIN_TOTP_SECRET to turn on 2FA."}
          </div>

          <form action={loginAction} className="stack">
            <label className="field">
              <span>Username</span>
              <input name="username" defaultValue={security.username} placeholder="Enter admin username" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" name="password" placeholder="Enter admin password" required />
            </label>
            {security.totpEnabled ? (
              <label className="field">
                <span>Authenticator code</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="otp"
                  placeholder="123456"
                  maxLength={6}
                  required
                />
              </label>
            ) : null}
            <PendingSubmitButton pendingLabel="Entering portal...">
              Enter portal
            </PendingSubmitButton>
          </form>
        </section>
      </div>
    </main>
  );
}
