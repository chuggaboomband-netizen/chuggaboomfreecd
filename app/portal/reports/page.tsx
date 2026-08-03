import Link from "next/link";
import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config-store";
import { formatPriceLabel } from "@/lib/funnel";
import {
  buildProfitTimeline,
  getAdSpendEntries,
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
  const adSpendEntries = [...getAdSpendEntries(config)].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const profitTimeline = buildProfitTimeline(config, orders);
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
                ? "Live Shopify funnel orders are being pulled into this report using your configured tracking rule. For privacy, customer data is no longer cached in the repo-backed config store."
                : hasLiveConnection
                  ? "Shopify is connected. If the tables are still sparse, that usually means there are no matching orders yet for the tracked SKU or discount code, or that older history needs a fresh live pull."
                : "This page can fall back to placeholder rows until Shopify reporting is fully connected."}
            </p>
          </div>
          <div className="portal-header-actions">
            <a href="/portal/reports/export" className="button">
              Export CSV
            </a>
            <Link href="/portal/dashboard" className="button secondary">
              Back to portal
            </Link>
          </div>
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
                <strong>{config.reporting?.trackedProductSku ? "Tracked SKU" : "Tracked discount code"}</strong>
                <div className="reports-metric-code">
                  {config.reporting?.trackedProductSku || config.reporting?.reportDiscountCode || "FREECD"}
                </div>
              </div>
              <div className="summary-card">
                <strong>Total ad spend</strong>
                <div className="reports-metric">
                  {formatPriceLabel(Number(config.reporting?.totalAdSpend?.replace(/[^0-9.]/g, "") || 0))}
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
                    <span className="portal-list-item-stack">
                      <strong>{item.productName}</strong>
                      <span className="microcopy">
                        Available stock: {item.availableStock ?? "—"}
                      </span>
                    </span>
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
            <h2>Profit over time</h2>
            {profitTimeline.length > 1 ? (
              <ProfitTimelineChart points={profitTimeline} />
            ) : (
              <p className="microcopy">Add orders and ad spend snapshots to build the graph.</p>
            )}
          </article>

          <article className="admin-card stack">
            <h2>Ad spend log</h2>
            <div className="reports-list reports-list-scroll">
              {adSpendEntries.length > 0 ? (
                adSpendEntries.map((entry) => (
                  <div key={entry.id} className="reports-list-row">
                    <span className="portal-list-item-stack">
                      <strong>{formatPortalDateTime(entry.recordedAt)}</strong>
                      <span className="microcopy">{entry.notes || "No note"}</span>
                    </span>
                    <strong>{entry.totalAmount}</strong>
                  </div>
                ))
              ) : (
                <p className="microcopy">No ad spend snapshots yet.</p>
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
                <p className="microcopy">Tracked July 2026 orders will appear here once Shopify pulls them in.</p>
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
          <div className="reports-table-wrap reports-table-scroll">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Available</th>
                  <th>Revenue</th>
                  <th>Unit cost</th>
                  <th>Postage</th>
                  <th>Allocated ad spend</th>
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
                              <span>{item.availableStock ?? "—"}</span>
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

function ProfitTimelineChart({
  points,
}: {
  points: ReturnType<typeof buildProfitTimeline>;
}) {
  const width = 760;
  const height = 260;
  const padding = 24;
  const values = points.map((point) => point.netProfit);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);
  const valueRange = maxValue - minValue || 1;
  const denominator = Math.max(points.length - 1, 1);

  const coordinates = points.map((point, index) => {
    const x = padding + ((width - padding * 2) * index) / denominator;
    const y =
      height - padding - ((point.netProfit - minValue) / valueRange) * (height - padding * 2);

    return { x, y, point };
  });

  const path = coordinates
    .map((coordinate, index) =>
      `${index === 0 ? "M" : "L"} ${coordinate.x.toFixed(2)} ${coordinate.y.toFixed(2)}`,
    )
    .join(" ");

  const zeroY =
    height - padding - ((0 - minValue) / valueRange) * (height - padding * 2);

  const latestPoint = points[points.length - 1];

  return (
    <div className="reports-chart-card">
      <div className="reports-chart-meta">
        <strong>Latest net profit: {formatPriceLabel(latestPoint.netProfit)}</strong>
        <span className="microcopy">
          Latest tracked ad spend: {formatPriceLabel(latestPoint.cumulativeAdSpend)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="reports-chart"
        role="img"
        aria-label="Profit over time graph"
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={zeroY}
          y2={zeroY}
          className="reports-chart-zero"
        />
        <path d={path} className="reports-chart-line" />
        {coordinates.map(({ x, y, point }, index) => (
          <g key={`${point.timestamp}-${index}`}>
            <circle
              cx={x}
              cy={y}
              r="4"
              className={point.kind === "ad-spend" ? "reports-chart-dot is-spend" : "reports-chart-dot is-order"}
            />
            <title>
              {`${formatPortalDateTime(point.timestamp)} - ${formatPriceLabel(point.netProfit)}`}
            </title>
          </g>
        ))}
      </svg>
      <div className="reports-chart-labels">
        <span>{formatPortalDateTime(points[0].timestamp)}</span>
        <span>{formatPortalDateTime(latestPoint.timestamp)}</span>
      </div>
    </div>
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
