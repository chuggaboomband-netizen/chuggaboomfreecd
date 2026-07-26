import Link from "next/link";
import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config-store";
import { formatPriceLabel, sortProducts } from "@/lib/funnel";
import {
  getReportOrders,
  getShopifyConnectionState,
  summarizeProductSales,
  totalProfitLoss,
} from "@/lib/reports";

import {
  addAdSpendEntryAction,
  addDiscountAction,
  deleteAdSpendEntryAction,
  deleteDiscountAction,
  logoutAction,
  saveCampaignAction,
  saveReportingAction,
  updateDiscountAction,
} from "../actions";
import { PortalLinkBuilder } from "./portal-link-builder";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; saved?: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/portal");
  }

  const config = await readConfig();
  const shopifyState = await getShopifyConnectionState(config);
  const orders = await getReportOrders(config);
  const productSales = summarizeProductSales(orders);
  const totalPnL = totalProfitLoss(orders);
  const topProduct = productSales[0];
  const products = sortProducts(config.products);
  const discounts = [...config.discounts].sort((a, b) => b.priority - a.priority);
  const adSpendEntries = [...(config.reporting?.adSpendEntries || [])].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  );
  const params = searchParams ? await searchParams : undefined;

  return (
    <main className="section hero portal-surface">
      <div className="shell stack">
        <header className="site-header">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="section-heading">Campaign Control Room</h1>
          </div>
          <div className="portal-header-actions">
            <Link href="/portal/upsells" className="button">
              Manage upsells
            </Link>
            <Link href="/portal/reports" className="button">
              View reports
            </Link>
            <a href="/portal/reports/export" className="button secondary">
              Export CSV
            </a>
            <form action={logoutAction}>
              <button type="submit" className="button secondary">
                Log out
              </button>
            </form>
          </div>
        </header>

        {params?.saved ? (
          <div className="banner">Changes saved.</div>
        ) : null}

        {params?.error ? (
          <div className="banner warning">{params.error}</div>
        ) : null}

        <section className="portal-quick-grid">
          <article className="summary-card portal-quick-card">
            <span className="portal-quick-label">Shopify status</span>
            <strong className="portal-quick-value">
              {shopifyState.status === "connected" ? "Connected" : "Attention needed"}
            </strong>
            <p className="microcopy">
              {shopifyState.status === "connected"
                ? "Reports are pulling from Shopify."
                : shopifyState.message}
            </p>
          </article>
          <article className="summary-card portal-quick-card">
            <span className="portal-quick-label">Tracked orders</span>
            <strong className="portal-quick-value">{orders.length}</strong>
            <p className="microcopy">
              {config.reporting?.trackedProductSku
                ? `Orders containing SKU ${config.reporting.trackedProductSku}.`
                : `Orders matched to ${config.reporting?.reportDiscountCode || "FREECD"}.`}
            </p>
          </article>
          <article className="summary-card portal-quick-card">
            <span className="portal-quick-label">Total profit/loss</span>
            <strong className="portal-quick-value">{formatPriceLabel(totalPnL)}</strong>
            <p className="microcopy">Calculated from products, postage, and ad spend.</p>
          </article>
          <article className="summary-card portal-quick-card">
            <span className="portal-quick-label">Top seller</span>
            <strong className="portal-quick-value">
              {topProduct ? `${topProduct.productName} (${topProduct.quantity})` : "No sales yet"}
            </strong>
            <p className="microcopy">Compact snapshot before you dive into the full report.</p>
          </article>
        </section>

        <section className="admin-card stack">
          <div>
            <h2>Campaign settings</h2>
            <p className="microcopy">
              These values drive the public landing page copy.
            </p>
          </div>

          <form action={saveCampaignAction} className="stack">
            <div className="field-grid">
              <label className="field">
                <span>Band name</span>
                <input name="bandName" defaultValue={config.campaign.bandName} required />
              </label>
              <label className="field">
                <span>Headline</span>
                <input name="headline" defaultValue={config.campaign.headline} required />
              </label>
              <label className="field">
                <span>Hero note</span>
                <input name="heroNote" defaultValue={config.campaign.heroNote} required />
              </label>
              <label className="field">
                <span>Shipping label</span>
                <input name="shippingLabel" defaultValue={config.campaign.shippingLabel} required />
              </label>
              <label className="field">
                <span>Shipping price</span>
                <input name="shippingPrice" defaultValue={config.campaign.shippingPrice} required />
              </label>
              <label className="field">
                <span>CTA label</span>
                <input name="startButtonLabel" defaultValue={config.campaign.startButtonLabel} required />
              </label>
              <label className="field">
                <span>Shopify store host</span>
                <input
                  name="shopifyStoreHost"
                  defaultValue={config.campaign.shopifyStoreHost}
                  placeholder="shop.chuggaboom.com"
                  required
                />
              </label>
            </div>

            <label className="field">
              <span>Subheadline</span>
              <textarea name="subheadline" defaultValue={config.campaign.subheadline} required />
            </label>

            <button type="submit" className="button">
              Save campaign copy
            </button>
          </form>
        </section>

        <section className="admin-grid portal-admin-grid">
          <div className="admin-card stack">
            <div className="report-header-row">
              <div>
                <h2>Products and upsells</h2>
                <p className="microcopy">
                  Product editing, images, upsell copy, and live funnel selection now live on their own page so the portal stays easier to navigate.
                </p>
              </div>
              <Link href="/portal/upsells" className="button">
                Open upsell manager
              </Link>
            </div>
            <div className="portal-live-list">
              {products.map((product) => (
                <div key={product.id} className="reports-list-row">
                  <span>
                    {product.name}{" "}
                    <span className="microcopy">
                      ({product.type === "core" ? "Core" : "Upsell"})
                    </span>
                  </span>
                  <strong>{product.activeInFunnel === false ? "Stored only" : "Live in funnel"}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-card stack discounts-panel">
            <div>
              <h2>Discounts</h2>
              <p className="microcopy">
                Codes can now be edited in place. If you rename a discount code here, linked product auto-discount references will update with it.
              </p>
            </div>

            <div className="stack">
              {discounts.map((discount) => (
                <div key={discount.id} className="summary-card stack discount-card">
                  <form action={updateDiscountAction} className="stack">
                    <input type="hidden" name="id" value={discount.id} />
                    <label className="field">
                      <span>Discount name</span>
                      <input name="name" defaultValue={discount.name} required />
                    </label>
                    <label className="field">
                      <span>Discount code</span>
                      <input name="code" defaultValue={discount.code} required />
                    </label>
                    <label className="field">
                      <span>Priority</span>
                      <input name="priority" type="number" defaultValue={String(discount.priority)} required />
                    </label>
                    <div className="discount-actions">
                      <button type="submit" className="button">
                        Save discount
                      </button>
                    </div>
                  </form>
                  <form action={deleteDiscountAction}>
                    <input type="hidden" name="id" value={discount.id} />
                    <button type="submit" className="button secondary">
                      Remove discount
                    </button>
                  </form>
                </div>
              ))}
            </div>

            <form action={addDiscountAction} className="stack discount-create-form">
              <label className="field">
                <span>Discount name</span>
                <input name="name" required />
              </label>
              <label className="field">
                <span>Discount code</span>
                <input name="code" placeholder="FREECD100" required />
              </label>
              <label className="field">
                <span>Priority</span>
                <input name="priority" type="number" defaultValue="10" required />
              </label>
              <div className="discount-actions">
                <button type="submit" className="button">
                  Add discount
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="admin-card stack">
          <div>
            <h2>Reporting settings</h2>
            <p className="microcopy">
              These values feed the reports page so you can track advertising spend and profitability once Shopify order sync is connected. Live order postage is pulled from each product&apos;s own postage cost.
            </p>
          </div>

          <div
            className={`reports-status-box ${
              shopifyState.status === "connected"
                ? "is-success"
                : shopifyState.status === "error"
                  ? "is-error"
                  : "is-waiting"
            }`}
          >
            <strong>
              {shopifyState.status === "connected"
                ? "Shopify reporting is connected"
                : shopifyState.status === "error"
                  ? "Shopify credentials exist, but the API call failed"
                  : "Shopify credentials are not available to this deployment yet"}
            </strong>
            <p className="microcopy">{shopifyState.message}</p>
          </div>

          <form action={saveReportingAction} className="stack">
            <div className="field-grid">
              <label className="field">
                <span>Report discount code</span>
                <input
                  name="reportDiscountCode"
                  defaultValue={config.reporting?.reportDiscountCode || "FREECD"}
                  placeholder="FREECD"
                  required
                />
              </label>
              <label className="field">
                <span>Tracked product SKU</span>
                <input
                  name="trackedProductSku"
                  defaultValue={config.reporting?.trackedProductSku || ""}
                  placeholder="FREE-CD-ESSENTIALS"
                />
              </label>
              <label className="field">
                <span>Fallback postage cost</span>
                <input
                  name="defaultPostageCost"
                  defaultValue={config.reporting?.defaultPostageCost || ""}
                  placeholder="£4.99"
                />
              </label>
              <label className="field">
                <span>Total ad spend</span>
                <input
                  name="totalAdSpend"
                  defaultValue={config.reporting?.adSpendEntries?.[config.reporting.adSpendEntries.length - 1]?.totalAmount || config.reporting?.totalAdSpend || ""}
                  placeholder="£500"
                  readOnly
                />
              </label>
            </div>
            <input type="hidden" name="weeklyAdSpend" value="" />

            <p className="microcopy">
              Fallback postage is only used when a product does not have its own postage cost set. If a tracked SKU is filled in here, reports will use that instead of relying on the discount code field. The total ad spend shown here comes from the latest entry in your ad spend log below.
            </p>

            <button type="submit" className="button">
              Save reporting settings
            </button>
          </form>

          <div className="summary-card stack">
            <div>
              <h3>Ad spend log</h3>
              <p className="microcopy">
                Enter the total amount spent so far. Each save adds a timestamped snapshot, so we can chart profit against ad spend over time.
              </p>
            </div>

            <form action={addAdSpendEntryAction} className="stack">
              <div className="field-grid">
                <label className="field">
                  <span>Total spent so far</span>
                  <input name="totalAmount" placeholder="£500" required />
                </label>
                <label className="field">
                  <span>Notes</span>
                  <input name="notes" placeholder="Weekend Meta push" />
                </label>
              </div>
              <button type="submit" className="button">
                Add ad spend snapshot
              </button>
            </form>

            <div className="reports-list">
              {adSpendEntries.length > 0 ? (
                adSpendEntries.map((entry) => (
                  <div key={entry.id} className="reports-list-row">
                    <span className="portal-list-item-stack">
                      <strong>{formatPortalDateTime(entry.recordedAt)}</strong>
                      <span className="microcopy">{entry.notes || "No note"}</span>
                    </span>
                    <span className="portal-inline-actions">
                      <strong>{entry.totalAmount}</strong>
                      <form action={deleteAdSpendEntryAction}>
                        <input type="hidden" name="id" value={entry.id} />
                        <button type="submit" className="button secondary button-small">
                          Remove
                        </button>
                      </form>
                    </span>
                  </div>
                ))
              ) : (
                <p className="microcopy">No ad spend snapshots yet.</p>
              )}
            </div>
          </div>
        </section>

        <section className="admin-card stack">
          <div className="report-header-row">
            <div>
              <h2>Reports</h2>
              <p className="microcopy">
                The reporting dashboard is ready. Once Shopify credentials are added, this will pull live funnel orders and calculate sales, stock, and profitability.
              </p>
            </div>
            <a href="/portal/reports" className="button">
              Open reports
            </a>
          </div>
        </section>

        <PortalLinkBuilder
          storeHost={config.campaign.shopifyStoreHost}
          products={products}
          discounts={discounts}
        />
      </div>
    </main>
  );
}

function formatPortalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}
