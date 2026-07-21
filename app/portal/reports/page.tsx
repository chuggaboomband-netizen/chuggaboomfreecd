import Link from "next/link";
import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config-store";
import { formatPriceLabel } from "@/lib/funnel";
import {
  getReportOrders,
  getShopifyConnectionState,
  summarizeProductSales,
  summarizeWeeklyProfitLoss,
  totalProfitLoss,
} from "@/lib/reports";

export default async function ReportsPage() {
  if (!(await isAuthenticated())) {
    redirect("/portal");
  }

  const config = await readConfig();
  const shopifyState = await getShopifyConnectionState(config);
  const orders = await getReportOrders(config);
  const productSales = summarizeProductSales(orders);
  const weeklyProfitLoss = summarizeWeeklyProfitLoss(orders);
  const totalPnL = totalProfitLoss(orders);
  const isLive = shopifyState.status === "connected" && orders.some((order) => order.source === "shopify");
  const hasLiveConnection = shopifyState.status === "connected";

  return (
    <main className="section hero portal-surface">
      <div className="shell stack">
        <header className="site-header">
          <div>
            <span className="eyebrow">Reports</span>
            <h1 className="section-heading">Funnel Reporting</h1>
            <p className="microcopy">
              {isLive
                ? "Live Shopify funnel orders are now being pulled into this report using your configured discount code."
                : hasLiveConnection
                  ? "Shopify is connected. If the tables are still sparse, that usually means there are no matching orders yet for the tracked discount code."
                  : "This page can fall back to placeholder rows until Shopify reporting is fully connected."}
            </p>
          </div>
          <Link href="/portal/dashboard" className="button secondary">
            Back to portal
          </Link>
        </header>

        <section className="reports-grid">
          <article className="admin-card stack">
            <h2>Summary</h2>
            <div className="reports-summary-cards">
              <div className="summary-card">
                <strong>Total Profit/Loss</strong>
                <div className="reports-metric">{formatPriceLabel(totalPnL)}</div>
              </div>
              <div className="summary-card">
                <strong>Tracked discount code</strong>
                <div className="reports-metric-code">
                  {config.reporting?.reportDiscountCode || "FREECD"}
                </div>
              </div>
              <div className="summary-card">
                <strong>Default postage cost</strong>
                <div className="reports-metric">
                  {formatPriceLabel(Number(config.reporting?.defaultPostageCost?.replace(/[^0-9.]/g, "") || 0))}
                </div>
              </div>
            </div>
          </article>

          <article className="admin-card stack">
            <h2>Products sold</h2>
            <div className="reports-list">
              {productSales.length > 0 ? (
                productSales.map((item) => (
                  <div key={item.productName} className="reports-list-row">
                    <span>{item.productName}</span>
                    <strong>{item.quantity}</strong>
                  </div>
                ))
              ) : (
                <p className="microcopy">No orders yet.</p>
              )}
            </div>
          </article>
        </section>

        <section className="reports-grid">
          <article className="admin-card stack">
            <h2>Weekly Profit/Loss</h2>
            <div className="reports-list">
              {weeklyProfitLoss.length > 0 ? (
                weeklyProfitLoss.map((item) => (
                  <div key={item.weekStart} className="reports-list-row">
                    <span>{item.weekStart}</span>
                    <strong>{formatPriceLabel(item.profitLoss)}</strong>
                  </div>
                ))
              ) : (
                <p className="microcopy">Add weekly ad spend in the portal to seed reporting periods.</p>
              )}
            </div>
          </article>

          <article className="admin-card stack">
            <h2>Shopify connection status</h2>
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
                  ? "Shopify connected"
                  : shopifyState.status === "error"
                    ? "Shopify configured, but the API call failed"
                    : "Waiting for Shopify Admin API credentials"}
              </strong>
              <p className="microcopy">
                {shopifyState.message}
              </p>
            </div>
          </article>
        </section>

        <section className="admin-card stack">
          <h2>Order list</h2>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Stock</th>
                  <th>Revenue</th>
                  <th>Unit cost</th>
                  <th>Postage</th>
                  <th>Weekly ad spend</th>
                  <th>Profit/Loss</th>
                </tr>
              </thead>
              <tbody>
                {orders.length > 0 ? (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderNumber}</td>
                      <td>{order.purchasedAt}</td>
                      <td>
                        <div className="reports-item-stack">
                          {order.items.map((item) => (
                            <div key={`${order.id}-${item.productName}`} className="reports-item-line">
                              <span>{item.productName}</span>
                              <span>x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="reports-item-stack">
                          {order.items.map((item) => (
                            <div key={`${order.id}-${item.productName}-stock`} className="reports-item-line">
                              <span>{item.productName}</span>
                              <span>{item.stockOnHand ?? "—"}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>{formatPriceLabel(order.revenue)}</td>
                      <td>{formatPriceLabel(order.unitCostTotal)}</td>
                      <td>{formatPriceLabel(order.postageCost)}</td>
                      <td>{formatPriceLabel(order.adSpendAllocated)}</td>
                      <td>{formatPriceLabel(order.profitLoss)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="reports-empty">
                      No qualifying orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
