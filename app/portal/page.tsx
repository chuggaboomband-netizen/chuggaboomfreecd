import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";

import { loginAction } from "./actions";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthenticated()) {
    redirect("/portal/dashboard");
  }

  const params = await searchParams;

  return (
    <main className="section hero portal-surface">
      <div className="shell" style={{ maxWidth: 560 }}>
        <section className="summary-card stack portal-login-card">
          <div>
            <span className="eyebrow">Private access</span>
            <h1 className="section-heading">Secret Portal</h1>
            <p className="microcopy">
              Log in with the admin password from your environment file to manage products, discounts, and Shopify permalinks without spreadsheets.
            </p>
          </div>

          {params.error ? <div className="banner warning">Incorrect password.</div> : null}

          <form action={loginAction} className="stack">
            <label className="field">
              <span>Password</span>
              <input type="password" name="password" placeholder="Enter admin password" required />
            </label>
            <button type="submit" className="button">
              Enter portal
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
